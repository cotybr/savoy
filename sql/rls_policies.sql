-- ============================================================
-- RLS para Supabase — cada colaborador acessa APENAS os próprios dados
-- ============================================================

-- 1) Ativa RLS em todas as tabelas sensíveis
ALTER TABLE epi_requisicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE banco_horas    ENABLE ROW LEVEL SECURITY;

-- 2) Política: SELECT restrito ao próprio colaborador
--    A função auth.jwt() -> 'matricula' deve vir de um JWT customizado
--    emitido no login (via Supabase Auth hook).
CREATE POLICY "colaborador_select_own_epi"
    ON epi_requisicoes
    FOR SELECT
    TO authenticated
    USING (matricula = (auth.jwt() ->> 'matricula'));

CREATE POLICY "colaborador_select_own_banco_horas"
    ON banco_horas
    FOR SELECT
    TO authenticated
    USING (matricula = (auth.jwt() ->> 'matricula'));

-- 3) Bloqueia escrita direta pelo client (apenas service_role/backend)
CREATE POLICY "no_client_insert_epi"
    ON epi_requisicoes FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_epi"
    ON epi_requisicoes FOR UPDATE TO authenticated USING (false);
CREATE POLICY "no_client_delete_epi"
    ON epi_requisicoes FOR DELETE TO authenticated USING (false);

-- 4) Revoga acesso anônimo
REVOKE ALL ON epi_requisicoes FROM anon;
REVOKE ALL ON banco_horas    FROM anon;

-- 5) Índices para performance das consultas parametrizadas
CREATE INDEX IF NOT EXISTS idx_epi_matricula ON epi_requisicoes(matricula);
CREATE INDEX IF NOT EXISTS idx_bh_matricula  ON banco_horas(matricula);