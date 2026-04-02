create table if not exists public.configuracoes (
  id text primary key,
  local_id text not null unique,
  limite_cocos_chao numeric not null default 19 check (limite_cocos_chao >= 0),
  limite_cachos_3_cocos numeric not null default 19 check (limite_cachos_3_cocos >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

alter table public.configuracoes
  add column if not exists limite_cocos_chao numeric not null default 19;

alter table public.configuracoes
  add column if not exists limite_cachos_3_cocos numeric not null default 19;

alter table public.configuracoes
  alter column limite_cocos_chao set default 19;

alter table public.configuracoes
  alter column limite_cachos_3_cocos set default 19;

alter table public.configuracoes
  drop constraint if exists configuracoes_limite_cocos_chao_check;

alter table public.configuracoes
  drop constraint if exists configuracoes_limite_cachos_3_cocos_check;

alter table public.configuracoes
  add constraint configuracoes_limite_cocos_chao_check
  check (limite_cocos_chao >= 0);

alter table public.configuracoes
  add constraint configuracoes_limite_cachos_3_cocos_check
  check (limite_cachos_3_cocos >= 0);

create index if not exists configuracoes_sync_status_idx
on public.configuracoes (sync_status, atualizado_em desc);

drop trigger if exists set_configuracoes_atualizado_em on public.configuracoes;
create trigger set_configuracoes_atualizado_em
before update on public.configuracoes
for each row execute function public.set_atualizado_em();

grant select, insert, update, delete on table public.configuracoes to anon, authenticated;
alter table public.configuracoes enable row level security;

drop policy if exists sync_select on public.configuracoes;
create policy sync_select on public.configuracoes
for select to anon, authenticated
using (true);

drop policy if exists sync_insert on public.configuracoes;
create policy sync_insert on public.configuracoes
for insert to anon, authenticated
with check (true);

drop policy if exists sync_update on public.configuracoes;
create policy sync_update on public.configuracoes
for update to anon, authenticated
using (true) with check (true);

drop policy if exists sync_delete on public.configuracoes;
create policy sync_delete on public.configuracoes
for delete to anon, authenticated
using (true);
