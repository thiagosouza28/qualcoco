import type { StoreName } from '@/core/types';

export const APP_NAME = 'QualCoco Campo';
export const SESSION_TIMEOUT_MINUTES = 30;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 30;
export const MAX_PARCELAS = 10;

export const STORE_NAMES: StoreName[] = [
  'equipes',
  'colaboradores',
  'usuarioEquipes',
  'parcelas',
  'parcelasPlanejadas',
  'notificacoes',
  'atribuicoesRetoque',
  'avaliacoes',
  'avaliacaoColaboradores',
  'avaliacaoParcelas',
  'avaliacaoRuas',
  'avaliacaoRetoques',
  'avaliacaoLogs',
  'registrosColeta',
  'syncQueue',
  'syncLogs',
  'dispositivos',
  'tentativasLogin',
  'configuracoes',
];

export const STORAGE_KEYS = {
  sessao: 'qualcoco:sessao',
  cloudSession: 'qualcoco:firebase-cloud-session',
  cloudSyncAtPrefix: 'qualcoco:firebase-cloud-sync-at',
  ultimoUsuario: 'qualcoco:ultimo-usuario',
  dispositivoId: 'qualcoco:dispositivo-id',
  registroRuaObservacoesDraftPrefix: 'qualcoco:registro-rua-observacoes-draft',
  dataResetVersion: 'qualcoco:data-reset-version',
  webAcessosSyncAt: 'qualcoco:web-acessos-sync-at',
  parcelasCatalogoSeedVersion: 'qualcoco:parcelas-catalogo-seed-version',
  parcelasCatalogoSyncPolicyVersion: 'qualcoco:parcelas-catalogo-sync-policy-version',
};

export const APP_DATA_RESET_VERSION = '2026-03-19-empty-app-v2';

export const REMOTE_COLLECTION_MAP: Record<StoreName, string | null> = {
  equipes: 'equipes',
  colaboradores: 'colaboradores',
  usuarioEquipes: 'usuario_equipes',
  parcelas: 'parcelas',
  parcelasPlanejadas: 'parcelas_planejadas',
  notificacoes: 'notificacoes',
  atribuicoesRetoque: 'atribuicoes_retoque',
  avaliacoes: 'avaliacoes',
  avaliacaoColaboradores: 'avaliacao_colaboradores',
  avaliacaoParcelas: 'avaliacao_parcelas',
  avaliacaoRuas: 'avaliacao_ruas',
  avaliacaoRetoques: 'avaliacao_retoques',
  avaliacaoLogs: 'avaliacao_logs',
  registrosColeta: 'registros_coleta',
  syncQueue: null,
  syncLogs: 'sync_logs',
  dispositivos: 'dispositivos',
  tentativasLogin: 'tentativas_login',
  configuracoes: 'configuracoes',
};
