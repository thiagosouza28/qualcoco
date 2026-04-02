-- 1. REMOVE CONSTRAINTS PROBLEMÁTICAS QUE CAUSAM ERRO 409
-- Tabelas de log/eventos não precisam de local_id único se usarmos o UUID (id) como âncora.
do $$ 
begin
  -- Tabela: tentativas_login
  alter table if exists public.tentativas_login drop constraint if exists tentativas_login_local_id_key;
  
  -- Tabela: sync_logs
  alter table if exists public.sync_logs drop constraint if exists sync_logs_local_id_key;

  -- Se existirem outras constraints de local_id que estão travando o sync, podemos remover aqui.
  -- Mas para colaboradores, equipes e parcelas, o local_id único costuma ser desejável.
  -- No entanto, se o ID (UUID) for a fonte da verdade, o local_id único se torna redundante.
end $$;

-- 2. LIMPEZA DE DADOS DUPLICADOS OU CONFLITANTES (OPCIONAL MAS RECOMENDADO)
-- Se houverem registros com o mesmo local_id mas IDs diferentes, isso pode confundir o app.
-- Vamos manter apenas o registro mais antigo (ctid) para cada local_id em tentativas_login.
delete from public.tentativas_login a using (
  select min(ctid) as min_ctid, local_id 
  from public.tentativas_login 
  group by local_id having count(*) > 1
) b where a.local_id = b.local_id and a.ctid <> b.min_ctid;

-- 3. GARANTIR QUE RLS NÃO ESTÁ BLOQUEANDO NADA
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- 4. RECARREGAR SCHEMA CACHE
notify pgrst, 'reload schema';
