create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  numero integer not null unique,
  nome text not null,
  fiscal text not null default '',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

alter table if exists public.avaliacao_ruas
  add column if not exists equipe_id uuid references public.equipes(id);

alter table if exists public.avaliacao_ruas
  add column if not exists equipe_nome text not null default '';

create index if not exists equipes_numero_idx on public.equipes (numero);
create index if not exists equipes_ativa_idx on public.equipes (ativa);
create index if not exists equipes_sync_status_idx on public.equipes (sync_status, atualizado_em desc);
create index if not exists avaliacao_ruas_equipe_idx on public.avaliacao_ruas (equipe_id);

drop trigger if exists set_equipes_atualizado_em on public.equipes;
create trigger set_equipes_atualizado_em
before update on public.equipes
for each row execute function public.set_atualizado_em();
