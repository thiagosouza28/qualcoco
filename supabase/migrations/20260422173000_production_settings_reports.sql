alter table public.configuracoes
  add column if not exists cocos_por_bag numeric not null default 600 check (cocos_por_bag >= 0);

alter table public.configuracoes
  add column if not exists cargas_por_bag numeric not null default 6 check (cargas_por_bag > 0);

alter table public.avaliacao_retoques
  add column if not exists cocos_estimados numeric not null default 0 check (cocos_estimados >= 0);

create table if not exists public.producao (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  equipe_id uuid references public.equipes(id),
  equipe_nome text not null default '',
  avaliacao_id uuid references public.avaliacoes(id) on delete set null,
  retoque_id uuid references public.avaliacao_retoques(id) on delete set null,
  cargas numeric not null default 0 check (cargas >= 0),
  bags numeric not null default 0 check (bags >= 0),
  cocos_estimados numeric not null default 0 check (cocos_estimados >= 0),
  data date not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create index if not exists producao_equipe_data_idx on public.producao (equipe_id, data desc);
create index if not exists producao_avaliacao_idx on public.producao (avaliacao_id);
create index if not exists producao_retoque_idx on public.producao (retoque_id);
create index if not exists producao_sync_status_idx on public.producao (sync_status, atualizado_em desc);

alter table public.producao replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public.producao;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

drop trigger if exists set_producao_atualizado_em on public.producao;
create trigger set_producao_atualizado_em
before update on public.producao
for each row execute function public.set_atualizado_em();

grant select, insert, update, delete on table public.producao to anon, authenticated;
alter table public.producao enable row level security;

drop policy if exists sync_select on public.producao;
create policy sync_select on public.producao
for select
using (true);

drop policy if exists sync_insert on public.producao;
create policy sync_insert on public.producao
for insert
with check (true);

drop policy if exists sync_update on public.producao;
create policy sync_update on public.producao
for update
using (true)
with check (true);

drop policy if exists sync_delete on public.producao;
create policy sync_delete on public.producao
for delete
using (true);
