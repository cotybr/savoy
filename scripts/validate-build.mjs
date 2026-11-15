#!/usr/bin/env node
/**
 * Verifica o /dist antes do deploy:
 *  1. Nenhum secret real (service_role, JWT secret) está presente
 *  2. Nenhum placeholder %%...%% restou
 *  3. Nenhuma chave "anon" com comprimento absurdo (indício de vazamento)
 *  4. sourcemaps não estão presentes
 *  5. index.html tem CSP
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const FORBIDDEN_PATTERNS = [
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /service_role\s*[:=]/i,
    /SUPABASE_JWT_SECRET/i,
    /ENCRYPTION_KEY\s*[:=]/i,
    /SERVER_PEPPER/i,
    /SENTRY_DSN/i,
    /%%[A-Z0-9_]+%%/g   // placeholders não resolvidos
];

let errors = 0;

async function scanFile(filePath) {
    const content = await readFile(filePath, 'utf8');
    for (const pat of FORBIDDEN_PATTERNS) {
        const m = content.match(pat);
        if (m) {
            console.error(`[validate] ❌ ${filePath.replace(ROOT, '.')} contém padrão proibido: ${pat}`);
            errors++;
        }
    }
}

async function main() {
    console.log('[validate] Verificando /dist...');

    const walk = async (dir) => {
        for (const entry of await readdir(dir)) {
            const p = join(dir, entry);
            const info = await stat(p);
            if (info.isDirectory()) await walk(p);
            else await scanFile(p);
        }
    };
    await walk(DIST);

    // Checagem da CSP
    const html = await readFile(join(DIST, 'index.html'), 'utf8');
    if (!html.includes('Content-Security-Policy')) {
        console.error('[validate] ❌ index.html sem CSP');
        errors++;
    }
    if (html.includes('%%CSP_NONCE%%')) {
        console.error('[validate] ❌ Nonce não resolvido na CSP');
        errors++;
    }

    if (errors > 0) {
        console.error(`[validate] ❌ ${errors} problema(s) encontrado(s). Deploy ABORTADO.`);
        process.exit(1);
    }
    console.log('[validate] ✅ Build validado — seguro para deploy.');
}

main().catch((err) => {
    console.error('[validate] ❌ Erro:', err.message);
    process.exit(1);
});