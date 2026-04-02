-- Permite sincronizacao usando a anon key do Supabase.
-- O app pode operar como role `anon` ou `authenticated`, dependendo da configuracao de Auth.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
grant usage, select on sequences to anon, authenticated;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'equipes',
    'colaboradores',
    'parcelas',
    'dispositivos',
    'avaliacoes',
    'avaliacao_colaboradores',
    'avaliacao_parcelas',
    'avaliacao_ruas',
    'registros_coleta',
    'sync_logs',
    'tentativas_login'
  ];
begin
  foreach target_table in array target_tables loop
    execute format('revoke all on table public.%I from public', target_table);
    execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', target_table);
    execute format('alter table public.%I enable row level security', target_table);

    execute format('drop policy if exists sync_select on public.%I', target_table);
    execute format('drop policy if exists authenticated_select on public.%I', target_table);
    execute format(
      'create policy sync_select on public.%I for select to anon, authenticated using (true)',
      target_table
    );

    execute format('drop policy if exists sync_insert on public.%I', target_table);
    execute format('drop policy if exists authenticated_insert on public.%I', target_table);
    execute format(
      'create policy sync_insert on public.%I for insert to anon, authenticated with check (true)',
      target_table
    );

    execute format('drop policy if exists sync_update on public.%I', target_table);
    execute format('drop policy if exists authenticated_update on public.%I', target_table);
    execute format(
      'create policy sync_update on public.%I for update to anon, authenticated using (true) with check (true)',
      target_table
    );

    execute format('drop policy if exists sync_delete on public.%I', target_table);
    execute format('drop policy if exists authenticated_delete on public.%I', target_table);
    execute format(
      'create policy sync_delete on public.%I for delete to anon, authenticated using (true)',
      target_table
    );
  end loop;
end
$$;
