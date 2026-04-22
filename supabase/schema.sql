create extension if not exists pgcrypto;

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  numero integer not null unique,
  nome text not null,
  fiscal text not null default '',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  nome text not null,
  primeiro_nome text not null,
  matricula text not null unique,
  pin_hash text not null,
  pin_salt text not null,
  ativo boolean not null default true,
  auth_user_id uuid unique,
  auth_email text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.parcelas (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  codigo text not null unique,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.dispositivos (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  nome_dispositivo text not null,
  identificador_local text not null unique,
  ultimo_sync_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  usuario_id uuid not null references public.colaboradores(id),
  dispositivo_id uuid not null references public.dispositivos(id),
  data_avaliacao date not null default current_date,
  data_colheita date,
  observacoes text,
  status text not null check (status in ('draft', 'in_progress', 'completed', 'ok', 'refazer')),
  total_registros integer not null default 0 check (total_registros >= 0),
  media_parcela numeric not null default 0,
  media_cachos_3 numeric not null default 0,
  origem_dado text not null check (origem_dado in ('local', 'shared', 'supabase')),
  ordem_coleta text not null default 'padrao' check (ordem_coleta in ('padrao', 'invertido')),
  modo_calculo text not null default 'manual' check (modo_calculo in ('manual', 'media_vizinhas')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.avaliacao_colaboradores (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  papel text not null check (papel in ('responsavel', 'participante')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null,
  constraint avaliacao_colaboradores_unique unique (avaliacao_id, colaborador_id)
);

create table if not exists public.avaliacao_parcelas (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  parcela_id uuid not null references public.parcelas(id),
  parcela_codigo text not null,
  linha_inicial integer not null check (linha_inicial > 0),
  linha_final integer not null check (linha_final >= linha_inicial),
  configurada_em timestamptz not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null,
  constraint avaliacao_parcelas_unique unique (avaliacao_id, parcela_id)
);

create table if not exists public.avaliacao_ruas (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  parcela_id uuid not null references public.parcelas(id),
  data_avaliacao date not null,
  avaliacao_parcela_id uuid not null references public.avaliacao_parcelas(id) on delete cascade,
  rua_numero integer not null check (rua_numero > 0),
  linha_inicial integer not null check (linha_inicial > 0),
  linha_final integer not null check (linha_final >= linha_inicial),
  alinhamento_tipo text not null check (alinhamento_tipo in ('inferior-impar', 'inferior-par')),
  equipe_id uuid references public.equipes(id),
  equipe_nome text not null default '',
  tipo_falha text check (tipo_falha in ('rua_com_falha', 'linha_invalida')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null,
  constraint avaliacao_ruas_unique unique (avaliacao_parcela_id, rua_numero)
);

create table if not exists public.registros_coleta (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  parcela_id uuid not null references public.parcelas(id),
  rua_id uuid not null references public.avaliacao_ruas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  quantidade numeric not null check (quantidade >= 0),
  quantidade_cachos_3 numeric not null default 0 check (quantidade_cachos_3 >= 0),
  observacoes text,
  registrado_em timestamptz not null,
  dispositivo_id uuid not null references public.dispositivos(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  dispositivo_id uuid not null references public.dispositivos(id),
  tipo_sync text not null check (tipo_sync in ('supabase_push', 'supabase_pull', 'local_export', 'local_import')),
  status text not null check (status in ('success', 'warning', 'error')),
  detalhes text,
  enviado integer not null default 0 check (enviado >= 0),
  recebido integer not null default 0 check (recebido >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.tentativas_login (
  id uuid primary key default gen_random_uuid(),
  local_id text not null,
  colaborador_id uuid references public.colaboradores(id),
  identificador_informado text not null,
  sucesso boolean not null,
  motivo text not null,
  dispositivo_id uuid not null references public.dispositivos(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create table if not exists public.configuracoes (
  id text primary key,
  local_id text not null unique,
  cocos_por_bag numeric not null default 600 check (cocos_por_bag >= 0),
  cargas_por_bag numeric not null default 6 check (cargas_por_bag > 0),
  limite_cocos_chao numeric not null default 19 check (limite_cocos_chao >= 0),
  limite_cachos_3_cocos numeric not null default 19 check (limite_cachos_3_cocos >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado_em timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('local', 'pending_sync', 'synced', 'conflict', 'error')),
  versao integer not null default 1 check (versao >= 1),
  origem_dispositivo_id uuid not null
);

create index if not exists equipes_numero_idx on public.equipes (numero);
create index if not exists equipes_ativa_idx on public.equipes (ativa);
create index if not exists equipes_sync_status_idx on public.equipes (sync_status, atualizado_em desc);
create index if not exists colaboradores_primeiro_nome_idx on public.colaboradores (primeiro_nome);
create index if not exists colaboradores_sync_status_idx on public.colaboradores (sync_status, atualizado_em desc);
create index if not exists colaboradores_atualizado_em_idx on public.colaboradores (atualizado_em desc);
create index if not exists colaboradores_auth_user_id_idx on public.colaboradores (auth_user_id);
create index if not exists colaboradores_auth_email_idx on public.colaboradores (auth_email);
create index if not exists parcelas_sync_status_idx on public.parcelas (sync_status, atualizado_em desc);
create index if not exists parcelas_ativo_idx on public.parcelas (ativo);
create index if not exists dispositivos_sync_status_idx on public.dispositivos (sync_status, atualizado_em desc);
create index if not exists avaliacoes_usuario_id_idx on public.avaliacoes (usuario_id);
create index if not exists avaliacoes_dispositivo_id_idx on public.avaliacoes (dispositivo_id);
create index if not exists avaliacoes_data_idx on public.avaliacoes (data_avaliacao desc);
create index if not exists avaliacoes_sync_status_idx on public.avaliacoes (sync_status, atualizado_em desc);
create index if not exists avaliacao_colaboradores_colaborador_idx on public.avaliacao_colaboradores (colaborador_id);
create index if not exists avaliacao_parcelas_parcela_idx on public.avaliacao_parcelas (parcela_id);
create index if not exists avaliacao_ruas_parcela_idx on public.avaliacao_ruas (parcela_id);
create index if not exists avaliacao_ruas_parcela_data_idx on public.avaliacao_ruas (parcela_id, data_avaliacao desc);
create index if not exists avaliacao_ruas_equipe_idx on public.avaliacao_ruas (equipe_id);
create index if not exists avaliacao_ruas_tipo_falha_idx on public.avaliacao_ruas (tipo_falha);
create index if not exists avaliacao_ruas_sync_status_idx on public.avaliacao_ruas (sync_status, atualizado_em desc);
create index if not exists registros_coleta_avaliacao_idx on public.registros_coleta (avaliacao_id);
create index if not exists registros_coleta_parcela_idx on public.registros_coleta (parcela_id);
create index if not exists registros_coleta_rua_idx on public.registros_coleta (rua_id);
create index if not exists registros_coleta_colaborador_idx on public.registros_coleta (colaborador_id);
create index if not exists registros_coleta_sync_status_idx on public.registros_coleta (sync_status, atualizado_em desc);
create index if not exists sync_logs_dispositivo_criado_idx on public.sync_logs (dispositivo_id, criado_em desc);
create index if not exists tentativas_login_dispositivo_criado_idx on public.tentativas_login (dispositivo_id, criado_em desc);
create index if not exists tentativas_login_identificador_criado_idx on public.tentativas_login (identificador_informado, criado_em desc);
create index if not exists configuracoes_sync_status_idx on public.configuracoes (sync_status, atualizado_em desc);

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

drop trigger if exists set_equipes_atualizado_em on public.equipes;
create trigger set_equipes_atualizado_em
before update on public.equipes
for each row execute function public.set_atualizado_em();

drop trigger if exists set_colaboradores_atualizado_em on public.colaboradores;
create trigger set_colaboradores_atualizado_em
before update on public.colaboradores
for each row execute function public.set_atualizado_em();

drop trigger if exists set_parcelas_atualizado_em on public.parcelas;
create trigger set_parcelas_atualizado_em
before update on public.parcelas
for each row execute function public.set_atualizado_em();

drop trigger if exists set_dispositivos_atualizado_em on public.dispositivos;
create trigger set_dispositivos_atualizado_em
before update on public.dispositivos
for each row execute function public.set_atualizado_em();

drop trigger if exists set_avaliacoes_atualizado_em on public.avaliacoes;
create trigger set_avaliacoes_atualizado_em
before update on public.avaliacoes
for each row execute function public.set_atualizado_em();

drop trigger if exists set_avaliacao_colaboradores_atualizado_em on public.avaliacao_colaboradores;
create trigger set_avaliacao_colaboradores_atualizado_em
before update on public.avaliacao_colaboradores
for each row execute function public.set_atualizado_em();

drop trigger if exists set_avaliacao_parcelas_atualizado_em on public.avaliacao_parcelas;
create trigger set_avaliacao_parcelas_atualizado_em
before update on public.avaliacao_parcelas
for each row execute function public.set_atualizado_em();

drop trigger if exists set_avaliacao_ruas_atualizado_em on public.avaliacao_ruas;
create trigger set_avaliacao_ruas_atualizado_em
before update on public.avaliacao_ruas
for each row execute function public.set_atualizado_em();

drop trigger if exists set_registros_coleta_atualizado_em on public.registros_coleta;
create trigger set_registros_coleta_atualizado_em
before update on public.registros_coleta
for each row execute function public.set_atualizado_em();

drop trigger if exists set_sync_logs_atualizado_em on public.sync_logs;
create trigger set_sync_logs_atualizado_em
before update on public.sync_logs
for each row execute function public.set_atualizado_em();

drop trigger if exists set_tentativas_login_atualizado_em on public.tentativas_login;
create trigger set_tentativas_login_atualizado_em
before update on public.tentativas_login
for each row execute function public.set_atualizado_em();

drop trigger if exists set_configuracoes_atualizado_em on public.configuracoes;
create trigger set_configuracoes_atualizado_em
before update on public.configuracoes
for each row execute function public.set_atualizado_em();

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
  cocos_estimados numeric not null default 0 check (cocos_estimados >= 0),
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
