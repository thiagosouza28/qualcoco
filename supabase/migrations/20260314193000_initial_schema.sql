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
  data_avaliacao date not null,
  observacoes text,
  status text not null check (status in ('draft', 'in_progress', 'completed', 'ok', 'refazer')),
  total_registros integer not null default 0 check (total_registros >= 0),
  media_parcela numeric not null default 0,
  media_cachos_3 numeric not null default 0,
  origem_dado text not null check (origem_dado in ('local', 'shared', 'supabase')),
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
  avaliacao_parcela_id uuid not null references public.avaliacao_parcelas(id) on delete cascade,
  rua_numero integer not null check (rua_numero > 0),
  linha_inicial integer not null check (linha_inicial > 0),
  linha_final integer not null check (linha_final >= linha_inicial),
  alinhamento_tipo text not null check (alinhamento_tipo in ('inferior-impar', 'inferior-par')),
  equipe_id uuid references public.equipes(id),
  equipe_nome text not null default '',
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

create index if not exists equipes_numero_idx on public.equipes (numero);
create index if not exists equipes_ativa_idx on public.equipes (ativa);
create index if not exists equipes_sync_status_idx on public.equipes (sync_status, atualizado_em desc);
create index if not exists colaboradores_primeiro_nome_idx on public.colaboradores (primeiro_nome);
create index if not exists colaboradores_sync_status_idx on public.colaboradores (sync_status, atualizado_em desc);
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
create index if not exists avaliacao_ruas_equipe_idx on public.avaliacao_ruas (equipe_id);
create index if not exists avaliacao_ruas_sync_status_idx on public.avaliacao_ruas (sync_status, atualizado_em desc);
create index if not exists registros_coleta_avaliacao_idx on public.registros_coleta (avaliacao_id);
create index if not exists registros_coleta_parcela_idx on public.registros_coleta (parcela_id);
create index if not exists registros_coleta_rua_idx on public.registros_coleta (rua_id);
create index if not exists registros_coleta_colaborador_idx on public.registros_coleta (colaborador_id);
create index if not exists registros_coleta_sync_status_idx on public.registros_coleta (sync_status, atualizado_em desc);
create index if not exists sync_logs_dispositivo_criado_idx on public.sync_logs (dispositivo_id, criado_em desc);
create index if not exists tentativas_login_dispositivo_criado_idx on public.tentativas_login (dispositivo_id, criado_em desc);
create index if not exists tentativas_login_identificador_criado_idx on public.tentativas_login (identificador_informado, criado_em desc);

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
