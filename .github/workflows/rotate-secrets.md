# Runbook — Rotação de Secrets

## Quando rotacionar
- A cada 90 dias (política)
- Suspeita de vazamento
- Saída de um colaborador com acesso
- Incidente de segurança

## Passos

### 1. VITE_SUPABASE_ANON_KEY
> A `anon key` é pública por design, mas rotacionar reduz janela de abuso.

1. Supabase Dashboard → Settings → API → **Roll JWT secret** (rotaciona anon + service_role juntos)
2. Atualizar Secrets no GitHub: environments `staging` e `production`
3. Redeploy: `gh workflow run deploy-staging.yml` e `deploy-production.yml`
4. Verificar logs do Supabase (Auth → Logs) por anomalias em 24h

### 2. VITE_APP_PEPPER
> Rotacionar **invalida hashes existentes** (cache de matrícula). Impacto: apenas sessões ativas.

1. `openssl rand -hex 32`
2. Atualizar GitHub Secret nos dois environments
3. Comunicar usuários: "faça logout/login novamente"
4. Redeploy

### 3. NETLIFY_AUTH_TOKEN
1. Netlify → User settings → Applications → **Revoke** token antigo
2. Gerar novo token (escopo: apenas o site)
3. Atualizar GitHub Secret
4. Redeploy

### 4. Emergencial (comprometimento confirmado)
1. **Revogar imediatamente** o secret no provedor
2. Rodar `gitleaks detect --source . --log-opts="--all"` para achar vazamento
3. Se histórico Git contém o secret: `git filter-repo` + force-push + notificar DPO
4. Abrir incidente LGPD (Art. 48) se dados pessoais foram expostos