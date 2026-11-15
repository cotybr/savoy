import { sanitizeText, isValidMatricula, renderMessage, rateLimit, hashMatricula } from './security.js';
import { fetchEPIByMatricula, fetchBancoHoras } from './supabaseClient.js';
import { Linha, Colaborador } from './models.js';

// Estado em memória (não persistir matrícula crua)
const state = {
    matricula: null,
    matriculaHash: null,
    linhas: new Map(),
    colaborador: null
};

export function bootstrapLinhas() {
    // Exemplo: linhas de produção
    state.linhas.set('1', new Linha('1', 'Montagem'));
    state.linhas.set('2', new Linha('2', 'Solda'));
    state.linhas.set('3', new Linha('3', 'Pintura'));
}

/**
 * Ponto de entrada: processa UMA mensagem do usuário.
 * Retorna string de resposta (já sanitizada na renderização).
 */
export async function handleMessage(rawInput, messagesEl) {
    if (!rateLimit()) {
        renderMessage(messagesEl, '⏳ Muitas mensagens em pouco tempo. Aguarde.', 'error');
        return;
    }

    const input = sanitizeText(rawInput);
    if (!input) return;

    const intent = detectIntent(input);

    try {
        switch (intent) {
            case 'saudacao':
                return respond(messagesEl,
                    'Olá! Sou o assistente industrial. Posso consultar: EPI, banco de horas, alocação em linha. Digite "ajuda" para ver os comandos.');

            case 'ajuda':
                return respond(messagesEl, helpText());

            case 'epi':
            case 'banco_horas': {
                const mat = extractMatricula(input) || state.matricula;
                if (!mat || !isValidMatricula(mat)) {
                    return respond(messagesEl,
                        '⚠️ Informe uma matrícula válida (4 a 12 caracteres alfanuméricos). Ex.: "EPI 12345".');
                }
                state.matricula = mat.toUpperCase();
                state.matriculaHash = await hashMatricula(state.matricula);

                if (intent === 'epi') {
                    const rows = await fetchEPIByMatricula(state.matricula);
                    if (!rows.length) return respond(messagesEl,
                        `Nenhuma requisição de EPI encontrada para a matrícula ${state.matricula}.`);
                    const linhas = rows.map(r =>
                        `• ${r.tipo_epi} — ${new Date(r.data_requisicao).toLocaleDateString('pt-BR')} — ${r.status}`);
                    return respond(messagesEl, `📋 Requisições de EPI (${state.matricula}):\n${linhas.join('\n')}`);
                } else {
                    const bh = await fetchBancoHoras(state.matricula);
                    if (!bh) return respond(messagesEl,
                        `Sem registro de banco de horas para ${state.matricula}.`);
                    const h = Math.floor(bh.saldo_minutos / 60);
                    const m = bh.saldo_minutos % 60;
                    return respond(messagesEl,
                        `⏱️ Banco de horas de ${state.matricula}: ${bh.saldo_minutos >= 0 ? '+' : ''}${h}h${Math.abs(m)}min`);
                }
            }

            case 'alocar': {
                // Ex.: "alocar 12345 na linha 2"
                const match = input.match(/alocar\s+([A-Z0-9]{4,12})\s+(?:na\s+)?linha\s+(\d+)/i);
                if (!match) return respond(messagesEl,
                    'Formato: "alocar MATRICULA na linha N". Ex.: alocar 12345 na linha 2');
                const [, mat, num] = match;
                if (!isValidMatricula(mat)) return respond(messagesEl, 'Matrícula inválida.');
                const linha = state.linhas.get(num);
                if (!linha) return respond(messagesEl, `Linha ${num} inexistente.`);

                // Reutiliza Colaborador existente ou cria placeholder
                let col = state.colaborador && state.colaborador.matricula === mat.toUpperCase()
                    ? state.colaborador
                    : new Colaborador('Colaborador ' + mat, 'Operador', linha.setor, mat.toUpperCase(), 'Produção');

                const msg = linha.alocar(col);
                return respond(messagesEl, msg);
            }

            case 'realocar': {
                const match = input.match(/realocar\s+([A-Z0-9]{4,12})\s+da\s+linha\s+(\d+)\s+para\s+(?:a\s+)?linha\s+(\d+)/i);
                if (!match) return respond(messagesEl,
                    'Formato: "realocar MATRICULA da linha X para linha Y".');
                const [, mat, orig, dest] = match;
                const lo = state.linhas.get(orig);
                const ld = state.linhas.get(dest);
                if (!lo || !ld) return respond(messagesEl, 'Linha de origem ou destino inválida.');
                const col = lo.colaboradores.find(c => c.matricula === mat.toUpperCase());
                if (!col) return respond(messagesEl, `Matrícula ${mat} não está na linha ${orig}.`);
                return respond(messagesEl, lo.realocar(col, ld));
            }

            case 'linha': {
                const num = (input.match(/linha\s+(\d+)/i) || [])[1];
                if (!num) return respond(messagesEl, 'Informe o número da linha.');
                const l = state.linhas.get(num);
                if (!l) return respond(messagesEl, `Linha ${num} inexistente.`);
                const cols = l.modAlocada();
                return respond(messagesEl,
                    `🏭 Linha ${l.numero} (${l.setor}) — ${cols.length} colaborador(es):\n` +
                    (cols.map(c => `• ${c.nome} (${c.matricula})`).join('\n') || '(vazia)'));
            }

            default:
                return respond(messagesEl,
                    'Não entendi. Digite "ajuda" para ver os comandos disponíveis.');
        }
    } catch (err) {
        // NUNCA exponha detalhes do erro ao usuário
        console.error('[chatbot]', err);
        return respond(messagesEl,
            '⚠️ Não foi possível concluir a operação. Tente novamente mais tarde.', 'error');
    }
}

// --- helpers internos ---------------------------------------------------

function respond(el, text, cls = 'bot') {
    renderMessage(el, text, cls);
}

function detectIntent(t) {
    const s = t.toLowerCase();
    if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií])/.test(s)) return 'saudacao';
    if (/ajuda|comandos|help/.test(s)) return 'ajuda';
    if (/realocar/.test(s)) return 'realocar';
    if (/alocar/.test(s)) return 'alocar';
    if (/\bepi\b/.test(s)) return 'epi';
    if (/banco de horas|horas/.test(s)) return 'banco_horas';
    if (/linha\s+\d+/.test(s)) return 'linha';
    return 'desconhecido';
}

function extractMatricula(t) {
    const m = t.match(/\b([A-Z0-9]{4,12})\b/i);
    return m ? m[1] : null;
}

function helpText() {
    return [
        '📖 Comandos disponíveis:',
        '• "EPI 12345" — consulta requisições de EPI',
        '• "banco de horas 12345" — saldo de horas',
        '• "alocar 12345 na linha 2" — aloca colaborador',
        '• "realocar 12345 da linha 1 para linha 3"',
        '• "linha 2" — lista colaboradores da linha',
        '',
        '🔒 Sua matrícula é usada apenas para consulta e não é armazenada em texto plano.'
    ].join('\n');
}