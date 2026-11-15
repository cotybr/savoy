#!/usr/bin/env node
/**
 * Substitui os placeholders %%VAR%% no /dist pelos valores
 * injetados pelo GitHub Actions a partir dos Secrets.
 *
 * Regras:
 *  - Falha se QUALQUER placeholder obrigatório não for encontrado
 *  - Falha se QUALQUER placeholder permanecer no output (variável não injetada)
 *  - NUNCA imprime valores de secrets nos logs
 *  - Escapa caracteres perigosos para uso seguro em JS string
 */
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = ROOT;
const DIST = join(ROOT, 'dist');

const REQUIRED = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_APP_PEPPER',
    'VITE_APP_ENV',
    'VITE_APP_VERSION',
    'VITE_MAX_INPUT_LENGTH',
    'VITE_RATE_LIMIT_TOKENS',
    'VITE_PDF_MAX_SIZE_MB',
    'VITE_PDF_MAX_PAGES'
];

// Validação: as variáveis injetadas devem existir no ambiente
function readEnv(name) {
    const val = process.env[name];
    if (val === undefined || val === '') {
        console.error(`[inject-env] ❌ Variável obrigatória ausente: ${name}`);
        process.exit(1);
    }
    return val;
}

// Escapa string para interpolação segura em JavaScript
function escapeForJs(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// Copia recursivamente ignorando pastas de dev
async function copyTree(src, dest) {
    await mkdir(dest, { recursive: true });
    for (const entry of await readdir(src)) {
        if (['node_modules', '.git', 'dist', '.github', 'scripts', 'sql'].includes(entry)) continue;
        if (entry.startsWith('.env')) continue;
        if (entry.endsWith('.md')) continue;
        if (entry === 'package.json' || entry === 'package-lock.json') continue;

        const s = join(src, entry);
        const d = join(dest, entry);
        const info = await stat(s);
        if (info.isDirectory()) {
            await copyTree(s, d);
        } else {
            await cp(s, d);
        }
    }
}

async function processFile(filePath) {
    let content = await readFile(filePath, 'utf8');
    let changed = false;

    for (const name of REQUIRED) {
        const placeholder = `%%${name}%%`;
        if (content.includes(placeholder)) {
            const rawValue = name.startsWith('VITE_SUPABASE') || name === 'VITE_APP_PEPPER'
                ? escapeForJs(readEnv(name))
                : readEnv(name); // números/env não precisam de escape
            content = content.split(placeholder).join(rawValue);
            changed = true;
        }
    }

    if (changed) {
        await writeFile(filePath, content, 'utf8');
        console.log(`[inject-env] ✔ ${filePath.replace(ROOT, '.')}`);
    }

    // Verificação final: nenhum placeholder %%...%% pode sobrar
    const leftovers = content.match(/%%[A-Z0-9_]+%%/g);
    if (leftovers) {
        console.error(`[inject-env] ❌ Placeholders não resolvidos em ${filePath}:`, leftovers);
        process.exit(1);
    }
}

async function main() {
    console.log('[inject-env] Iniciando build de produção...');
    console.log(`[inject-env] Ambiente: ${process.env.VITE_APP_ENV || 'undefined'}`);

    // 1) Pré-validação de TODAS as variáveis obrigatórias
    for (const name of REQUIRED) readEnv(name);

    // 2) Copia árvore para /dist
    await copyTree(SRC, DIST);

    // 3) Processa arquivos que contenham placeholders
    const walk = async (dir) => {
        for (const entry of await readdir(dir)) {
            const p = join(dir, entry);
            const info = await stat(p);
            if (info.isDirectory()) {
                await walk(p);
            } else if (['.html', '.js', '.css', '.json', '.webmanifest'].includes(extname(p))) {
                await processFile(p);
            }
        }
    };
    await walk(DIST);

    console.log('[inject-env] ✅ Build concluído em /dist');

    const configJs = `/* gerado automaticamente — não editar */
window.__SUPABASE_URL__      = "${escapeForJs(process.env.VITE_SUPABASE_URL)}";
window.__SUPABASE_ANON_KEY__ = "${escapeForJs(process.env.VITE_SUPABASE_ANON_KEY)}";
window.__APP_PEPPER__        = "${escapeForJs(process.env.VITE_APP_PEPPER)}";
window.__APP_ENV__           = "${escapeForJs(process.env.VITE_APP_ENV)}";
window.__APP_VERSION__       = "${escapeForJs(process.env.VITE_APP_VERSION)}";
window.__MAX_INPUT_LENGTH__  = ${Number(process.env.VITE_MAX_INPUT_LENGTH) || 500};
window.__RATE_LIMIT_TOKENS__ = ${Number(process.env.VITE_RATE_LIMIT_TOKENS) || 10};
window.__PDF_MAX_SIZE_MB__   = ${Number(process.env.VITE_PDF_MAX_SIZE_MB) || 5};
window.__PDF_MAX_PAGES__     = ${Number(process.env.VITE_PDF_MAX_PAGES) || 20};
`;
await writeFile(join(DIST, 'config.js'), configJs, 'utf8');
console.log('[inject-env] ✔ config.js gerado');
}

main().catch((err) => {
    console.error('[inject-env] ❌ Erro fatal:', err.message);
    process.exit(1);
});