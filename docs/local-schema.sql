create table usuarios (
  local_id text primary key,
  id text not null unique,
  nome text not null,
  primeiro_nome text not null,
  matricula text not null unique,
  pin_hash text not null,
  pin_salt text not null,
  ativo integer not null default 1,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table colaboradores (
  local_id text primary key,
  id text not null unique,
  nome text not null,
  primeiro_nome text not null,
  matricula text not null unique,
  pin_hash text not null,
  pin_salt text not null,
  ativo integer not null default 1,
  perfil text,
  auth_user_id text,
  auth_email text,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table parcelas (
  local_id text primary key,
  id text not null unique,
  codigo text not null unique,
  descricao text,
  ativo integer not null default 1,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table avaliacoes (
  local_id text primary key,
  id text not null unique,
  usuario_id text not null,
  dispositivo_id text not null,
  data_avaliacao text not null,
  data_colheita text,
  observacoes text,
  status text not null,
  tipo text not null default 'normal',
  avaliacao_original_id text,
  equipe_id text,
  equipe_nome text,
  responsavel_principal_id text,
  responsavel_principal_nome text,
  inicio_em text,
  fim_em text,
  encerrado_por_id text,
  encerrado_por_nome text,
  marcado_retoque_por_id text,
  marcado_retoque_por_nome text,
  marcado_retoque_em text,
  motivo_retoque text,
  retoque_designado_para_id text,
  retoque_designado_para_nome text,
  total_registros integer not null default 0,
  media_parcela real not null default 0,
  media_cachos_3 real not null default 0,
  origem_dado text not null,
  ordem_coleta text,
  modo_calculo text,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table avaliacao_colaboradores (
  local_id text primary key,
  id text not null unique,
  avaliacao_id text not null,
  colaborador_id text not null,
  papel text not null,
  colaborador_nome text,
  colaborador_primeiro_nome text,
  colaborador_matricula text,
  colaborador_perfil text,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table avaliacao_parcelas (
  local_id text primary key,
  id text not null unique,
  avaliacao_id text not null,
  parcela_id text not null,
  parcela_codigo text not null,
  linha_inicial integer not null,
  linha_final integer not null,
  configurada_em text not null,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table avaliacao_ruas (
  local_id text primary key,
  id text not null unique,
  avaliacao_id text not null,
  parcela_id text not null,
  avaliacao_parcela_id text not null,
  rua_numero integer not null,
  linha_inicial integer not null,
  linha_final integer not null,
  alinhamento_tipo text not null,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table registros_coleta (
  local_id text primary key,
  id text not null unique,
  avaliacao_id text not null,
  parcela_id text not null,
  rua_id text not null,
  colaborador_id text not null,
  quantidade real not null,
  quantidade_cachos_3 real not null default 0,
  observacoes text,
  registrado_em text not null,
  dispositivo_id text not null,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table sync_queue (
  local_id text primary key,
  id text not null unique,
  entidade text not null,
  registro_id text not null,
  operacao text not null,
  payload text not null,
  tentativas integer not null default 0,
  status text not null default 'pending',
  origem text not null,
  criado_em text not null,
  atualizado_em text not null
);

create table sync_logs (
  local_id text primary key,
  id text not null unique,
  dispositivo_id text not null,
  tipo_sync text not null,
  status text not null,
  detalhes text,
  enviado integer not null default 0,
  recebido integer not null default 0,
  criado_em text not null,
  atualizado_em text not null
);

create table dispositivos (
  local_id text primary key,
  id text not null unique,
  nome_dispositivo text not null,
  identificador_local text not null unique,
  ultimo_sync_em text,
  criado_em text not null,
  atualizado_em text not null,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table configuracoes (
  local_id text primary key,
  id text not null unique,
  limite_cocos_chao numeric not null default 19,
  limite_cachos_3_cocos numeric not null default 19,
  permissoes_perfis text not null default '{}',
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table tentativas_login (
  local_id text primary key,
  id text not null unique,
  colaborador_id text,
  identificador_informado text not null,
  sucesso integer not null,
  motivo text not null,
  dispositivo_id text not null,
  criado_em text not null,
  atualizado_em text not null,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table usuario_equipes (
  local_id text primary key,
  id text not null unique,
  usuario_id text not null,
  equipe_id text not null,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table avaliacao_retoques (
  local_id text primary key,
  id text not null unique,
  avaliacao_id text not null,
  avaliacao_original_id text not null,
  responsavel_id text not null,
  responsavel_nome text not null,
  responsavel_matricula text not null,
  equipe_id text,
  equipe_nome text,
  ajudante_ids text not null,
  ajudante_nomes text not null,
  quantidade_bags real not null default 0,
  quantidade_cargas real not null default 0,
  data_retoque text,
  data_inicio text,
  data_fim text,
  observacao text,
  finalizado_por_id text,
  finalizado_por_nome text,
  status text not null default 'em_retoque',
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

create table avaliacao_logs (
  local_id text primary key,
  id text not null unique,
  avaliacao_id text not null,
  parcela_id text,
  colaborador_id text,
  usuario_nome text,
  usuario_perfil text,
  acao text not null,
  descricao text not null,
  criado_em text not null,
  atualizado_em text not null,
  deletado_em text,
  sync_status text not null,
  versao integer not null default 1,
  origem_dispositivo_id text not null
);

alter table colaboradores add column perfil text not null default 'colaborador';
alter table avaliacoes add column tipo text not null default 'normal';
alter table avaliacoes add column avaliacao_original_id text;
alter table avaliacoes add column equipe_id text;
alter table avaliacoes add column equipe_nome text not null default '';
alter table avaliacoes add column responsavel_principal_id text;
alter table avaliacoes add column responsavel_principal_nome text not null default '';
alter table avaliacoes add column inicio_em text;
alter table avaliacoes add column fim_em text;
alter table avaliacoes add column encerrado_por_id text;
alter table avaliacoes add column encerrado_por_nome text not null default '';
alter table avaliacoes add column marcado_retoque_por_id text;
alter table avaliacoes add column marcado_retoque_por_nome text not null default '';
alter table avaliacoes add column marcado_retoque_em text;
alter table avaliacoes add column motivo_retoque text not null default '';
