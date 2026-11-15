/**
 * Configuração via variáveis de ambiente injetadas pelo bundler/host.
 * NUNCA hardcode chaves no código-fonte.
 * A chave usada deve ser a "anon public" — nunca a service_role!
 */
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[SEC] Credenciais Supabase ausentes. Abortando.');
}

let client = null;

export async function getSupabase() {
    if (client) return client;
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
        global: { headers: { 'X-Client-Info': 'chatbot-fabrica/1.0' } }
    });
    return client;
}

/**
 * Consultas SEMPRE parametrizadas (PostgREST usa .eq(), .ilike() etc.
 * com binding seguro — nunca concatene strings em filtros).
 */
export async function fetchEPIByMatricula(matricula) {
    const sb = await getSupabase();
    const { data, error } = await sb
        .from('epi_requisicoes')
        .select('id, matricula, tipo_epi, data_requisicao, status')
        .eq('matricula', matricula)        // <-- binding seguro
        .order('data_requisicao', { ascending: false })
        .limit(20);
    if (error) throw new Error('Falha ao consultar EPI.');
    return data;
}

export async function fetchBancoHoras(matricula) {
    const sb = await getSupabase();
    const { data, error } = await sb
        .from('banco_horas')
        .select('matricula, saldo_minutos, atualizado_em')
        .eq('matricula', matricula)
        .maybeSingle();
    if (error) throw new Error('Falha ao consultar banco de horas.');
    return data;
}