alter table public.avaliacoes
  add column if not exists ordem_coleta text not null default 'padrao';

alter table public.avaliacoes
  add column if not exists modo_calculo text not null default 'manual';

alter table public.avaliacoes
  drop constraint if exists avaliacoes_ordem_coleta_check;

alter table public.avaliacoes
  add constraint avaliacoes_ordem_coleta_check
  check (ordem_coleta in ('padrao', 'invertido'));

alter table public.avaliacoes
  drop constraint if exists avaliacoes_modo_calculo_check;

alter table public.avaliacoes
  add constraint avaliacoes_modo_calculo_check
  check (modo_calculo in ('manual', 'media_vizinhas'));

alter table public.avaliacao_ruas
  add column if not exists tipo_falha text;

alter table public.avaliacao_ruas
  drop constraint if exists avaliacao_ruas_tipo_falha_check;

alter table public.avaliacao_ruas
  add constraint avaliacao_ruas_tipo_falha_check
  check (tipo_falha in ('rua_com_falha', 'linha_invalida'));

create index if not exists avaliacao_ruas_tipo_falha_idx
on public.avaliacao_ruas (tipo_falha);

notify pgrst, 'reload schema';
