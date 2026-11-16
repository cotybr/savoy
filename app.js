/* =========================================================================
 *  Chatbot RH — Fábrica (GitHub Pages + Supabase + PDF.js)
 *  Autor: Engenheiro de Software Sênior (AppSec / LGPD)
 *  Segurança: sem service_role; RLS estrito; sanitização anti-XSS.
 * ========================================================================= */

'use strict';

/* -------------------------------------------------------------------------
 * 0. CONSTANTES E UTILITÁRIOS
 * ----------------------------------------------------------------------- */
const STORAGE_KEYS = Object.freeze({
  CONSENT: 'chatbot_rh_consent_v1',
  SESSION: 'chatbot_rh_session_v1',
  MATRICULA: 'chatbot_rh_matricula_v1'
});

const TIPOS_VALIDOS = Object.freeze([
  'consulta_horas', 'ajuste_ponto', 'duvida_rh', 'alocacao_linha'
]);

/**
 * Sanitiza entrada do usuário contra XSS.
 * Retorna texto seguro para inserção via textContent (nunca innerHTML).
 */
function sanitizeText(input, maxLen = 500) {
  if (typeof input !== 'string') return '';
  // Remove caracteres de controle, tags HTML e normaliza espaços.
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')   // control chars
    .replace(/<[^>]*>/g, '')                  // strip tags
    .replace(/[<>]/g, '')                     // sobrescrita defensiva
    .trim()
    .slice(0, maxLen);
}

/** Valida matrícula (formato alfanumérico, 3-20 chars). */
function isValidMatricula(m) {
  return typeof m === 'string' && /^[A-Za-z0-9]{3,20}$/.test(m);
}

/** Valida nome (3-120 chars, letras + espaços + acentos). */
function isValidNome(n) {
  return typeof n === 'string' && /^[\p{L}\s'.-]{3,120}$/u.test(n.trim());
}

/** Wrapper seguro para inserir texto no DOM (evita innerHTML). */
function appendMessage(logEl, text, variant = 'bot') {
  const div = document.createElement('div');
  div.className = `msg ${variant}`;
  div.textContent = text; // seguro por padrão
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

/* -------------------------------------------------------------------------
 * 1. CLASSES BASE OBRIGATÓRIAS (mantidas exatamente)
 * ----------------------------------------------------------------------- */
class Linha {
    constructor(numero, setor) {
        this.numero = numero;
        this.setor = setor;
        this.colaboradores = [];
    }

    alocar(colaborador) {
        const alocado = this.colaboradores.some(c => c.matricula === colaborador.matricula);
        if (!alocado) {
            this.colaboradores.push(colaborador);
            return `${colaborador.nome.split(' ')[0]} alocado com sucesso nesta linha.`;
        } else {
            return `${colaborador.nome.split(' ')[0]} já alocado nesta linha.`;
        }
    }

    realocar(colaborador, destino) {
        const index = this.colaboradores.findIndex(c => c.matricula === colaborador.matricula);
        if (index !== -1) {
            this.colaboradores.splice(index, 1);
            destino.alocar(colaborador);
            return `${colaborador.nome.split(' ')[0]} realocado para a linha ${destino.numero}.`;
        } else {
            return `${colaborador.nome.split(' ')[0]} não encontrado nesta linha.`;
        }
    }

    modAlocada() {
        return this.colaboradores;
    }
}

class Colaborador {
    constructor(nome, cargo, setor, matricula, funcao) {
        this.nome = nome;        
        this.cargo = cargo;
        this.setor = setor;
        this.matricula = matricula;
        this.funcao = funcao;
    }

    linha(linha) {
        this.linha = linha;
        return `${this.nome.split(' ')[0]} alocado na linha ${linha.numero}.`;
    }
}

/* -------------------------------------------------------------------------
 * 2. SUPABASE CLIENT (inicialização defensiva)
 * ----------------------------------------------------------------------- */
function createSupabaseClient() {
  const cfg = window.APP_CONFIG || {};
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[AppSec] Configuração do Supabase ausente. Verifique config.js.');
    return null;
  }
  // Verificações básicas de formato (não substituem RLS, apenas UX).
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)) {
    console.error('[AppSec] SUPABASE_URL inválida.');
    return null;
  }
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(SUPABASE_ANON_KEY)) {
    console.error('[AppSec] SUPABASE_ANON_KEY com formato inesperado.');
    return null;
  }

  // Não persiste sessão: cada atendimento é efêmero (privacy by design).
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

/* -------------------------------------------------------------------------
 * 3. FLUXO LGPD
 * ----------------------------------------------------------------------- */
function hasConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONSENT);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return obj && obj.accepted === true && typeof obj.timestamp === 'string';
  } catch { return false; }
}

function saveConsent() {
  localStorage.setItem(STORAGE_KEYS.CONSENT, JSON.stringify({
    accepted: true,
    timestamp: new Date().toISOString(),
    version: 1
  }));
}

function revokeConsent() {
  localStorage.removeItem(STORAGE_KEYS.CONSENT);
  localStorage.removeItem(STORAGE_KEYS.MATRICULA);
  sessionStorage.removeItem(STORAGE_KEYS.SESSION);
  location.reload();
}

/* -------------------------------------------------------------------------
 * 4. MÓDULO DE PDF (PDF.js) — leitura do banco de horas
 * ----------------------------------------------------------------------- */
class BancoHorasPDF {
  constructor(url) {
    this.url = url;
    this._doc = null;
  }

  async load() {
    if (this._doc) return this._doc;
    const pdfjsLib = await import(
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs'
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';

    const res = await fetch(this.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Falha ao carregar PDF (${res.status}).`);
    const buf = await res.arrayBuffer();
    this._doc = await pdfjsLib.getDocument({ data: buf }).promise;
    return this._doc;
  }

  /** Extrai texto de todas as páginas (limitado por segurança). */
  async extractText(maxPages = 20) {
    const doc = await this.load();
    const pages = Math.min(doc.numPages, maxPages);
    let out = '';
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map(it => it.str).join(' ') + '\n';
    }
    return out;
  }

  /** Busca por matrícula no texto extraído. */
  async findByMatricula(matricula) {
    if (!isValidMatricula(matricula)) return null;
    const text = await this.extractText();
    // Busca tolerante: linha contendo a matrícula.
    const lines = text.split('\n');
    const matches = lines.filter(l => l.includes(matricula));
    return matches.length ? matches.join('\n').slice(0, 1500) : null;
  }
}

/* -------------------------------------------------------------------------
 * 5. INTENÇÕES DO BOT (regras simples e determinísticas)
 * ----------------------------------------------------------------------- */
const intents = [
  {
    id: 'consulta_horas',
    test: /(banco de horas|quantas horas|saldo de horas|extrato)/i,
    reply: 'Para consultar seu banco de horas, informe sua matrícula (ex.: A12345).'
  },
  {
    id: 'ajuste_ponto',
    test: /(ajust(e|ar) (o )?ponto|corrigir (o )?ponto|esquec(i|eu) de bater)/i,
    reply: 'Para ajuste de ponto, informe matrícula e a data/hora do ajuste desejado.'
  },
  {
    id: 'duvida_rh',
    test: /(férias|ferias|benefício|beneficio|holerite|salário|salario)/i,
    reply: 'Posso registrar sua dúvida de RH. Descreva em uma frase o que você precisa.'
  },
  {
    id: 'alocacao_linha',
    test: /(linha|alocar|realocar|setor)/i,
    reply: 'Para alocação/realocação em linha, informe matrícula e linha de destino.'
  }
];

function detectIntent(text) {
  for (const it of intents) if (it.test.test(text)) return it;
  return null;
}

/* -------------------------------------------------------------------------
 * 6. ESTADO DE SESSÃO DO CHAT
 * ----------------------------------------------------------------------- */
const state = {
  supabase: null,
  pdf: null,
  intent: null,
  collected: { matricula: null, nome: null, mensagem: null }
};

/* -------------------------------------------------------------------------
 * 7. PERSISTÊNCIA NO SUPABASE (INSERT controlado)
 * ----------------------------------------------------------------------- */
async function persistSolicitacao({ matricula, nome, tipo, mensagem }) {
  // Validação final antes de enviar (defense in depth).
  if (!isValidMatricula(matricula)) throw new Error('Matrícula inválida.');
  if (!isValidNome(nome)) throw new Error('Nome inválido.');
  if (!TIPOS_VALIDOS.includes(tipo)) throw new Error('Tipo inválido.');
  const msg = sanitizeText(mensagem, 2000);
  if (!msg) throw new Error('Mensagem vazia após sanitização.');

  if (!state.supabase) throw new Error('Supabase não inicializado.');

  const { error } = await state.supabase
    .from('solicitacoes')
    .insert([{ matricula, nome, tipo, mensagem: msg }]);

  if (error) throw new Error(`Falha ao registrar: ${error.message}`);
  return true;
}

/* -------------------------------------------------------------------------
 * 8. BOOTSTRAP DA UI
 * ----------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const overlay   = document.getElementById('lgpd-overlay');
  const app       = document.getElementById('app');
  const chatLog   = document.getElementById('chat-log');
  const form      = document.getElementById('chat-form');
  const input     = document.getElementById('chat-input');
  const btnAceitar = document.getElementById('btn-aceitar');
  const btnRejeitar = document.getElementById('btn-rejeitar');
  const btnLogout = document.getElementById('btn-logout');

  /* -- LGPD gate -- */
  if (hasConsent()) {
    overlay.hidden = true;
    app.hidden = false;
    initApp();
  } else {
    overlay.hidden = false;
    app.hidden = true;
  }

  btnAceitar.addEventListener('click', () => {
    saveConsent();
    overlay.hidden = true;
    app.hidden = false;
    initApp();
  });

  btnRejeitar.addEventListener('click', () => {
    appendMessage(chatLog, 'Consentimento recusado. O atendimento não pode prosseguir.', 'system');
    overlay.hidden = true;
  });

  btnLogout.addEventListener('click', revokeConsent);

  /* -- Envio de mensagem -- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = input.value;
    const clean = sanitizeText(raw, 500);
    if (!clean) { input.value = ''; return; }

    appendMessage(chatLog, clean, 'user');
    input.value = '';

    try {
      await handleUserMessage(clean, chatLog);
    } catch (err) {
      console.error(err);
      appendMessage(chatLog, '⚠️ Ocorreu um erro. Tente novamente.', 'system');
    }
  });

  function initApp() {
    state.supabase = createSupabaseClient();
    state.pdf = new BancoHorasPDF(
      (window.APP_CONFIG && window.APP_CONFIG.PDF_URL) || './bancodehoras.pdf'
    );

    if (!state.supabase) {
      appendMessage(chatLog, '⚠️ Configuração do servidor ausente. Contate o TI.', 'system');
      return;
    }
    appendMessage(chatLog,
      'Olá! Sou o assistente de RH da fábrica. Posso ajudar com banco de horas, ' +
      'ajuste de ponto, dúvidas de RH e alocação em linhas. Como posso ajudar?',
      'bot'
    );
  }

  /* -- Fluxo conversacional -- */
  async function handleUserMessage(text, logEl) {
    const intent = detectIntent(text);

    // 1) Ainda não coletamos matrícula
    if (!state.collected.matricula) {
      if (isValidMatricula(text)) {
        state.collected.matricula = text;
        localStorage.setItem(STORAGE_KEYS.MATRICULA, text);
        appendMessage(logEl, 'Matrícula registrada. Agora informe seu nome completo.', 'bot');
      } else {
        appendMessage(logEl, 'Por favor, informe sua matrícula (3-20 caracteres alfanuméricos).', 'bot');
      }
      return;
    }

    // 2) Ainda não coletamos nome
    if (!state.collected.nome) {
      if (isValidNome(text)) {
        state.collected.nome = text.trim();
        appendMessage(logEl, 'Obrigado! Qual é a sua solicitação?', 'bot');
      } else {
        appendMessage(logEl, 'Nome inválido. Informe nome e sobrenome (apenas letras).', 'bot');
      }
      return;
    }

    // 3) Intenção + resposta final
    if (intent) {
      state.intent = intent.id;
      appendMessage(logEl, intent.reply, 'bot');

      // Exemplo especial: consulta de horas usa o PDF.
      if (intent.id === 'consulta_horas') {
        try {
          const found = await state.pdf.findByMatricula(state.collected.matricula);
          appendMessage(
            logEl,
            found
              ? `Encontrei no banco de horas:\n${found}`
              : 'Não localizei sua matrícula no PDF do banco de horas. Vou registrar sua solicitação para o RH.',
            'bot'
          );
        } catch {
          appendMessage(logEl, 'Não consegui ler o PDF agora. Vou registrar sua solicitação.', 'bot');
        }
      }

      // Persiste a solicitação no Supabase
      const mensagemFinal = sanitizeText(text, 2000);
      try {
        await persistSolicitacao({
          matricula: state.collected.matricula,
          nome: state.collected.nome,
          tipo: intent.id,
          mensagem: mensagemFinal
        });
        appendMessage(logEl, '✅ Solicitação registrada com segurança. O RH entrará em contato.', 'system');
      } catch (err) {
        appendMessage(logEl, `⚠️ ${err.message}`, 'system');
      }

      // Reset para próxima solicitação (mantém identidade)
      state.intent = null;
      return;
    }

    // 4) Sem intenção reconhecida → registra como dúvida genérica
    try {
      await persistSolicitacao({
        matricula: state.collected.matricula,
        nome: state.collected.nome,
        tipo: 'duvida_rh',
        mensagem: sanitizeText(text, 2000)
      });
      appendMessage(logEl, 'Registrei sua mensagem como dúvida de RH. Em breve retornaremos.', 'bot');
    } catch (err) {
      appendMessage(logEl, `⚠️ ${err.message}`, 'system');
    }
  }
});