# Setup Cloud Sync

Use esta ordem no SQL Editor do Supabase para deixar o banco web pronto para o app:

1. Rode `supabase/schema.sql`
2. Rode `supabase/rls.sql`
3. Rode `supabase/sync-web-upgrade.sql`

Se a base antiga ja existir e estiver quebrada, rode depois:

1. `supabase/sync-repair.sql`
2. `supabase/sync-final-fix.sql`
3. `supabase/migrations/20260323183000_enable_realtime_sync.sql`
4. `supabase/migrations/20260323193000_auth_user_rls.sql`
5. Opcional: `supabase/migrations/20260323202000_add_colaboradores_atualizado_em_idx.sql`

Variaveis esperadas no app:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`

Configuracao obrigatoria no Supabase Auth:

1. Habilite `Email` em `Authentication > Providers`
2. Desative `Confirm email`
3. Mantenha `Anonymous` desabilitado para o sync protegido

Observacoes:

- O app usa email sintetico por matricula para autenticacao cloud do colaborador
- O PIN continua sendo a senha da conta cloud
- No primeiro login online de cada colaborador, a conta Auth e criada automaticamente
- O indice `20260323202000_add_colaboradores_atualizado_em_idx.sql` e apenas otimizacao. Se o SQL Editor der timeout, o app continua funcionando sem ele.

Depois disso:

1. Abra a tela `Sincronizacao`
2. Toque em `Testar Conexao`
3. Toque em `Sincronizar Agora`
