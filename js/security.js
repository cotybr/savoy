/**
 * Camada de segurança: sanitização, validação e helpers anti-XSS.
 * Toda string que vem do usuário DEVE passar por aqui antes de:
 *   - ser renderizada no DOM
 *   - ser enviada ao Supabase
 */

const MATRICULA_REGEX = /^[A-Z0-9]{4,12}$/i;
const ALLOWED_INTENTS = new Set([
    'epi', 'banco_horas', 'linha', 'alocar', 'realocar', 'ajuda', 'pdf', 'saudacao'
]);

/**
 * Sanitiza string removendo tags/entidades perigosas.
 * Estratégia: NUNCA usar innerHTML com input do usuário.
 * Esta função é uma camada extra de defesa em profundidade.
 */
export function sanitizeText(input, maxLen = 500) {
    if (typeof input !== 'string') return '';
    // Remove caracteres de controle
    let s = input.replace(/[\u0000-\u001F\u007F]/g, '');
    // Remove tags HTML/script
    s = s.replace(/<\/?[^>]+(>|$)/g, '');
    // Remove entidades maliciosas comuns
    s = s.replace(/javascript:/gi, '');
    s = s.replace(/on\w+\s*=/gi, '');
    // Limita tamanho (proteção contra DoS)
    return s.slice(0, maxLen).trim();
}

/**
 * Renderização SEGURA: sempre use textContent.
 */
export function renderMessage(container, text, cls = 'bot') {
    const div = document.createElement('div');
    div.className = `msg ${cls}`;
    div.textContent = text;   // <-- imune a XSS
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

export function isValidMatricula(m) {
    return typeof m === 'string' && MATRICULA_REGEX.test(m.trim());
}

export function isAllowedIntent(i) {
    return ALLOWED_INTENTS.has(i);
}

/**
 * Hash leve (SHA-256) para pseudonimizar a matrícula antes de armazenar em cache.
 * NUNCA armazena matrícula crua em localStorage.
 */
export async function hashMatricula(matricula) {
    const enc = new TextEncoder().encode(matricula + '::' + (window.__APP_PEPPER__ || ''));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rate limiting simples no cliente (defesa em profundidade — o backend
 * também deve limitar). Impede flood de mensagens.
 */
const rateBucket = { tokens: 10, last: Date.now() };
export function rateLimit() {
    const now = Date.now();
    const refill = Math.floor((now - rateBucket.last) / 1000); // 1 msg/s
    if (refill > 0) {
        rateBucket.tokens = Math.min(10, rateBucket.tokens + refill);
        rateBucket.last = now;
    }
    if (rateBucket.tokens <= 0) return false;
    rateBucket.tokens--;
    return true;
}