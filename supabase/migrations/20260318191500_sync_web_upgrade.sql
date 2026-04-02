alter table public.avaliacoes
  add column if not exists media_cachos_3 numeric not null default 0;

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

notify pgrst, 'reload schema';
