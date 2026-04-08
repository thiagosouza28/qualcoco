alter table public.colaboradores
  add column if not exists perfil text not null default 'colaborador';

alter table public.colaboradores
  drop constraint if exists colaboradores_perfil_check;

alter table public.colaboradores
  add constraint colaboradores_perfil_check
  check (perfil in ('colaborador', 'fiscal', 'fiscal_chefe', 'administrador'));

create table if not exists public.usuario_equipes (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  usuario_id uuid not null references public.colaboradores(id) on delete cascade,
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null,
  constraint usuario_equipes_unique unique (usuario_id, equipe_id)
);

alter table public.avaliacoes
  add column if not exists tipo text not null default 'normal',
  add column if not exists avaliacao_original_id uuid references public.avaliacoes(id),
  add column if not exists equipe_id uuid references public.equipes(id),
  add column if not exists equipe_nome text not null default '',
  add column if not exists responsavel_principal_id uuid references public.colaboradores(id),
  add column if not exists responsavel_principal_nome text not null default '',
  add column if not exists inicio_em timestamptz,
  add column if not exists fim_em timestamptz,
  add column if not exists encerrado_por_id uuid references public.colaboradores(id),
  add column if not exists encerrado_por_nome text not null default '',
  add column if not exists marcado_retoque_por_id uuid references public.colaboradores(id),
  add column if not exists marcado_retoque_por_nome text not null default '',
  add column if not exists marcado_retoque_em timestamptz,
  add column if not exists motivo_retoque text not null default '';

alter table public.avaliacoes
  drop constraint if exists avaliacoes_status_check;

alter table public.avaliacoes
  add constraint avaliacoes_status_check
  check (status in ('draft', 'in_progress', 'completed', 'ok', 'refazer', 'em_retoque', 'revisado'));

alter table public.avaliacoes
  drop constraint if exists avaliacoes_tipo_check;

alter table public.avaliacoes
  add constraint avaliacoes_tipo_check
  check (tipo in ('normal', 'retoque'));

alter table public.avaliacao_colaboradores
  drop constraint if exists avaliacao_colaboradores_papel_check;

alter table public.avaliacao_colaboradores
  add constraint avaliacao_colaboradores_papel_check
  check (papel in ('responsavel', 'participante', 'responsavel_principal', 'ajudante', 'fiscal_revisor'));

create table if not exists public.avaliacao_retoques (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  avaliacao_original_id uuid not null references public.avaliacoes(id) on delete cascade,
  responsavel_id uuid not null references public.colaboradores(id),
  responsavel_nome text not null default '',
  responsavel_matricula text not null default '',
  equipe_id uuid references public.equipes(id),
  equipe_nome text not null default '',
  ajudante_ids jsonb not null default '[]'::jsonb,
  ajudante_nomes jsonb not null default '[]'::jsonb,
  quantidade_bags numeric not null default 0 check (quantidade_bags >= 0),
  quantidade_cargas numeric not null default 0 check (quantidade_cargas >= 0),
  data_retoque date,
  data_inicio timestamptz,
  data_fim timestamptz,
  observacao text not null default '',
  finalizado_por_id uuid references public.colaboradores(id),
  finalizado_por_nome text not null default '',
  status text not null default 'em_retoque' check (status in ('em_retoque', 'finalizado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.avaliacao_logs (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  parcela_id uuid references public.parcelas(id),
  colaborador_id uuid references public.colaboradores(id),
  usuario_nome text not null default '',
  usuario_perfil text,
  acao text not null,
  descricao text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create index if not exists colaboradores_perfil_idx on public.colaboradores (perfil);
create index if not exists usuario_equipes_usuario_idx on public.usuario_equipes (usuario_id);
create index if not exists usuario_equipes_equipe_idx on public.usuario_equipes (equipe_id);
create index if not exists avaliacoes_tipo_idx on public.avaliacoes (tipo);
create index if not exists avaliacoes_original_idx on public.avaliacoes (avaliacao_original_id);
create index if not exists avaliacoes_equipe_idx on public.avaliacoes (equipe_id);
create index if not exists avaliacao_retoques_avaliacao_idx on public.avaliacao_retoques (avaliacao_id);
create index if not exists avaliacao_retoques_original_idx on public.avaliacao_retoques (avaliacao_original_id);
create index if not exists avaliacao_logs_avaliacao_idx on public.avaliacao_logs (avaliacao_id, criado_em desc);

alter table public.usuario_equipes replica identity full;
alter table public.avaliacao_retoques replica identity full;
alter table public.avaliacao_logs replica identity full;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'usuario_equipes',
    'avaliacao_retoques',
    'avaliacao_logs'
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

drop trigger if exists set_usuario_equipes_atualizado_em on public.usuario_equipes;
create trigger set_usuario_equipes_atualizado_em
before update on public.usuario_equipes
for each row execute function public.set_atualizado_em();

drop trigger if exists set_avaliacao_retoques_atualizado_em on public.avaliacao_retoques;
create trigger set_avaliacao_retoques_atualizado_em
before update on public.avaliacao_retoques
for each row execute function public.set_atualizado_em();

drop trigger if exists set_avaliacao_logs_atualizado_em on public.avaliacao_logs;
create trigger set_avaliacao_logs_atualizado_em
before update on public.avaliacao_logs
for each row execute function public.set_atualizado_em();
