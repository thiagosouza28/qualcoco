import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { camelizeKeys, snakeifyKeys } from '@/core/casing';
import { REMOTE_COLLECTION_MAP, STORE_NAMES, STORAGE_KEYS } from '@/core/constants';
import { isAfter, nowIso } from '@/core/date';
import { getDeviceId, getOrCreateDevice } from '@/core/device';
import {
  cloudConfigurationHint,
  cloudProviderMode,
  ensureCloudDeviceSession,
  fetchCloudCapabilities,
  fetchCloudCollectionRows,
  fetchCloudPublicColaboradores,
  firebaseRemoteCompat,
  getCloudSessionSafe,
  isCloudConfigured,
} from '@/core/firebaseCloud';
import { inferirAlinhamentoTipoPorLinha } from '@/core/plots';
import {
  addSyncLog,
  bulkPut,
  deleteRecord,
  filterRecords,
  getById,
  listAll,
  putRecord,
} from '@/core/localDb';
import { saveEntity } from '@/core/repositories';
import type {
  BaseEntity,
  Colaborador,
  PacoteSyncLocal,
  StoreName,
  SyncLog,
  SyncQueueItem,
} from '@/core/types';

const syncableStores = STORE_NAMES.filter((storeName) => REMOTE_COLLECTION_MAP[storeName]);
const webAccessSyncStores: StoreName[] = ['colaboradores'];
const SYNC_PAGE_SIZE = 50;
const WEB_ACCESS_SYNC_PAGE_SIZE = 200;
const REMOTE_TABLE_MAP = REMOTE_COLLECTION_MAP;

const syncPriority: Record<StoreName, number> = {
  dispositivos: 0,
  equipes: 1,
  colaboradores: 2,
  parcelas: 3,
  avaliacoes: 4,
  avaliacaoColaboradores: 5,
  avaliacaoParcelas: 6,
  avaliacaoRuas: 7,
  registrosColeta: 8,
  tentativasLogin: 9,
  configuracoes: 10,
  syncLogs: 11,
  syncQueue: 99,
};

const remoteFieldsByStore: Partial<Record<StoreName, string[]>> = {
  equipes: [
    'id',
    'localId',
    'numero',
    'nome',
    'fiscal',
    'ativa',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  colaboradores: [
    'id',
    'localId',
    'nome',
    'primeiroNome',
    'matricula',
    'pinHash',
    'pinSalt',
    'ativo',
    'authUserId',
    'authEmail',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  parcelas: [
    'id',
    'localId',
    'codigo',
    'descricao',
    'ativo',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  dispositivos: [
    'id',
    'localId',
    'nomeDispositivo',
    'identificadorLocal',
    'ultimoSyncEm',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  avaliacoes: [
    'id',
    'localId',
    'usuarioId',
    'dispositivoId',
    'dataAvaliacao',
    'dataColheita',
    'observacoes',
    'status',
    'totalRegistros',
    'mediaParcela',
    'mediaCachos3',
    'origemDado',
    'ordemColeta',
    'modoCalculo',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  avaliacaoColaboradores: [
    'id',
    'localId',
    'avaliacaoId',
    'colaboradorId',
    'papel',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  avaliacaoParcelas: [
    'id',
    'localId',
    'avaliacaoId',
    'parcelaId',
    'parcelaCodigo',
    'linhaInicial',
    'linhaFinal',
    'configuradaEm',
    'faixasFalha',
    'siglasResumo',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  avaliacaoRuas: [
    'id',
    'localId',
    'avaliacaoId',
    'parcelaId',
    'dataAvaliacao',
    'avaliacaoParcelaId',
    'ruaNumero',
    'linhaInicial',
    'linhaFinal',
    'alinhamentoTipo',
    'sentidoRuas',
    'equipeId',
    'equipeNome',
    'tipoFalha',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  registrosColeta: [
    'id',
    'localId',
    'avaliacaoId',
    'parcelaId',
    'ruaId',
    'colaboradorId',
    'quantidade',
    'quantidadeCachos3',
    'observacoes',
    'registradoEm',
    'dispositivoId',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  tentativasLogin: [
    'id',
    'localId',
    'colaboradorId',
    'identificadorInformado',
    'sucesso',
    'motivo',
    'dispositivoId',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  configuracoes: [
    'id',
    'localId',
    'limiteCocosChao',
    'limiteCachos3Cocos',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
  syncLogs: [
    'id',
    'localId',
    'dispositivoId',
    'tipoSync',
    'status',
    'detalhes',
    'enviado',
    'recebido',
    'criadoEm',
    'atualizadoEm',
    'deletadoEm',
    'syncStatus',
    'versao',
    'origemDispositivoId',
    'syncError',
  ],
};

type SyncSchemaCapabilities = {
  supportsAvaliacaoMediaCachos3: boolean;
  supportsRegistroQuantidadeCachos3: boolean;
  supportsAvaliacaoFinalStatus: boolean;
  supportsAvaliacaoFlowOptions: boolean;
  supportsAvaliacaoRuaTipoFalha: boolean;
  supportsAvaliacaoDataColheita: boolean;
  warnings: string[];
};

export type SyncExecutionResult = {
  enviado: number;
  recebido: number;
  conflitos: number;
  erro: string;
  avisos: string[];
  duracaoMs: number;
};

export type SyncProgressPhase =
  | 'preparing'
  | 'push'
  | 'pull'
  | 'finalizing'
  | 'completed';

export type SyncProgressSnapshot = {
  phase: SyncProgressPhase;
  label: string;
  percent: number;
  currentStore: StoreName | null;
  currentStoreLabel: string;
  currentPage: number;
  pushCompleted: number;
  pushTotal: number;
  pullCompleted: number;
  pullTotal: number;
  storeRowsCompleted: number;
  storeRowsTotal: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
};

export type CloudDiagnostics = {
  configured: boolean;
  keyMode: typeof cloudProviderMode;
  online: boolean;
  reachable: boolean;
  authReady: boolean;
  schemaWarnings: string[];
  accessHint: string;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'warning' | 'error' | 'idle';
  lastSyncDetails: string;
};

const SYNC_STORE_LABELS: Partial<Record<StoreName, string>> = {
  dispositivos: 'dispositivos',
  equipes: 'equipes',
  colaboradores: 'colaboradores',
  parcelas: 'parcelas',
  avaliacoes: 'avalia\u00e7\u00f5es',
  avaliacaoColaboradores: 'participantes da avalia\u00e7\u00e3o',
  avaliacaoParcelas: 'parcelas da avalia\u00e7\u00e3o',
  avaliacaoRuas: 'ruas da avalia\u00e7\u00e3o',
  registrosColeta: 'registros de coleta',
  tentativasLogin: 'tentativas de login',
  configuracoes: 'configura\u00e7\u00f5es',
  syncLogs: 'logs de sincroniza\u00e7\u00e3o',
};

const getSyncStoreLabel = (storeName: StoreName | null) =>
  storeName ? SYNC_STORE_LABELS[storeName] || storeName : '';

let syncSchemaCapabilitiesPromise: Promise<SyncSchemaCapabilities> | null = null;
const REMOTE_DISABLED_FIELDS = new Set(['syncError']);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMPTY_SYNC_SCHEMA_CAPABILITIES: SyncSchemaCapabilities = {
  supportsAvaliacaoMediaCachos3: false,
  supportsRegistroQuantidadeCachos3: false,
  supportsAvaliacaoFinalStatus: false,
  supportsAvaliacaoFlowOptions: false,
  supportsAvaliacaoRuaTipoFalha: false,
  supportsAvaliacaoDataColheita: false,
  warnings: [],
};

const isValidUuid = (value: unknown) =>
  typeof value === 'string' && UUID_REGEX.test(value.trim());

const toSnakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([a-zA-Z])(\d)/g, '$1_$2')
    .replace(/(\d)([a-zA-Z])/g, '$1_$2')
    .toLowerCase();

const getEnabledRemoteFields = (
  storeName: StoreName,
  capabilities?: SyncSchemaCapabilities,
) =>
  (remoteFieldsByStore[storeName] || ['id']).filter((field) => {
    if (REMOTE_DISABLED_FIELDS.has(field)) {
      return false;
    }

    if (
      storeName === 'avaliacoes' &&
      field === 'dataColheita' &&
      !capabilities?.supportsAvaliacaoDataColheita
    ) {
      return false;
    }

    return true;
  });

const getRemoteSelectClause = (
  storeName: StoreName,
  capabilities?: SyncSchemaCapabilities,
) => {
  const fields = getEnabledRemoteFields(storeName, capabilities);
  return fields.map((field) => toSnakeCase(field)).join(',');
};

function getCloudErrorMeta(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      message: error instanceof Error ? error.message : String(error || 'Erro desconhecido'),
      code: '',
      status: 0,
      hint: '',
    };
  }

  return {
    message: 'message' in error ? String(error.message || '') : String(error),
    code: 'code' in error ? String(error.code || '') : '',
    status:
      'status' in error && typeof error.status === 'number'
        ? error.status
        : 'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : 0,
    hint: 'hint' in error ? String(error.hint || '') : '',
  };
}

const isCloudUnavailableError = (error: unknown) => {
  const meta = getCloudErrorMeta(error);
  const normalizedMessage = `${meta.message} ${meta.hint}`.toLowerCase();

  return (
    meta.status === 503 ||
    meta.status === 521 ||
    normalizedMessage.includes(' 521') ||
    normalizedMessage.includes('http 521') ||
    normalizedMessage.includes('web server is down') ||
    normalizedMessage.includes('origin down') ||
    normalizedMessage.includes('cloudflare')
  );
};

const isCloudTimeoutError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  const meta = getCloudErrorMeta(error);
  const normalizedMessage = `${meta.message} ${meta.hint}`.toLowerCase();
  return (
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('timed out') ||
    normalizedMessage.includes('aborterror') ||
    normalizedMessage.includes('aborted')
  );
};

const isCloudTransportError = (error: unknown) => {
  const meta = getCloudErrorMeta(error);
  const normalizedMessage = `${meta.message} ${meta.hint}`.toLowerCase();

  return (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes('load failed') ||
    normalizedMessage.includes('fetch failed')
  );
};

function formatSyncError(error: unknown): string {
  if (isCloudTransportError(error)) {
    return 'Falha de transporte ao falar com o Firebase. Verifique a rede do aparelho.';
  }

  if (isCloudTimeoutError(error)) {
    return 'A opera\u00e7\u00e3o com a nuvem demorou demais e foi cancelada.';
  }

  if (isCloudUnavailableError(error)) {
    return 'A nuvem n\u00e3o respondeu corretamente. Tente novamente quando a conex\u00e3o estabilizar.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error) {
    const meta = getCloudErrorMeta(error);
    const parts = [
      meta.message,
      meta.code ? `(C\u00f3digo: ${meta.code})` : '',
      meta.hint ? `Dica: ${meta.hint}` : '',
    ].filter(Boolean);
    
    if (parts.length > 0) return parts.join(' | ');
    if ('message' in error) return String(error.message);
  }

  return 'Erro desconhecido de sincroniza\u00e7\u00e3o.';
}

const getCloudSyncCapabilities = async (
  forceRefresh = false,
): Promise<SyncSchemaCapabilities> => {
  if (!isCloudConfigured) {
    return {
      ...EMPTY_SYNC_SCHEMA_CAPABILITIES,
      warnings: ['Firebase n\u00e3o configurado no ambiente.'],
    };
  }

  if (!forceRefresh && syncSchemaCapabilitiesPromise) {
    return syncSchemaCapabilitiesPromise;
  }

  syncSchemaCapabilitiesPromise = (async () => {
    try {
      const capabilities = await fetchCloudCapabilities();

      return {
        supportsAvaliacaoMediaCachos3: capabilities.supportsAvaliacaoMediaCachos3,
        supportsRegistroQuantidadeCachos3: capabilities.supportsRegistroQuantidadeCachos3,
        supportsAvaliacaoFinalStatus: capabilities.supportsAvaliacaoFinalStatus,
        supportsAvaliacaoFlowOptions: capabilities.supportsAvaliacaoFlowOptions,
        supportsAvaliacaoRuaTipoFalha: capabilities.supportsAvaliacaoRuaTipoFalha,
        supportsAvaliacaoDataColheita:
          capabilities.supportsAvaliacaoDataColheita ?? true,
        warnings: capabilities.warnings || [],
      };
    } catch (error) {
      syncSchemaCapabilitiesPromise = null;
      throw error;
    }
  })();

  return syncSchemaCapabilitiesPromise;
};

const isCloudAccessError = (error: unknown) => {
  if (isCloudTransportError(error)) {
    return true;
  }

  if (isCloudTimeoutError(error)) {
    return true;
  }

  if (isCloudUnavailableError(error)) {
    return true;
  }

  const meta = getCloudErrorMeta(error);
  const normalizedMessage = `${meta.message} ${meta.hint}`.toLowerCase();

  return (
    meta.status === 401 ||
    meta.status === 403 ||
    meta.code === '42501' ||
    meta.code === 'permission-denied' ||
    normalizedMessage.includes('permission denied') ||
    normalizedMessage.includes('missing or insufficient permissions') ||
    normalizedMessage.includes('row-level security') ||
    normalizedMessage.includes('invalid api key') ||
    normalizedMessage.includes('invalid jwt') ||
    normalizedMessage.includes('jwt') ||
    normalizedMessage.includes('unauthorized')
  );
};

const formatCloudAccessHint = (error: unknown) => {
  if (isCloudTransportError(error)) {
    return 'A conex\u00e3o com o Firebase falhou em n\u00edvel de transporte. Verifique a rede do aparelho.';
  }

  if (isCloudTimeoutError(error)) {
    return 'A opera\u00e7\u00e3o com o Firebase demorou demais e foi cancelada. Tente novamente com uma conex\u00e3o mais est\u00e1vel.';
  }

  if (isCloudUnavailableError(error)) {
    return 'A nuvem n\u00e3o respondeu corretamente. Isso indica indisponibilidade tempor\u00e1ria do servi\u00e7o ou da rede.';
  }

  const meta = getCloudErrorMeta(error);
  const normalizedMessage = `${meta.message} ${meta.hint}`.toLowerCase();

  if (normalizedMessage.includes('anonymous sign-ins are disabled')) {
    return 'A sess\u00e3o de dispositivo do Firebase foi recusada. Verifique a autentica\u00e7\u00e3o e tente novamente.';
  }

  if (
    meta.code === '42501' ||
    meta.code === 'permission-denied' ||
    normalizedMessage.includes('permission denied') ||
    normalizedMessage.includes('missing or insufficient permissions')
  ) {
    return 'O Firebase recusou acesso aos documentos. Revise as regras do Firestore.';
  }

  if (
    meta.status === 401 ||
    normalizedMessage.includes('invalid api key') ||
    normalizedMessage.includes('invalid jwt') ||
    normalizedMessage.includes('jwt')
  ) {
    return 'A configura\u00e7\u00e3o do Firebase foi recusada. Atualize as vari\u00e1veis VITE_FIREBASE_* com o projeto correto.';
  }

  return `Falha de acesso na nuvem: ${meta.message}`;
};

const sanitizeRemotePayload = (
  storeName: StoreName,
  payload: Record<string, unknown>,
  capabilities?: SyncSchemaCapabilities,
) => {
  const allowedFields = getEnabledRemoteFields(storeName, capabilities);
  if (!allowedFields) {
    return {};
  }

  const sanitized = allowedFields.reduce((acc, field) => {
    const value = payload[field];
    if (typeof value !== 'undefined') {
      acc[field] = value;
    }
    // Garanter que campos de identificacao nunca sejam removidos se existirem no objeto original
    if (field === 'id' && !acc.id && payload.id) acc.id = payload.id;
    if (field === 'localId' && !acc.localId && payload.localId) acc.localId = payload.localId;
    
    return acc;
  }, {} as Record<string, unknown>);

  // Garante campos obrigatórios de sincronização
  if (payload.id && !sanitized.id) sanitized.id = payload.id;
  if (payload.localId && !sanitized.localId) sanitized.localId = payload.localId;

  if (storeName === 'avaliacoes') {
    if (!capabilities?.supportsAvaliacaoDataColheita) {
      delete sanitized.dataColheita;
    }

    if (!capabilities?.supportsAvaliacaoMediaCachos3) {
      delete sanitized.mediaCachos3;
    }

    if (!capabilities?.supportsAvaliacaoFlowOptions) {
      delete sanitized.ordemColeta;
      delete sanitized.modoCalculo;
    }

    if (
      !capabilities?.supportsAvaliacaoFinalStatus &&
      (sanitized.status === 'ok' || sanitized.status === 'refazer')
    ) {
      sanitized.status = 'completed';
    }
  }

  if (
    storeName === 'registrosColeta' &&
    !capabilities?.supportsRegistroQuantidadeCachos3
  ) {
    delete sanitized.quantidadeCachos3;
  }

  if (storeName === 'configuracoes') {
    const deviceId = getDeviceId();
    const configId =
      typeof sanitized.id === 'string' && sanitized.id.trim()
        ? sanitized.id.trim()
        : 'default';

    sanitized.id = configId;
    sanitized.localId =
      typeof sanitized.localId === 'string' && sanitized.localId.trim()
        ? sanitized.localId.trim()
        : `config:${configId}`;
    sanitized.versao =
      typeof sanitized.versao === 'number' && Number.isFinite(sanitized.versao)
        ? Math.max(1, sanitized.versao)
        : 1;

    if (!isValidUuid(sanitized.origemDispositivoId)) {
      sanitized.origemDispositivoId = deviceId;
    }
  }

  if (storeName === 'avaliacaoRuas' && !sanitized.alinhamentoTipo) {
    sanitized.alinhamentoTipo = inferirAlinhamentoTipoPorLinha(
      sanitized.linhaInicial,
    );
  }

  if (
    storeName === 'avaliacaoRuas' &&
    !capabilities?.supportsAvaliacaoRuaTipoFalha
  ) {
    delete sanitized.tipoFalha;
  }

  return sanitized;
};

const normalizarFilaSync = async (
  schemaCapabilities?: SyncSchemaCapabilities | null,
) => {
  const queue = await listAll<SyncQueueItem>('syncQueue');

  for (const item of queue) {
    const tableName = REMOTE_TABLE_MAP[item.entidade];
    if (!tableName) {
      await deleteRecord('syncQueue', item.id);
      continue;
    }

    // Tentar recuperar o registro original para garantir que o payload esteja completo
    const actualRecord = (await getById(item.entidade, item.registroId)) as BaseEntity | undefined;
    let workingPayload = { ...item.payload, ...(actualRecord || {}) } as Record<string, unknown>;

    if (item.entidade === 'avaliacaoRuas' && !workingPayload.dataAvaliacao) {
      const avaliacaoId = String(workingPayload.avaliacaoId || '').trim();
      if (avaliacaoId) {
        const avaliacao = await getById<(BaseEntity & Record<string, unknown>)>(
          'avaliacoes',
          avaliacaoId,
        );
        const dataAvaliacao =
          typeof avaliacao?.dataAvaliacao === 'string' && avaliacao.dataAvaliacao.trim()
            ? avaliacao.dataAvaliacao
            : '';

        if (dataAvaliacao) {
          workingPayload = {
            ...workingPayload,
            dataAvaliacao,
          };

          if (actualRecord && !(actualRecord as Record<string, unknown>).dataAvaliacao) {
            await putRecord(item.entidade, {
              ...actualRecord,
              dataAvaliacao,
            });
          }
        }
      }
    }

    const sanitizedPayload =
      item.operacao === 'upsert'
        ? sanitizeRemotePayload(
            item.entidade,
            workingPayload,
            schemaCapabilities || undefined,
          )
        : item.payload;

    // Se o payload sanificado estiver vazio ou sem o campo essencial localId, e for um upsert, tentamos corrigir
    if (item.operacao === 'upsert') {
      if (Object.keys(sanitizedPayload).length === 0) {
        console.warn(`[Sync] Payload vazio para ${item.entidade}:${item.registroId}, removendo da fila.`);
        await deleteRecord('syncQueue', item.id);
        continue;
      }
      
      // Garantir que localId e id existam para upsert
      if (!sanitizedPayload.id && actualRecord?.id) {
        sanitizedPayload.id = actualRecord.id;
      }
      
      if (!sanitizedPayload.localId) {
        const fallbackLocalId = actualRecord?.localId || (actualRecord as any)?.id || item.registroId;
        
        if (!fallbackLocalId) {
          console.error(`[Sync] Item sem identificador local detectado em ${item.entidade}, removendo item corrompido.`);
          await deleteRecord('syncQueue', item.id);
          continue;
        }

        sanitizedPayload.localId = fallbackLocalId;
        
        // Se o registro no banco local também estava sem ID, atualizamos ele também
        if (actualRecord && !actualRecord.localId) {
          await putRecord(item.entidade, { ...actualRecord, localId: fallbackLocalId });
        }
      }
    }

    const needsReset =
      item.status === 'processing' ||
      item.status === 'error' ||
      item.ultimoErro ||
      JSON.stringify(sanitizedPayload) !== JSON.stringify(item.payload);

    if (!needsReset) continue;

    await putRecord('syncQueue', {
      ...item,
      payload: sanitizedPayload,
      status: 'pending',
      ultimoErro: null,
      atualizadoEm: nowIso(),
    });
  }
};

const getCloudStoreSyncStorageKey = (storeName: StoreName) =>
  `${STORAGE_KEYS.cloudSyncAtPrefix}:${storeName}`;

const getLastCloudStoreSyncAt = (storeName: StoreName) =>
  window.localStorage.getItem(getCloudStoreSyncStorageKey(storeName));

const setLastCloudStoreSyncAt = (storeName: StoreName, value: string) => {
  window.localStorage.setItem(getCloudStoreSyncStorageKey(storeName), value);
};

const getLastWebAccessSyncAt = () =>
  window.localStorage.getItem(STORAGE_KEYS.webAcessosSyncAt);

const setLastWebAccessSyncAt = (value: string) => {
  window.localStorage.setItem(STORAGE_KEYS.webAcessosSyncAt, value);
};

const businessKeyResolvers: Partial<
  Record<StoreName, (record: Record<string, unknown>) => string>
> = {
  colaboradores: (record) => String(record.matricula || '').trim().toLowerCase(),
  equipes: (record) => String(record.numero ?? '').trim(),
  parcelas: (record) => String(record.codigo || '').trim().toUpperCase(),
  dispositivos: (record) =>
    String(record.identificadorLocal || '').trim().toLowerCase(),
  avaliacaoColaboradores: (record) =>
    `${String(record.avaliacaoId || '').trim()}:${String(record.colaboradorId || '').trim()}`,
  avaliacaoParcelas: (record) =>
    `${String(record.avaliacaoId || '').trim()}:${String(record.parcelaId || '').trim()}`,
  avaliacaoRuas: (record) =>
    [
      String(record.avaliacaoId || '').trim(),
      String(record.parcelaId || '').trim(),
      String(record.dataAvaliacao || '').trim(),
      String(record.ruaNumero ?? '').trim(),
    ].join(':'),
};

const referenceFieldsByTargetStore: Partial<
  Record<StoreName, Array<{ storeName: StoreName; field: string }>>
> = {
  colaboradores: [
    { storeName: 'avaliacoes', field: 'usuarioId' },
    { storeName: 'avaliacaoColaboradores', field: 'colaboradorId' },
    { storeName: 'registrosColeta', field: 'colaboradorId' },
    { storeName: 'tentativasLogin', field: 'colaboradorId' },
  ],
  equipes: [{ storeName: 'avaliacaoRuas', field: 'equipeId' }],
  parcelas: [
    { storeName: 'avaliacaoParcelas', field: 'parcelaId' },
    { storeName: 'avaliacaoRuas', field: 'parcelaId' },
    { storeName: 'registrosColeta', field: 'parcelaId' },
  ],
  dispositivos: [
    { storeName: 'avaliacoes', field: 'dispositivoId' },
    { storeName: 'registrosColeta', field: 'dispositivoId' },
    { storeName: 'tentativasLogin', field: 'dispositivoId' },
    { storeName: 'syncLogs', field: 'dispositivoId' },
  ],
  avaliacaoParcelas: [{ storeName: 'avaliacaoRuas', field: 'avaliacaoParcelaId' }],
  avaliacaoRuas: [{ storeName: 'registrosColeta', field: 'ruaId' }],
};

const getBusinessKeyValue = (
  storeName: StoreName,
  record: Record<string, unknown>,
) => {
  const resolver = businessKeyResolvers[storeName];
  if (!resolver) return '';
  return resolver(record);
};

const getColaboradorBusinessKey = (
  record: Partial<Colaborador> & Record<string, unknown>,
) => String(record.matricula || '').trim().toLowerCase();

const findEquivalentLocalRecord = async (
  storeName: StoreName,
  incoming: BaseEntity,
) => {
  const businessKey = getBusinessKeyValue(
    storeName,
    incoming as unknown as Record<string, unknown>,
  );
  if (!businessKey) return null;

  const records = await listAll<BaseEntity & Record<string, unknown>>(storeName);
  return (
    records.find(
      (item) =>
        item.id !== incoming.id &&
        getBusinessKeyValue(storeName, item) === businessKey,
    ) || null
  );
};

const updatePersistedIdsAfterRemap = (
  storeName: StoreName,
  oldId: string,
  nextId: string,
) => {
  if (storeName === 'colaboradores') {
    const raw = window.localStorage.getItem(STORAGE_KEYS.sessao);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { colaboradorId?: string };
        if (parsed.colaboradorId === oldId) {
          window.localStorage.setItem(
            STORAGE_KEYS.sessao,
            JSON.stringify({ ...parsed, colaboradorId: nextId }),
          );
        }
      } catch {
        // Ignora sessao malformada.
      }
    }
  }

  if (
    storeName === 'dispositivos' &&
    window.localStorage.getItem(STORAGE_KEYS.dispositivoId) === oldId
  ) {
    window.localStorage.setItem(STORAGE_KEYS.dispositivoId, nextId);
  }
};

const remapQueuedReferences = async (
  targetStore: StoreName,
  oldId: string,
  nextId: string,
) => {
  const queue = await listAll<SyncQueueItem>('syncQueue');
  const references = referenceFieldsByTargetStore[targetStore] || [];

  for (const item of queue) {
    let changed = false;
    const nextItem = {
      ...item,
      payload: { ...item.payload },
    } as SyncQueueItem;

    if (item.entidade === targetStore && item.registroId === oldId) {
      nextItem.registroId = nextId;
      if (nextItem.payload.id === oldId) {
        nextItem.payload.id = nextId;
      }
      changed = true;
    }

    for (const reference of references) {
      if (item.entidade !== reference.storeName) continue;
      if (nextItem.payload[reference.field] !== oldId) continue;
      nextItem.payload[reference.field] = nextId;
      changed = true;
    }

    if (changed) {
      await putRecord('syncQueue', {
        ...nextItem,
        atualizadoEm: nowIso(),
      });
    }
  }
};

const remapStoreReferences = async (
  targetStore: StoreName,
  oldId: string,
  nextId: string,
) => {
  const references = referenceFieldsByTargetStore[targetStore] || [];

  for (const reference of references) {
    const records = await listAll<(BaseEntity & Record<string, unknown>)>(
      reference.storeName,
    );

    for (const record of records) {
      if (record[reference.field] !== oldId) continue;

      await saveEntity(
        reference.storeName as never,
        {
          ...record,
          [reference.field]: nextId,
        } as never,
      );
    }
  }
};

const persistRemoteRecord = async (
  storeName: StoreName,
  incoming: BaseEntity,
  forceSynced = true,
) => {
  const currentById = await getById<BaseEntity & Record<string, unknown>>(
    storeName,
    incoming.id,
  );
  const equivalent =
    currentById ||
    (await findEquivalentLocalRecord(storeName, incoming));

  const nextRecord = {
    ...(equivalent || {}),
    ...incoming,
    syncStatus: forceSynced ? ('synced' as const) : incoming.syncStatus,
  } as BaseEntity & Record<string, unknown>;

  if (equivalent && equivalent.id !== incoming.id) {
    await remapStoreReferences(storeName, equivalent.id, incoming.id);
    await remapQueuedReferences(storeName, equivalent.id, incoming.id);
    await deleteRecord(storeName, equivalent.id);
    updatePersistedIdsAfterRemap(storeName, equivalent.id, incoming.id);
  }

  await putRecord(storeName, nextRecord);
  return nextRecord;
};

const mergeIncomingRecord = async (storeName: StoreName, incoming: BaseEntity) => {
  const current =
    (await getById<BaseEntity & Record<string, unknown>>(storeName, incoming.id)) ||
    (await findEquivalentLocalRecord(storeName, incoming));
  const remoteRecord = {
    ...(current || {}),
    ...incoming,
    syncStatus: 'synced' as const,
  };

  if (!current) {
    await persistRemoteRecord(storeName, remoteRecord);
    return 'received' as const;
  }

  if (current.syncStatus === 'pending_sync' && isAfter(current.atualizadoEm, incoming.atualizadoEm)) {
    return 'kept-local' as const;
  }

  if (current.syncStatus === 'pending_sync' && isAfter(incoming.atualizadoEm, current.atualizadoEm)) {
    await persistRemoteRecord(storeName, { ...remoteRecord, syncStatus: 'conflict' as const }, false);
    return 'conflict' as const;
  }

  if (incoming.versao > current.versao || isAfter(incoming.atualizadoEm, current.atualizadoEm)) {
    await persistRemoteRecord(storeName, remoteRecord);
    return 'received' as const;
  }

  if (current.syncStatus !== 'synced') {
    await putRecord(storeName, {
      ...current,
      syncStatus: 'synced',
    });
  }

  return 'ignored' as const;
};

const pullCollaboradoresForWebAccess = async (
  lastSyncAt?: string,
  onPage?: (page: { pageNumber: number; rowsLoaded: number }) => void,
) => {
  const rows: Colaborador[] = [];
  let afterUpdatedAt: string | undefined;
  let afterId: string | undefined;
  let pageNumber = 0;

  while (true) {
    const response = await fetchCloudPublicColaboradores({
      updatedAfter: lastSyncAt,
      afterUpdatedAt,
      afterId,
      limit: WEB_ACCESS_SYNC_PAGE_SIZE,
      fields: [
        'id',
        'local_id',
        'nome',
        'primeiro_nome',
        'matricula',
        'pin_hash',
        'pin_salt',
        'ativo',
        'auth_user_id',
        'auth_email',
        'criado_em',
        'atualizado_em',
        'deletado_em',
        'sync_status',
        'versao',
        'origem_dispositivo_id',
      ].join(','),
    });

    const page = (response.rows || []).map((item) => camelizeKeys(item) as Colaborador);
    rows.push(...page);
    pageNumber += 1;
    onPage?.({
      pageNumber,
      rowsLoaded: rows.length,
    });

    if (page.length === 0 || !response.cursor?.hasMore) {
      break;
    }

    afterUpdatedAt = response.cursor.afterUpdatedAt || undefined;
    afterId = response.cursor.afterId || undefined;
  }

  return rows;
};

const mergeIncomingColaboradoresBatch = async (
  rows: Colaborador[],
  currentRecordsInput?: Colaborador[],
) => {
  if (rows.length === 0) {
    return {
      recebido: 0,
      conflitos: 0,
    };
  }

  const currentRecords =
    currentRecordsInput || (await listAll<Colaborador>('colaboradores'));
  if (currentRecords.length === 0) {
    const syncedRows = rows.map<Colaborador>((row) => ({
      ...row,
      syncStatus: 'synced',
    }));

    await bulkPut('colaboradores', syncedRows);
    return {
      recebido: syncedRows.length,
      conflitos: 0,
    };
  }

  const currentById = new Map(currentRecords.map((record) => [record.id, record]));
  const currentByBusinessKey = new Map(
    currentRecords
      .map((record) => [getColaboradorBusinessKey(record), record] as const)
      .filter(([key]) => Boolean(key)),
  );

  const recordsToPut = new Map<string, Colaborador>();
  const idsToDelete = new Set<string>();
  let recebido = 0;
  let conflitos = 0;

  for (const incoming of rows) {
    const current =
      currentById.get(incoming.id) ||
      currentByBusinessKey.get(getColaboradorBusinessKey(incoming)) ||
      null;

    const remoteRecord: Colaborador = {
      ...(current || {}),
      ...incoming,
      syncStatus: 'synced',
    };

    if (!current) {
      recordsToPut.set(remoteRecord.id, remoteRecord);
      currentById.set(remoteRecord.id, remoteRecord);
      currentByBusinessKey.set(getColaboradorBusinessKey(remoteRecord), remoteRecord);
      recebido += 1;
      continue;
    }

    if (
      current.syncStatus === 'pending_sync' &&
      isAfter(current.atualizadoEm, incoming.atualizadoEm)
    ) {
      currentById.set(current.id, current);
      currentByBusinessKey.set(getColaboradorBusinessKey(current), current);
      continue;
    }

    if (
      current.syncStatus === 'pending_sync' &&
      isAfter(incoming.atualizadoEm, current.atualizadoEm)
    ) {
      if (current.id !== incoming.id) {
        await remapStoreReferences('colaboradores', current.id, incoming.id);
        await remapQueuedReferences('colaboradores', current.id, incoming.id);
        idsToDelete.add(current.id);
        updatePersistedIdsAfterRemap('colaboradores', current.id, incoming.id);
        currentById.delete(current.id);
      }

      const conflictRecord: Colaborador = {
        ...remoteRecord,
        syncStatus: 'conflict',
      };
      recordsToPut.set(conflictRecord.id, conflictRecord);
      currentById.set(conflictRecord.id, conflictRecord);
      currentByBusinessKey.set(
        getColaboradorBusinessKey(conflictRecord),
        conflictRecord,
      );
      conflitos += 1;
      continue;
    }

    if (
      current.id !== incoming.id ||
      incoming.versao > current.versao ||
      isAfter(incoming.atualizadoEm, current.atualizadoEm)
    ) {
      if (current.id !== incoming.id) {
        await remapStoreReferences('colaboradores', current.id, incoming.id);
        await remapQueuedReferences('colaboradores', current.id, incoming.id);
        idsToDelete.add(current.id);
        updatePersistedIdsAfterRemap('colaboradores', current.id, incoming.id);
        currentById.delete(current.id);
      }

      recordsToPut.set(remoteRecord.id, remoteRecord);
      currentById.set(remoteRecord.id, remoteRecord);
      currentByBusinessKey.set(getColaboradorBusinessKey(remoteRecord), remoteRecord);
      recebido += 1;
      continue;
    }

    if (current.syncStatus !== 'synced') {
      const syncedRecord: Colaborador = {
        ...current,
        syncStatus: 'synced',
      };
      recordsToPut.set(syncedRecord.id, syncedRecord);
      currentById.set(syncedRecord.id, syncedRecord);
      currentByBusinessKey.set(getColaboradorBusinessKey(syncedRecord), syncedRecord);
    }
  }

  for (const id of idsToDelete) {
    await deleteRecord('colaboradores', id);
  }

  if (recordsToPut.size > 0) {
    await bulkPut('colaboradores', Array.from(recordsToPut.values()));
  }

  return {
    recebido,
    conflitos,
  };
};

const updateQueueItem = async (item: SyncQueueItem, patch: Partial<SyncQueueItem>) => {
  const current = await getById<SyncQueueItem>('syncQueue', item.id);
  if (!current) {
    return null;
  }

  const next: SyncQueueItem = {
    ...current,
    ...patch,
    atualizadoEm: nowIso(),
  };

  await putRecord('syncQueue', next);
  return next;
};

const markQueueItemError = async (item: SyncQueueItem, error: unknown) => {
  const current = (await getById<SyncQueueItem>('syncQueue', item.id)) || item;
  return updateQueueItem(current, {
    status: 'error',
    tentativas: current.tentativas + 1,
    ultimoErro: formatSyncError(error),
  });
};

const resetQueueItemPending = async (item: SyncQueueItem) =>
  updateQueueItem(item, {
    status: 'pending',
    ultimoErro: null,
  });

const listQueueByPriority = async () => {
  const queue = await listAll<SyncQueueItem>('syncQueue');
  const activeQueue: SyncQueueItem[] = [];

  for (const item of queue) {
    if (item.status === 'processing') {
      const resetItem = await updateQueueItem(item, { status: 'pending' });
      if (resetItem) {
        activeQueue.push(resetItem);
      }
      continue;
    }

    activeQueue.push(item);
  }

  const upserts = activeQueue
    .filter((item) => item.operacao === 'upsert')
    .sort((left, right) => {
      const priorityDelta = syncPriority[left.entidade] - syncPriority[right.entidade];
      if (priorityDelta !== 0) return priorityDelta;
      return left.criadoEm.localeCompare(right.criadoEm);
    });

  const deletes = activeQueue
    .filter((item) => item.operacao === 'delete')
    .sort((left, right) => {
      const priorityDelta = syncPriority[right.entidade] - syncPriority[left.entidade];
      if (priorityDelta !== 0) return priorityDelta;
      return left.criadoEm.localeCompare(right.criadoEm);
    });

  return [...upserts, ...deletes];
};

const findReplacementRuaForRegistroColeta = async (
  registro: Record<string, unknown>,
  referencedRua?: (BaseEntity & Record<string, unknown>) | null,
) => {
  const avaliacaoId = String(referencedRua?.avaliacaoId || registro.avaliacaoId || '').trim();
  const parcelaId = String(referencedRua?.parcelaId || registro.parcelaId || '').trim();
  const ruaNumero = Number(referencedRua?.ruaNumero || 0);
  const linhaInicial = Number(referencedRua?.linhaInicial || 0);
  const linhaFinal = Number(referencedRua?.linhaFinal || 0);

  let dataAvaliacao = String(referencedRua?.dataAvaliacao || '').trim();
  if (!dataAvaliacao && avaliacaoId) {
    const avaliacao = await getById<(BaseEntity & Record<string, unknown>)>(
      'avaliacoes',
      avaliacaoId,
    );
    dataAvaliacao =
      typeof avaliacao?.dataAvaliacao === 'string'
        ? avaliacao.dataAvaliacao.trim()
        : '';
  }

  if (!avaliacaoId || !parcelaId) {
    return null;
  }

  const ruas = await listAll<(BaseEntity & Record<string, unknown>)>('avaliacaoRuas');
  const ativas = ruas.filter((item) => !item.deletadoEm);

  if (ruaNumero > 0) {
    const byNumero = ativas.find(
      (item) =>
        item.id !== referencedRua?.id &&
        item.avaliacaoId === avaliacaoId &&
        item.parcelaId === parcelaId &&
        String(item.dataAvaliacao || '').trim() === dataAvaliacao &&
        Number(item.ruaNumero || 0) === ruaNumero,
    );
    if (byNumero) {
      return byNumero;
    }
  }

  if (linhaInicial > 0 && linhaFinal > 0) {
    const byLinhas = ativas.find(
      (item) =>
        item.id !== referencedRua?.id &&
        item.avaliacaoId === avaliacaoId &&
        item.parcelaId === parcelaId &&
        String(item.dataAvaliacao || '').trim() === dataAvaliacao &&
        Number(item.linhaInicial || 0) === linhaInicial &&
        Number(item.linhaFinal || 0) === linhaFinal,
    );
    if (byLinhas) {
      return byLinhas;
    }
  }

  return null;
};

const repairRegistroColetaQueueItem = async (item: SyncQueueItem) => {
  if (item.entidade !== 'registrosColeta' || item.operacao !== 'upsert') {
    return item;
  }

  const registroAtual = await getById<(BaseEntity & Record<string, unknown>)>(
    'registrosColeta',
    item.registroId,
  );

  if (!registroAtual || registroAtual.deletadoEm) {
    await deleteRecord('syncQueue', item.id);
    return null;
  }

  const payloadAtual = {
    ...item.payload,
    ...registroAtual,
  } as Record<string, unknown>;

  if (JSON.stringify(payloadAtual) !== JSON.stringify(item.payload)) {
    const updatedItem = await updateQueueItem(item, { payload: payloadAtual });
    if (updatedItem) {
      item = updatedItem;
    }
  }

  const ruaId = String(payloadAtual.ruaId || '').trim();
  if (!ruaId) {
    await putRecord('registrosColeta', {
      ...registroAtual,
      syncStatus: 'error',
      syncError: 'Registro removido da fila porque n\u00e3o possui rua vinculada.',
    } as typeof registroAtual & { syncError: string });
    await deleteRecord('syncQueue', item.id);
    return null;
  }

  const rua = await getById<(BaseEntity & Record<string, unknown>)>('avaliacaoRuas', ruaId);
  if (rua && !rua.deletadoEm) {
    return item;
  }

  const replacementRua = await findReplacementRuaForRegistroColeta(payloadAtual, rua || null);
  if (replacementRua) {
    const nextPayload = {
      ...payloadAtual,
      ruaId: replacementRua.id,
    };

    if (registroAtual.ruaId !== replacementRua.id) {
      await putRecord('registrosColeta', {
        ...registroAtual,
        ruaId: replacementRua.id,
      });
    }

    const updatedItem = await updateQueueItem(item, { payload: nextPayload });
    return updatedItem;
  }

  await putRecord('registrosColeta', {
    ...registroAtual,
    syncStatus: 'error',
    syncError: 'Registro removido da fila porque a rua vinculada n\u00e3o existe mais.',
  } as typeof registroAtual & { syncError: string });
  console.warn(
    `[Sync] Removendo item \u00f3rf\u00e3o de registrosColeta:${item.registroId} porque a rua ${ruaId} n\u00e3o existe mais localmente.`,
  );
  await deleteRecord('syncQueue', item.id);
  return null;
};

const repairOrphanRegistroColetaQueueItems = async () => {
  const queue = await listAll<SyncQueueItem>('syncQueue');

  for (const item of queue) {
    if (item.entidade !== 'registrosColeta' || item.operacao !== 'upsert') {
      continue;
    }

    await repairRegistroColetaQueueItem(item);
  }
};

const ensureRegistroColetaRuaSynced = async (
  item: SyncQueueItem,
  schemaCapabilities: SyncSchemaCapabilities,
) => {
  if (!firebaseRemoteCompat || item.entidade !== 'registrosColeta' || item.operacao !== 'upsert') {
    return item;
  }

  const repairedItem = await repairRegistroColetaQueueItem(item);
  if (!repairedItem) {
    return null;
  }

  item = repairedItem;

  const registroAtual = await getById<(BaseEntity & Record<string, unknown>)>(
    'registrosColeta',
    item.registroId,
  );
  const payloadAtual =
    registroAtual && !registroAtual.deletadoEm
      ? ({ ...item.payload, ...registroAtual } as Record<string, unknown>)
      : (item.payload as Record<string, unknown>);

  const ruaId = String(payloadAtual.ruaId || '').trim();
  if (!ruaId) {
    return item;
  }

  let ruaRecord =
    (await getById<(BaseEntity & Record<string, unknown>)>('avaliacaoRuas', ruaId)) || null;
  if (!ruaRecord || ruaRecord.deletadoEm) {
    return null;
  }

  if (!ruaRecord.dataAvaliacao) {
    const avaliacaoId = String(ruaRecord.avaliacaoId || '').trim();
    if (avaliacaoId) {
      const avaliacao = await getById<(BaseEntity & Record<string, unknown>)>(
        'avaliacoes',
        avaliacaoId,
      );
      const dataAvaliacao =
        typeof avaliacao?.dataAvaliacao === 'string' && avaliacao.dataAvaliacao.trim()
          ? avaliacao.dataAvaliacao
          : '';

      if (dataAvaliacao) {
        ruaRecord = {
          ...ruaRecord,
          dataAvaliacao,
        };
        await putRecord('avaliacaoRuas', ruaRecord);
      }
    }
  }

  const ruaPayload = snakeifyKeys(
    sanitizeRemotePayload('avaliacaoRuas', ruaRecord, schemaCapabilities),
  );

  if (ruaPayload.id) {
    delete ruaPayload.id;
  }

  const { data, error } = await firebaseRemoteCompat
    .from('avaliacao_ruas')
    .upsert(ruaPayload, { onConflict: 'avaliacao_parcela_id,rua_numero' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const remoteRua = camelizeKeys(data) as BaseEntity & Record<string, unknown>;
  if (remoteRua.id && remoteRua.id !== ruaRecord.id) {
    await remapStoreReferences('avaliacaoRuas', ruaRecord.id, remoteRua.id);
    await remapQueuedReferences('avaliacaoRuas', ruaRecord.id, remoteRua.id);

    const registroRefresh = await getById<(BaseEntity & Record<string, unknown>)>(
      'registrosColeta',
      item.registroId,
    );
    if (registroRefresh && registroRefresh.ruaId !== remoteRua.id) {
      await putRecord('registrosColeta', {
        ...registroRefresh,
        ruaId: remoteRua.id,
      });
    }

    const queueRefresh = await updateQueueItem(item, {
      payload: {
        ...item.payload,
        ruaId: remoteRua.id,
      },
    });
    if (queueRefresh) {
      item = queueRefresh;
    }
  }

  await persistRemoteRecord('avaliacaoRuas', remoteRua as BaseEntity);

  return (await getById<SyncQueueItem>('syncQueue', item.id)) || item;
};

const getConflictTargetForStore = (storeName: StoreName) => {
  switch (storeName) {
    case 'dispositivos':
      return 'identificador_local';
    case 'colaboradores':
      return 'matricula';
    case 'equipes':
      return 'numero';
    case 'parcelas':
      return 'codigo';
    case 'avaliacaoColaboradores':
      return 'avaliacao_id,colaborador_id';
    case 'avaliacaoParcelas':
      return 'avaliacao_id,parcela_id';
    case 'avaliacaoRuas':
      return 'avaliacao_parcela_id,rua_numero';
    default:
      return 'id';
  }
};

const pushQueueItem = async (
  item: SyncQueueItem,
  schemaCapabilities: SyncSchemaCapabilities,
) => {
  const tableName = REMOTE_TABLE_MAP[item.entidade];
  if (!tableName || !firebaseRemoteCompat) {
    return null;
  }

  const currentItem = await updateQueueItem(item, { status: 'processing' });
  if (!currentItem) {
    return null;
  }

  let activeItem = currentItem;
  if (activeItem.operacao === 'upsert') {
    const actualRecord = await getById<(BaseEntity & Record<string, unknown>)>(
      activeItem.entidade,
      activeItem.registroId,
    );

    if (!actualRecord) {
      await deleteRecord('syncQueue', activeItem.id);
      return null;
    }

    const refreshedPayload = { ...activeItem.payload, ...actualRecord } as Record<string, unknown>;
    if (JSON.stringify(refreshedPayload) !== JSON.stringify(activeItem.payload)) {
      const refreshedItem = await updateQueueItem(activeItem, {
        payload: refreshedPayload,
      });
      if (!refreshedItem) {
        return null;
      }
      activeItem = refreshedItem;
    }
  }

  const hydratedItem = await ensureRegistroColetaRuaSynced(
    activeItem,
    schemaCapabilities,
  );
  if (!hydratedItem) {
    return null;
  }

  if (hydratedItem.operacao === 'delete') {
    const { error } = await firebaseRemoteCompat
      .from(tableName)
      .delete()
      .eq('id', hydratedItem.registroId);
    if (error) {
      throw error;
    }

    await deleteRecord('syncQueue', hydratedItem.id);
    return null;
  }

  const payload = snakeifyKeys(
    sanitizeRemotePayload(
      hydratedItem.entidade,
      hydratedItem.payload,
      schemaCapabilities,
    ),
  );
  // Definir alvo de conflito resiliente por entidade
  let conflictTarget = getConflictTargetForStore(hydratedItem.entidade);

  // REGRA DE OURO: Se o alvo do conflito NÃO for o 'id' (UUID), removemos o 'id' do payload.
  // Isso permite que o firebaseRemoteCompat use o ID existente no servidor para aquele alvo de negócio (ex: matrícula),
  // evitando erros 409 de chave primária duplicada quando múltiplos aparelhos sincronizam o mesmo registro.
  if (conflictTarget !== 'id' && payload.id) {
    delete payload.id;
  }

  // Para tabelas de log/eventos (tentativasLogin, syncLogs), SEMPRE usamos 'id' como alvo.
  // Isso garante que cada evento local seja um registro único no servidor.
  if (
    hydratedItem.entidade === 'tentativasLogin' ||
    hydratedItem.entidade === 'syncLogs'
  ) {
    conflictTarget = 'id';
  }

  const { data, error } = await firebaseRemoteCompat
    .from(tableName)
    .upsert(payload, { onConflict: conflictTarget })
    .select()
    .single();

  if (error) {
    const meta = getCloudErrorMeta(error);
    if (meta.code === '23505' || meta.status === 409) {
      console.error(
        `[Sync] Conflito 409 em ${hydratedItem.entidade}. Alvo: ${conflictTarget}. Payload:`,
        payload,
      );
      console.error(`[Sync] Detalhes do erro:`, meta.message, meta.hint);
      
      // Tentativa de recuperacao: Se for conflito de duplicidade, podemos tentar forcar o ID remoto
      if (meta.message.includes('id') && conflictTarget !== 'id') {
         console.warn(`[Sync] O ID do registro local conflita com outro ID no servidor para ${hydratedItem.entidade}.`);
      }
    }
    throw error;
  }

  await deleteRecord('syncQueue', hydratedItem.id);
  return persistRemoteRecord(
    hydratedItem.entidade,
    camelizeKeys(data) as BaseEntity,
  );
};

const pullRemoteRows = async (
  storeName: StoreName,
  lastSyncAt?: string,
  schemaCapabilities?: SyncSchemaCapabilities,
  onPage?: (page: { pageNumber: number; rowsLoaded: number }) => void,
) => {
  const tableName = REMOTE_TABLE_MAP[storeName];
  if (!tableName) {
    return [] as BaseEntity[];
  }

  const rows: BaseEntity[] = [];
  let afterUpdatedAt: string | undefined;
  let afterId: string | undefined;
  let pageNumber = 0;

  while (true) {
    const selectClause = getRemoteSelectClause(storeName, schemaCapabilities);
    const response = await fetchCloudCollectionRows({
      collection: tableName,
      updatedAfter: lastSyncAt,
      afterUpdatedAt,
      afterId,
      limit: SYNC_PAGE_SIZE,
      fields: selectClause,
    });

    const page = (response.rows || []).map((item) => camelizeKeys(item) as BaseEntity);
    rows.push(...page);
    pageNumber += 1;
    onPage?.({
      pageNumber,
      rowsLoaded: rows.length,
    });

    if (page.length === 0 || !response.cursor?.hasMore) {
      break;
    }

    afterUpdatedAt = response.cursor.afterUpdatedAt || undefined;
    afterId = response.cursor.afterId || undefined;
  }

  return rows;
};

export const contarPendenciasSync = async ({
  repair = true,
}: {
  repair?: boolean;
} = {}) => {
  if (repair) {
    await normalizarFilaSync(null);
    await repairOrphanRegistroColetaQueueItems();
  }

  const queue = await listAll<SyncQueueItem>('syncQueue');
  return queue.filter(
    (item) => item.status !== 'error' && Boolean(REMOTE_TABLE_MAP[item.entidade]),
  ).length;
};

const getLastCloudLog = async () => {
  const logs = await listAll<SyncLog>('syncLogs');
  return (
    [...logs]
      .filter((item) => item.tipoSync === 'firebase_pull')
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0] || null
  );
};

export const obterDiagnosticoNuvem = async (): Promise<CloudDiagnostics> => {
  const lastSyncLog = await getLastCloudLog();

  if (!isCloudConfigured || !firebaseRemoteCompat) {
    return {
      configured: false,
      keyMode: cloudProviderMode,
      online: navigator.onLine,
      reachable: false,
      authReady: false,
      schemaWarnings: [],
      accessHint:
        cloudConfigurationHint ||
        'Configure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID e VITE_FIREBASE_APP_ID para sincronizar no app.',
      lastSyncAt: lastSyncLog?.criadoEm || null,
      lastSyncStatus: lastSyncLog?.status || 'idle',
      lastSyncDetails: lastSyncLog?.detalhes || '',
    };
  }

  if (!navigator.onLine) {
    return {
      configured: true,
      keyMode: cloudProviderMode,
      online: false,
      reachable: false,
      authReady: false,
      schemaWarnings: [],
      accessHint: 'Sem internet no aparelho. Conecte-se para sincronizar com a nuvem.',
      lastSyncAt: lastSyncLog?.criadoEm || null,
      lastSyncStatus: lastSyncLog?.status || 'idle',
      lastSyncDetails: lastSyncLog?.detalhes || '',
    };
  }

  let authReady = true;
  let accessHint = '';
  const currentCloudSession =
    (await getCloudSessionSafe()) ||
    (await ensureCloudDeviceSession(await getOrCreateDevice()).catch(() => null));

  if (!currentCloudSession) {
    authReady = false;
    accessHint = 'Abra o app online para inicializar a sess\u00e3o do dispositivo no Firebase.';
  }

  try {
    const schemaCapabilities = await getCloudSyncCapabilities(true);
    return {
      configured: true,
      keyMode: cloudProviderMode,
      online: true,
      reachable: true,
      authReady,
      schemaWarnings: schemaCapabilities.warnings,
      accessHint,
      lastSyncAt: lastSyncLog?.criadoEm || null,
      lastSyncStatus: lastSyncLog?.status || 'idle',
      lastSyncDetails: lastSyncLog?.detalhes || '',
    };
  } catch (error) {
    return {
      configured: true,
      keyMode: cloudProviderMode,
      online: true,
      reachable: false,
      authReady,
      schemaWarnings: [],
      accessHint: formatCloudAccessHint(error),
      lastSyncAt: lastSyncLog?.criadoEm || null,
      lastSyncStatus: lastSyncLog?.status || 'idle',
      lastSyncDetails: lastSyncLog?.detalhes || '',
    };
  }
};

export const sincronizarAcessosWeb = async ({
  onProgress,
}: {
  onProgress?: (progress: SyncProgressSnapshot) => void;
} = {}): Promise<SyncExecutionResult> => {
  const startedAt = Date.now();
  let progressState: SyncProgressSnapshot = {
    phase: 'preparing',
    label: 'Preparando carga dos acessos...',
    percent: 0,
    currentStore: null,
    currentStoreLabel: '',
    currentPage: 0,
    pushCompleted: 0,
    pushTotal: 0,
    pullCompleted: 0,
    pullTotal: webAccessSyncStores.length,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    elapsedMs: 0,
    estimatedRemainingMs: null,
  };

  const emitProgress = (
    patch: Partial<Omit<SyncProgressSnapshot, 'elapsedMs' | 'estimatedRemainingMs'>>,
  ) => {
    progressState = {
      ...progressState,
      ...patch,
    };

    const percent = Math.max(0, Math.min(100, Math.round(progressState.percent)));
    const elapsedMs = Date.now() - startedAt;
    const estimatedRemainingMs =
      percent > 0 && percent < 100
        ? Math.max(Math.round((elapsedMs * (100 - percent)) / percent), 0)
        : null;

    progressState = {
      ...progressState,
      percent,
      elapsedMs,
      estimatedRemainingMs,
    };

    onProgress?.(progressState);
  };

  const buildResult = (
    result: Omit<SyncExecutionResult, 'duracaoMs'>,
  ): SyncExecutionResult => ({
    ...result,
    duracaoMs: Date.now() - startedAt,
  });

  emitProgress({
    phase: 'preparing',
    label: 'Conectando para buscar acessos da web...',
    percent: 5,
  });

  const device = await getOrCreateDevice();

  if (!isCloudConfigured || !firebaseRemoteCompat) {
    const aviso = 'Firebase n\u00e3o configurado no ambiente.';
    emitProgress({
      phase: 'completed',
      label: aviso,
      percent: 100,
    });
    return buildResult({
      enviado: 0,
      recebido: 0,
      conflitos: 0,
      erro: aviso,
      avisos: [aviso],
    });
  }

  let recebido = 0;
  let conflitos = 0;
  let accessBlockedMessage = '';
  const pullErrors: string[] = [];

  emitProgress({
    phase: 'pull',
    currentStore: 'colaboradores',
    currentStoreLabel: getSyncStoreLabel('colaboradores'),
    currentPage: 0,
    pullCompleted: 0,
    pullTotal: 1,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    label: 'Baixando usu\u00e1rios cadastrados na web...',
    percent: 18,
  });

  try {
    const currentLocalColaboradores = await listAll<Colaborador>('colaboradores');
    const lastSyncAt =
      currentLocalColaboradores.length > 0
        ? getLastWebAccessSyncAt() || undefined
        : undefined;
    const rows = await pullCollaboradoresForWebAccess(lastSyncAt, ({ pageNumber, rowsLoaded }) => {
      emitProgress({
        phase: 'pull',
        currentStore: 'colaboradores',
        currentStoreLabel: getSyncStoreLabel('colaboradores'),
        currentPage: pageNumber,
        pullCompleted: 0,
        pullTotal: 1,
        storeRowsCompleted: rowsLoaded,
        storeRowsTotal: Math.max(rowsLoaded, 0),
        label: `Baixando usu\u00e1rios da web - p\u00e1gina ${pageNumber}...`,
        percent: 34,
      });
    });

    emitProgress({
      phase: 'pull',
      currentStore: 'colaboradores',
      currentStoreLabel: getSyncStoreLabel('colaboradores'),
      currentPage: 0,
      pullCompleted: 0,
      pullTotal: 1,
      storeRowsCompleted: 0,
      storeRowsTotal: rows.length,
      label:
        rows.length > 0
          ? `Aplicando ${rows.length} usu\u00e1rios no aparelho...`
          : 'Nenhum usu\u00e1rio novo encontrado na web.',
      percent: rows.length > 0 ? 62 : 90,
    });

    const merged = await mergeIncomingColaboradoresBatch(
      rows,
      currentLocalColaboradores,
    );
    recebido += merged.recebido;
    conflitos += merged.conflitos;
    setLastWebAccessSyncAt(nowIso());

    emitProgress({
      phase: 'pull',
      currentStore: 'colaboradores',
      currentStoreLabel: getSyncStoreLabel('colaboradores'),
      currentPage: 0,
      pullCompleted: 1,
      pullTotal: 1,
      storeRowsCompleted: rows.length,
      storeRowsTotal: rows.length,
      label:
        rows.length > 0
          ? 'Usu\u00e1rios da web carregados neste aparelho.'
          : 'Nenhum usu\u00e1rio novo encontrado na web.',
      percent: 92,
    });
  } catch (error) {
    if (isCloudAccessError(error)) {
      accessBlockedMessage = formatCloudAccessHint(error);
    } else {
      pullErrors.push(`colaboradores: ${formatSyncError(error)}`);
    }
  }

  emitProgress({
    phase: 'finalizing',
    currentStore: null,
    currentStoreLabel: '',
    currentPage: 0,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    label: 'Finalizando carga dos acessos...',
    percent: 97,
  });

  const hasErrors = pullErrors.length > 0 || Boolean(accessBlockedMessage);
  const details = [
    accessBlockedMessage,
    pullErrors.length > 0 ? `Falhas no pull: ${pullErrors.join(' | ')}` : '',
    conflitos > 0 ? `${conflitos} conflito(s) detectado(s).` : '',
    !hasErrors && conflitos === 0 ? 'Acessos da web sincronizados.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  await addSyncLog({
    dispositivoId: device.id,
    tipoSync: 'firebase_pull',
    status: accessBlockedMessage ? 'error' : hasErrors || conflitos > 0 ? 'warning' : 'success',
    detalhes: details,
    enviado: 0,
    recebido,
  });

  await putRecord('dispositivos', {
    ...device,
    ultimoSyncEm: nowIso(),
    atualizadoEm: nowIso(),
    syncStatus: hasErrors ? device.syncStatus : 'synced',
  });

  const result = buildResult({
    enviado: 0,
    recebido,
    conflitos,
    erro: accessBlockedMessage || pullErrors[0] || '',
    avisos: [],
  });

  emitProgress({
    phase: 'completed',
    currentStore: null,
    currentStoreLabel: '',
    currentPage: 0,
    pullCompleted: 1,
    pullTotal: 1,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    label: result.erro
      ? 'Carga de acessos conclu\u00edda com aviso.'
      : 'Acessos da web prontos.',
    percent: 100,
  });

  return result;
};

export const sincronizarNuvem = async ({
  onProgress,
  mode = 'full',
  stores,
}: {
  onProgress?: (progress: SyncProgressSnapshot) => void;
  mode?: 'full' | 'pull_only';
  stores?: StoreName[];
} = {}): Promise<SyncExecutionResult> => {
  const startedAt = Date.now();
  const syncMode = mode === 'pull_only' ? 'pull_only' : 'full';
  const activePullStores = Array.from(
    new Set(
      (stores?.length ? stores : syncableStores).filter((storeName) =>
        Boolean(REMOTE_TABLE_MAP[storeName]),
      ),
    ),
  );
  let progressState: SyncProgressSnapshot = {
    phase: 'preparing',
    label: 'Preparando sincroniza\u00e7\u00e3o...',
    percent: 0,
    currentStore: null,
    currentStoreLabel: '',
    currentPage: 0,
    pushCompleted: 0,
    pushTotal: 0,
    pullCompleted: 0,
    pullTotal: activePullStores.length,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    elapsedMs: 0,
    estimatedRemainingMs: null,
  };
  const emitProgress = (patch: Partial<Omit<SyncProgressSnapshot, 'elapsedMs' | 'estimatedRemainingMs'>>) => {
    progressState = {
      ...progressState,
      ...patch,
    };

    const percent = Math.max(0, Math.min(100, Math.round(progressState.percent)));
    const elapsedMs = Date.now() - startedAt;
    const estimatedRemainingMs =
      percent > 0 && percent < 100
        ? Math.max(Math.round((elapsedMs * (100 - percent)) / percent), 0)
        : null;

    progressState = {
      ...progressState,
      percent,
      elapsedMs,
      estimatedRemainingMs,
    };
    onProgress?.(progressState);
  };
  const buildResult = (
    result: Omit<SyncExecutionResult, 'duracaoMs'>,
  ): SyncExecutionResult => ({
    ...result,
    duracaoMs: Date.now() - startedAt,
  });
  const getPushPercent = (completed: number, total: number) =>
    total === 0 ? 55 : 18 + Math.round((completed / total) * 37);
  const getPullPercent = (completed: number, total: number) =>
    total === 0 ? 96 : 55 + Math.round((completed / total) * 41);

  emitProgress({
    phase: 'preparing',
    label:
      syncMode === 'pull_only'
        ? 'Preparando atualiza\u00e7\u00e3o remota...'
        : 'Conectando ao Firebase...',
    percent: 2,
  });

  const device = await getOrCreateDevice();

  if (!isCloudConfigured || !firebaseRemoteCompat) {
    const aviso = 'Firebase n\u00e3o configurado no ambiente.';
    await addSyncLog({
      dispositivoId: device.id,
      tipoSync: 'firebase_push',
      status: 'warning',
      detalhes: aviso,
      enviado: 0,
      recebido: 0,
    });
    emitProgress({
      phase: 'completed',
      label: aviso,
      percent: 100,
    });
    return buildResult({
      enviado: 0,
      recebido: 0,
      conflitos: 0,
      erro: aviso,
      avisos: [aviso],
    });
  }

  const currentCloudSessionForSync =
    (await getCloudSessionSafe()) ||
    (await ensureCloudDeviceSession(device).catch(() => null));
  if (!currentCloudSessionForSync) {
    const aviso = 'N\u00e3o foi poss\u00edvel iniciar a sess\u00e3o do dispositivo para sincronizar com o Firebase.';
    emitProgress({
      phase: 'completed',
      label: aviso,
      percent: 100,
    });
    return buildResult({
      enviado: 0,
      recebido: 0,
      conflitos: 0,
      erro: aviso,
      avisos: [],
    });
  }

  let schemaCapabilities = EMPTY_SYNC_SCHEMA_CAPABILITIES;
  if (syncMode === 'full') {
    emitProgress({
      phase: 'preparing',
      label: 'Validando estrutura da nuvem...',
      percent: 6,
    });
    schemaCapabilities = await getCloudSyncCapabilities();
    emitProgress({
      phase: 'preparing',
      label: 'Organizando fila local...',
      percent: 10,
    });
    await normalizarFilaSync(schemaCapabilities);
    emitProgress({
      phase: 'preparing',
      label: 'Corrigindo pend\u00eancias locais...',
      percent: 14,
    });
    await repairOrphanRegistroColetaQueueItems();
  } else {
    emitProgress({
      phase: 'preparing',
      label: 'Sincronizando apenas altera\u00e7\u00f5es remotas...',
      percent: 14,
    });
    schemaCapabilities = await getCloudSyncCapabilities();
  }

  let enviado = 0;
  let recebido = 0;
  let conflitos = 0;
  const pushErrors: string[] = [];
  let accessBlockedMessage = '';

  const queue =
    syncMode === 'full'
      ? (await listQueueByPriority()).filter((item) =>
          Boolean(REMOTE_TABLE_MAP[item.entidade]),
        )
      : [];
  emitProgress({
    phase: queue.length > 0 ? 'push' : 'pull',
    label:
      queue.length > 0
        ? `Enviando dados locais (0/${queue.length})...`
        : 'Sem pend\u00eancias locais. Iniciando download da nuvem...',
    percent: queue.length > 0 ? 18 : 55,
    pushCompleted: 0,
    pushTotal: queue.length,
  });

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    const tableName = REMOTE_TABLE_MAP[item.entidade];
    if (!tableName) continue;

    emitProgress({
      phase: 'push',
      currentStore: item.entidade,
      currentStoreLabel: getSyncStoreLabel(item.entidade),
      currentPage: 0,
      storeRowsCompleted: 0,
      storeRowsTotal: 0,
      pushCompleted: index,
      pushTotal: queue.length,
      label: `Enviando ${getSyncStoreLabel(item.entidade)} (${index + 1}/${queue.length})...`,
      percent: getPushPercent(index, queue.length),
    });

    try {
      await pushQueueItem(item, schemaCapabilities);
      enviado += 1;
    } catch (error) {
      if (isCloudAccessError(error)) {
        await resetQueueItemPending(item);
        accessBlockedMessage = formatCloudAccessHint(error);
        break;
      }

      await markQueueItemError(item, error);
      pushErrors.push(`${item.entidade}: ${formatSyncError(error)}`);
    }

    emitProgress({
      phase: 'push',
      currentStore: item.entidade,
      currentStoreLabel: getSyncStoreLabel(item.entidade),
      currentPage: 0,
      storeRowsCompleted: 0,
      storeRowsTotal: 0,
      pushCompleted: index + 1,
      pushTotal: queue.length,
      label: `Envio local ${index + 1}/${queue.length} conclu?do.`,
      percent: getPushPercent(index + 1, queue.length),
    });
  }

  const pullErrors: string[] = [];
  if (!accessBlockedMessage) {
    emitProgress({
      phase: 'pull',
      currentStore: null,
      currentStoreLabel: '',
      currentPage: 0,
      pullCompleted: 0,
      pullTotal: activePullStores.length,
      storeRowsCompleted: 0,
      storeRowsTotal: 0,
      label: 'Baixando dados da nuvem...',
      percent: 55,
    });

    for (let storeIndex = 0; storeIndex < activePullStores.length; storeIndex += 1) {
      const storeName = activePullStores[storeIndex];
      const storeLabel = getSyncStoreLabel(storeName);
      const pullStartedAt = nowIso();
      const lastSyncAt = getLastCloudStoreSyncAt(storeName) || undefined;

      try {
        emitProgress({
          phase: 'pull',
          currentStore: storeName,
          currentStoreLabel: storeLabel,
          currentPage: 0,
          pullCompleted: storeIndex,
          pullTotal: activePullStores.length,
          storeRowsCompleted: 0,
          storeRowsTotal: 0,
          label: `Baixando ${storeLabel} (${storeIndex + 1}/${activePullStores.length})...`,
          percent: getPullPercent(storeIndex, activePullStores.length),
        });

        const rows = await pullRemoteRows(storeName, lastSyncAt, schemaCapabilities, ({ pageNumber, rowsLoaded }) => {
          emitProgress({
            phase: 'pull',
            currentStore: storeName,
            currentStoreLabel: storeLabel,
            currentPage: pageNumber,
            pullCompleted: storeIndex,
            pullTotal: activePullStores.length,
            storeRowsCompleted: rowsLoaded,
            storeRowsTotal: Math.max(rowsLoaded, 0),
            label: `Baixando ${storeLabel} - p\u00e1gina ${pageNumber}...`,
            percent: getPullPercent(storeIndex, activePullStores.length),
          });
        });

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const result = await mergeIncomingRecord(storeName, row);
          if (result === 'received') recebido += 1;
          if (result === 'conflict') conflitos += 1;

          if (rowIndex === 0 || (rowIndex + 1) % 25 === 0 || rowIndex === rows.length - 1) {
            emitProgress({
              phase: 'pull',
              currentStore: storeName,
              currentStoreLabel: storeLabel,
              currentPage: 0,
              pullCompleted: storeIndex,
              pullTotal: activePullStores.length,
              storeRowsCompleted: rowIndex + 1,
              storeRowsTotal: rows.length,
              label: `Aplicando ${storeLabel} (${rowIndex + 1}/${rows.length})...`,
              percent: getPullPercent(
                storeIndex + (rowIndex + 1) / Math.max(rows.length, 1),
                activePullStores.length,
              ),
            });
          }
        }

        emitProgress({
          phase: 'pull',
          currentStore: storeName,
          currentStoreLabel: storeLabel,
          currentPage: 0,
          pullCompleted: storeIndex + 1,
          pullTotal: activePullStores.length,
          storeRowsCompleted: rows.length,
          storeRowsTotal: rows.length,
          label:
            rows.length > 0
              ? `${storeLabel} atualizado.`
              : `${storeLabel} sem altera\u00e7\u00f5es remotas.`,
          percent: getPullPercent(storeIndex + 1, activePullStores.length),
        });
        setLastCloudStoreSyncAt(storeName, pullStartedAt);
      } catch (error) {
        if (isCloudAccessError(error)) {
          accessBlockedMessage = formatCloudAccessHint(error);
          break;
        }

        pullErrors.push(`${storeName}: ${formatSyncError(error)}`);
        emitProgress({
          phase: 'pull',
          currentStore: storeName,
          currentStoreLabel: storeLabel,
          currentPage: 0,
          pullCompleted: storeIndex + 1,
          pullTotal: activePullStores.length,
          storeRowsCompleted: 0,
          storeRowsTotal: 0,
          label: `Falha ao baixar ${storeLabel}. Continuando...`,
          percent: getPullPercent(storeIndex + 1, activePullStores.length),
        });
      }
    }
  }

  emitProgress({
    phase: 'finalizing',
    currentStore: null,
    currentStoreLabel: '',
    currentPage: 0,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    label: 'Finalizando sincroniza\u00e7\u00e3o...',
    percent: 97,
  });

  const hasSchemaWarnings = schemaCapabilities.warnings.length > 0;
  const hasErrors =
    pushErrors.length > 0 || pullErrors.length > 0 || Boolean(accessBlockedMessage);
  const details = [
    accessBlockedMessage,
    ...schemaCapabilities.warnings,
    pushErrors.length > 0 ? `Falhas no push: ${pushErrors.join(' | ')}` : '',
    pullErrors.length > 0 ? `Falhas no pull: ${pullErrors.join(' | ')}` : '',
    conflitos > 0 ? `${conflitos} conflito(s) detectado(s).` : '',
    !hasErrors && !hasSchemaWarnings && conflitos === 0
      ? 'Sincroniza\u00e7\u00e3o com Firebase conclu\u00edda.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  await addSyncLog({
    dispositivoId: device.id,
    tipoSync: 'firebase_pull',
    status:
      accessBlockedMessage
        ? 'error'
        : hasErrors || conflitos > 0 || hasSchemaWarnings
          ? 'warning'
          : 'success',
    detalhes: details,
    enviado,
    recebido,
  });

  await putRecord('dispositivos', {
    ...device,
    ultimoSyncEm: nowIso(),
    atualizadoEm: nowIso(),
    syncStatus: hasErrors ? device.syncStatus : 'synced',
  });

  const result = buildResult({
    enviado,
    recebido,
    conflitos,
    erro: accessBlockedMessage || [...pushErrors, ...pullErrors][0] || '',
    avisos: schemaCapabilities.warnings,
  });

  emitProgress({
    phase: 'completed',
    currentStore: null,
    currentStoreLabel: '',
    currentPage: 0,
    pushCompleted: queue.length,
    pushTotal: queue.length,
    pullCompleted: activePullStores.length,
    pullTotal: activePullStores.length,
    storeRowsCompleted: 0,
    storeRowsTotal: 0,
    label:
      result.erro || result.avisos.length > 0
        ? 'Sincroniza\u00e7\u00e3o conclu\u00edda com avisos.'
        : 'Sincroniza\u00e7\u00e3o conclu\u00edda.',
    percent: 100,
  });

  return result;
};


export const montarPacoteSyncLocal = async () => {
  const device = await getOrCreateDevice();
  const entidades: PacoteSyncLocal['entidades'] = {};

  for (const storeName of syncableStores) {
    entidades[storeName] = (await filterRecords(
      storeName,
      (item: BaseEntity) => !item.deletadoEm,
    )) as unknown as Record<string, unknown>[];
  }

  return {
    id: crypto.randomUUID(),
    criadoEm: nowIso(),
    origemDispositivoId: device.id,
    origemNomeDispositivo: device.nomeDispositivo,
    entidades,
  } satisfies PacoteSyncLocal;
};

export const exportarPacoteSyncLocal = async () => {
  const device = await getOrCreateDevice();
  const pacote = await montarPacoteSyncLocal();
  const fileName = `qualcoco-sync-${pacote.criadoEm.replaceAll(':', '-')}.json`;
  const json = JSON.stringify(pacote, null, 2);

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
    });

    const { uri } = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Cache,
    });

    await Share.share({
      title: 'Pacote de sincroniza\u00e7\u00e3o local',
      text: 'Compartilhe por Bluetooth ou Nearby Share para outro aparelho.',
      files: [uri],
      dialogTitle: 'Enviar pacote local',
    });
  } else {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  await addSyncLog({
    dispositivoId: device.id,
    tipoSync: 'local_export',
    status: 'success',
    detalhes: 'Pacote local gerado para compartilhamento sem internet.',
    enviado: 1,
    recebido: 0,
  });

  return pacote;
};

export const importarPacoteSyncLocal = async (fileContent: string) => {
  const device = await getOrCreateDevice();
  const pacote = JSON.parse(fileContent) as PacoteSyncLocal;
  let recebido = 0;
  let conflitos = 0;

  for (const [storeName, entries] of Object.entries(pacote.entidades) as Array<
    [StoreName, Record<string, unknown>[] | undefined]
  >) {
    if (!entries?.length) continue;

    for (const entry of entries) {
      const incoming = {
        ...((entry as unknown) as BaseEntity),
        syncStatus: 'pending_sync' as const,
      };
      const result = await mergeIncomingRecord(storeName, incoming);
      if (result === 'received') {
        const merged = await getById<BaseEntity>(storeName, incoming.id);
        if (merged) {
          await saveEntity(storeName as never, merged as never, {
            queue: true,
            origem: 'shared',
          });
        }
        recebido += 1;
      }
      if (result === 'conflict') conflitos += 1;
    }
  }

  await addSyncLog({
    dispositivoId: device.id,
    tipoSync: 'local_import',
    status: conflitos > 0 ? 'warning' : 'success',
    detalhes: `Pacote importado de ${pacote.origemNomeDispositivo}.`,
    enviado: 0,
    recebido,
  });

  return { pacote, recebido, conflitos };
};
