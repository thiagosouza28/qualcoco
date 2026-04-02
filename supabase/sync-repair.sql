-- 1. CORREÇÃO DE COLUNAS FALTANTES
do $$ 
declare
  r record;
begin
  -- Tabela: tentativas_login
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tentativas_login' and column_name = 'deletado_em') then
    alter table public.tentativas_login add column deletado_em timestamptz;
  end if;

  -- Coluna sync_error em todas as tabelas
  for r in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') loop
    begin
      execute format('alter table public.%I add column if not exists sync_error text', r.table_name);
    exception when others then 
      null; 
    end;
  end loop;

  -- Colunas standard em sync_logs
  alter table if exists public.sync_logs add column if not exists local_id text;
  alter table public.sync_logs alter column local_id drop not null;
  alter table if exists public.sync_logs add column if not exists sync_status text not null default 'synced';
  alter table if exists public.sync_logs add column if not exists versao integer not null default 1;
  alter table if exists public.sync_logs add column if not exists origem_dispositivo_id uuid;
  alter table if exists public.sync_logs add column if not exists deletado_em timestamptz;

  -- Tabela: tentativas_login
  alter table public.tentativas_login alter column local_id drop not null;
end $$;

-- 2. GARANTIR UNICIDADE PARA UPSERT (Deleta duplicados antes de aplicar a trava)
do $$
declare
  t text;
begin
  -- Lista de tabelas que usam local_id como chave de sincronizacao
  foreach t in array array['colaboradores', 'equipes', 'sync_logs', 'tentativas_login'] loop
    -- Deleta registros mais antigos que tenham o mesmo local_id (mantêm apenas o registro original/mais antigo via ctid)
    execute format('
      delete from public.%I a using (
        select min(ctid) as min_ctid, local_id 
        from public.%I 
        group by local_id having count(*) > 1
      ) b where a.local_id = b.local_id and a.ctid <> b.min_ctid', t, t);
    
    -- Agora tenta adicionar a constraint de forma segura
    begin
      execute format('alter table public.%I add constraint %I_local_id_key unique (local_id)', t, t);
    exception when others then 
      raise notice 'Constraint ja existe ou falhou em %', t;
    end;
  end loop;
end $$;

-- 3. PERMISSÕES E POLÍTICAS RLS COMPLETAS
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;

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
    -- Habilitar RLS
    execute format('alter table public.%I enable row level security', target_table);

    -- SELECT (Politica unica simplificada)
    execute format('drop policy if exists sync_select on public.%I', target_table);
    execute format('drop policy if exists authenticated_select on public.%I', target_table);
    execute format('create policy sync_select on public.%I for select to anon, authenticated using (true)', target_table);

    -- INSERT
    execute format('drop policy if exists sync_insert on public.%I', target_table);
    execute format('drop policy if exists authenticated_insert on public.%I', target_table);
    execute format('create policy sync_insert on public.%I for insert to anon, authenticated with check (true)', target_table);

    -- UPDATE
    execute format('drop policy if exists sync_update on public.%I', target_table);
    execute format('drop policy if exists authenticated_update on public.%I', target_table);
    execute format('create policy sync_update on public.%I for update to anon, authenticated using (true) with check (true)', target_table);

    -- DELETE
    execute format('drop policy if exists sync_delete on public.%I', target_table);
    execute format('drop policy if exists authenticated_delete on public.%I', target_table);
    execute format('create policy sync_delete on public.%I for delete to anon, authenticated using (true)', target_table);
  end loop;
end $$;

-- 4. RECARREGAR CACHE DO SUPABASE (IMPORTANTE PARA RECONHECER NOVAS COLUNAS)
NOTIFY pgrst, 'reload schema';
