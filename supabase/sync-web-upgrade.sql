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

alter table public.avaliacoes
  add column if not exists media_cachos_3 numeric not null default 0;

alter table public.avaliacoes
  add column if not exists data_colheita date;

alter table public.avaliacoes
  add column if not exists ordem_coleta text not null default 'padrao';

alter table public.avaliacoes
  add column if not exists modo_calculo text not null default 'manual';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'avaliacoes_status_check'
      and conrelid = 'public.avaliacoes'::regclass
  ) then
    alter table public.avaliacoes drop constraint avaliacoes_status_check;
  end if;
end $$;

alter table public.avaliacoes
  add constraint avaliacoes_status_check
  check (status in ('draft', 'in_progress', 'completed', 'ok', 'refazer'));

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

alter table public.registros_coleta
  add column if not exists quantidade_cachos_3 numeric not null default 0;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'registros_coleta_quantidade_cachos_3_check'
      and conrelid = 'public.registros_coleta'::regclass
  ) then
    alter table public.registros_coleta
      drop constraint registros_coleta_quantidade_cachos_3_check;
  end if;
end $$;

alter table public.registros_coleta
  add constraint registros_coleta_quantidade_cachos_3_check
  check (quantidade_cachos_3 >= 0);

alter table public.colaboradores
  add column if not exists auth_user_id uuid;

alter table public.colaboradores
  add column if not exists auth_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'colaboradores_auth_user_id_key'
      and conrelid = 'public.colaboradores'::regclass
  ) then
    alter table public.colaboradores
      add constraint colaboradores_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'colaboradores_auth_email_key'
      and conrelid = 'public.colaboradores'::regclass
  ) then
    alter table public.colaboradores
      add constraint colaboradores_auth_email_key unique (auth_email);
  end if;
end $$;

create index if not exists colaboradores_auth_user_id_idx
on public.colaboradores (auth_user_id);

create index if not exists colaboradores_auth_email_idx
on public.colaboradores (auth_email);

create index if not exists colaboradores_atualizado_em_idx
on public.colaboradores (atualizado_em desc);

alter table public.avaliacao_ruas
  add column if not exists data_avaliacao date;

alter table public.avaliacao_ruas
  add column if not exists tipo_falha text;

update public.avaliacao_ruas ar
set data_avaliacao = a.data_avaliacao
from public.avaliacoes a
where a.id = ar.avaliacao_id
  and ar.data_avaliacao is null;

alter table public.avaliacao_ruas
  alter column data_avaliacao set default current_date;

update public.avaliacao_ruas
set data_avaliacao = current_date
where data_avaliacao is null;

alter table public.avaliacao_ruas
  alter column data_avaliacao set not null;

alter table public.avaliacao_ruas
  drop constraint if exists avaliacao_ruas_tipo_falha_check;

alter table public.avaliacao_ruas
  add constraint avaliacao_ruas_tipo_falha_check
  check (tipo_falha in ('rua_com_falha', 'linha_invalida'));

create index if not exists avaliacao_ruas_parcela_data_idx
on public.avaliacao_ruas (parcela_id, data_avaliacao desc);

create index if not exists avaliacao_ruas_tipo_falha_idx
on public.avaliacao_ruas (tipo_falha);

alter table public.colaboradores replica identity full;
alter table public.parcelas replica identity full;
alter table public.equipes replica identity full;
alter table public.avaliacoes replica identity full;
alter table public.avaliacao_colaboradores replica identity full;
alter table public.avaliacao_parcelas replica identity full;
alter table public.avaliacao_ruas replica identity full;
alter table public.registros_coleta replica identity full;
alter table public.configuracoes replica identity full;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'colaboradores',
    'parcelas',
    'equipes',
    'avaliacoes',
    'avaliacao_colaboradores',
    'avaliacao_parcelas',
    'avaliacao_ruas',
    'registros_coleta',
    'configuracoes'
  ];
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach target_table in array target_tables loop
      begin
        execute format(
          'alter publication supabase_realtime add table public.%I',
          target_table
        );
      exception
        when duplicate_object then
          null;
      end;
    end loop;
  end if;
end $$;

create or replace function public.auth_colaborador_id()
returns uuid
language sql
stable
as $$
  select c.id
  from public.colaboradores c
  where c.auth_user_id = auth.uid()
    and c.deletado_em is null
  limit 1
$$;

create or replace function public.can_access_avaliacao(target_avaliacao_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.avaliacoes a
    left join public.avaliacao_colaboradores ac
      on ac.avaliacao_id = a.id
     and ac.deletado_em is null
    where a.id = target_avaliacao_id
      and a.deletado_em is null
      and (
        a.usuario_id = public.auth_colaborador_id()
        or ac.colaborador_id = public.auth_colaborador_id()
      )
  )
$$;

revoke all on function public.auth_colaborador_id() from public;
grant execute on function public.auth_colaborador_id() to authenticated;

revoke all on function public.can_access_avaliacao(uuid) from public;
grant execute on function public.can_access_avaliacao(uuid) to authenticated;

drop policy if exists avaliacoes_authenticated_select on public.avaliacoes;
create policy avaliacoes_authenticated_select on public.avaliacoes
for select to authenticated
using (public.can_access_avaliacao(id));

drop policy if exists avaliacoes_authenticated_insert on public.avaliacoes;
create policy avaliacoes_authenticated_insert on public.avaliacoes
for insert to authenticated
with check (usuario_id = public.auth_colaborador_id());

drop policy if exists avaliacoes_authenticated_update on public.avaliacoes;
create policy avaliacoes_authenticated_update on public.avaliacoes
for update to authenticated
using (public.can_access_avaliacao(id))
with check (public.can_access_avaliacao(id));

drop policy if exists avaliacoes_authenticated_delete on public.avaliacoes;
create policy avaliacoes_authenticated_delete on public.avaliacoes
for delete to authenticated
using (public.can_access_avaliacao(id));

drop policy if exists avaliacao_colaboradores_authenticated_select on public.avaliacao_colaboradores;
create policy avaliacao_colaboradores_authenticated_select on public.avaliacao_colaboradores
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_colaboradores_authenticated_insert on public.avaliacao_colaboradores;
create policy avaliacao_colaboradores_authenticated_insert on public.avaliacao_colaboradores
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_colaboradores_authenticated_update on public.avaliacao_colaboradores;
create policy avaliacao_colaboradores_authenticated_update on public.avaliacao_colaboradores
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_colaboradores_authenticated_delete on public.avaliacao_colaboradores;
create policy avaliacao_colaboradores_authenticated_delete on public.avaliacao_colaboradores
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_parcelas_authenticated_select on public.avaliacao_parcelas;
create policy avaliacao_parcelas_authenticated_select on public.avaliacao_parcelas
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_parcelas_authenticated_insert on public.avaliacao_parcelas;
create policy avaliacao_parcelas_authenticated_insert on public.avaliacao_parcelas
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_parcelas_authenticated_update on public.avaliacao_parcelas;
create policy avaliacao_parcelas_authenticated_update on public.avaliacao_parcelas
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_parcelas_authenticated_delete on public.avaliacao_parcelas;
create policy avaliacao_parcelas_authenticated_delete on public.avaliacao_parcelas
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_ruas_authenticated_select on public.avaliacao_ruas;
create policy avaliacao_ruas_authenticated_select on public.avaliacao_ruas
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_ruas_authenticated_insert on public.avaliacao_ruas;
create policy avaliacao_ruas_authenticated_insert on public.avaliacao_ruas
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_ruas_authenticated_update on public.avaliacao_ruas;
create policy avaliacao_ruas_authenticated_update on public.avaliacao_ruas
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists avaliacao_ruas_authenticated_delete on public.avaliacao_ruas;
create policy avaliacao_ruas_authenticated_delete on public.avaliacao_ruas
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists registros_coleta_authenticated_select on public.registros_coleta;
create policy registros_coleta_authenticated_select on public.registros_coleta
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

drop policy if exists registros_coleta_authenticated_insert on public.registros_coleta;
create policy registros_coleta_authenticated_insert on public.registros_coleta
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists registros_coleta_authenticated_update on public.registros_coleta;
create policy registros_coleta_authenticated_update on public.registros_coleta
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

drop policy if exists registros_coleta_authenticated_delete on public.registros_coleta;
create policy registros_coleta_authenticated_delete on public.registros_coleta
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

notify pgrst, 'reload schema';
