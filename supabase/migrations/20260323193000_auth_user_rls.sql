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

do $$
declare
  target_table text;
  locked_tables text[] := array[
    'avaliacoes',
    'avaliacao_colaboradores',
    'avaliacao_parcelas',
    'avaliacao_ruas',
    'registros_coleta'
  ];
begin
  foreach target_table in array locked_tables loop
    execute format('drop policy if exists sync_select on public.%I', target_table);
    execute format('drop policy if exists sync_insert on public.%I', target_table);
    execute format('drop policy if exists sync_update on public.%I', target_table);
    execute format('drop policy if exists sync_delete on public.%I', target_table);
    execute format('drop policy if exists authenticated_select on public.%I', target_table);
    execute format('drop policy if exists authenticated_insert on public.%I', target_table);
    execute format('drop policy if exists authenticated_update on public.%I', target_table);
    execute format('drop policy if exists authenticated_delete on public.%I', target_table);
    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_authenticated_select',
      target_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_authenticated_insert',
      target_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_authenticated_update',
      target_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_authenticated_delete',
      target_table
    );
  end loop;
end
$$;

create policy avaliacoes_authenticated_select on public.avaliacoes
for select to authenticated
using (public.can_access_avaliacao(id));

create policy avaliacoes_authenticated_insert on public.avaliacoes
for insert to authenticated
with check (usuario_id = public.auth_colaborador_id());

create policy avaliacoes_authenticated_update on public.avaliacoes
for update to authenticated
using (public.can_access_avaliacao(id))
with check (public.can_access_avaliacao(id));

create policy avaliacoes_authenticated_delete on public.avaliacoes
for delete to authenticated
using (public.can_access_avaliacao(id));

create policy avaliacao_colaboradores_authenticated_select on public.avaliacao_colaboradores
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_colaboradores_authenticated_insert on public.avaliacao_colaboradores
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_colaboradores_authenticated_update on public.avaliacao_colaboradores
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_colaboradores_authenticated_delete on public.avaliacao_colaboradores
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_parcelas_authenticated_select on public.avaliacao_parcelas
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_parcelas_authenticated_insert on public.avaliacao_parcelas
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_parcelas_authenticated_update on public.avaliacao_parcelas
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_parcelas_authenticated_delete on public.avaliacao_parcelas
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_ruas_authenticated_select on public.avaliacao_ruas
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_ruas_authenticated_insert on public.avaliacao_ruas
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_ruas_authenticated_update on public.avaliacao_ruas
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

create policy avaliacao_ruas_authenticated_delete on public.avaliacao_ruas
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy registros_coleta_authenticated_select on public.registros_coleta
for select to authenticated
using (public.can_access_avaliacao(avaliacao_id));

create policy registros_coleta_authenticated_insert on public.registros_coleta
for insert to authenticated
with check (public.can_access_avaliacao(avaliacao_id));

create policy registros_coleta_authenticated_update on public.registros_coleta
for update to authenticated
using (public.can_access_avaliacao(avaliacao_id))
with check (public.can_access_avaliacao(avaliacao_id));

create policy registros_coleta_authenticated_delete on public.registros_coleta
for delete to authenticated
using (public.can_access_avaliacao(avaliacao_id));
