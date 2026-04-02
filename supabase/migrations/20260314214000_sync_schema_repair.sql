alter table if exists public.tentativas_login
  add column if not exists deletado_em timestamptz;
