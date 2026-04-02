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
