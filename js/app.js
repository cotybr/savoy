import { initLGPDModal, hasConsent } from './lgpd.js';
import { bootstrapLinhas, handleMessage } from './chatbot.js';
import { sanitizeText, renderMessage } from './security.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

(async function main() {
    // 1) Consentimento LGPD — bloqueia até aceite
    const ok = await initLGPDModal();
    if (!ok) {
        document.body.innerHTML = '<p style="text-align:center;margin-top:3rem">Acesso encerrado: consentimento negado.</p>';
        return;
    }

    // 2) Inicializa estado
    bootstrapLinhas();
    document.getElementById('chat-container').style.display = 'block';

    // 3) Sessão mínima — apenas timestamp pseudonimizado
    const badge = document.getElementById('session-badge');
    badge.textContent = 'sessão segura';

    // 4) Bind do chat
    const messagesEl = document.getElementById('messages');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('user-input');

    renderMessage(messagesEl,
        '👋 Bem-vindo! Sou o assistente industrial. Digite "ajuda" para começar.', 'bot');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const raw = input.value;
        const clean = sanitizeText(raw);
        if (!clean) return;
        renderMessage(messagesEl, clean, 'user');   // render seguro
        input.value = '';
        input.focus();
        await handleMessage(clean, messagesEl);
    });

    // 5) Cleanup ao sair — remove dados de sessão (LGPD)
    window.addEventListener('beforeunload', () => {
        // sessionStorage é limpo automaticamente pelo navegador,
        // mas garantimos explicitamente:
        try { sessionStorage.removeItem('matricula_cache'); } catch {}
    });
})();