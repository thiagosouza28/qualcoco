import { REMOTE_COLLECTION_MAP } from '@/core/constants';
import {
  addSyncQueueItem,
  bulkPut,
  createBaseEntity,
  filterRecords,
  getById,
  listAll,
  putRecord,
  touchEntity,
} from '@/core/localDb';
import type {
  Avaliacao,
  AvaliacaoColaborador,
  AvaliacaoParcela,
  AvaliacaoRua,
  AvaliacaoRetoque,
  AvaliacaoLog,
  BaseEntity,
  Colaborador,
  Dispositivo,
  Equipe,
  Parcela,
  RegistroColeta,
  StoreName,
  SyncLog,
  SyncQueueItem,
  TentativaLogin,
  Configuracao,
  UsuarioEquipe,
} from '@/core/types';

type EntityByStore = {
  equipes: Equipe;
  colaboradores: Colaborador;
  usuarioEquipes: UsuarioEquipe;
  parcelas: Parcela;
  avaliacoes: Avaliacao;
  avaliacaoColaboradores: AvaliacaoColaborador;
  avaliacaoParcelas: AvaliacaoParcela;
  avaliacaoRuas: AvaliacaoRua;
  avaliacaoRetoques: AvaliacaoRetoque;
  avaliacaoLogs: AvaliacaoLog;
  registrosColeta: RegistroColeta;
  dispositivos: Dispositivo;
  tentativasLogin: TentativaLogin;
  configuracoes: Configuracao;
  syncLogs: SyncLog;
  syncQueue: SyncQueueItem;
};

const syncableStores = new Set<StoreName>([
  'equipes',
  'colaboradores',
  'usuarioEquipes',
  'parcelas',
  'avaliacoes',
  'avaliacaoColaboradores',
  'avaliacaoParcelas',
  'avaliacaoRuas',
  'avaliacaoRetoques',
  'avaliacaoLogs',
  'registrosColeta',
  'dispositivos',
  'tentativasLogin',
  'configuracoes',
  'syncLogs',
]);

async function queueUpsert<T extends BaseEntity>(
  storeName: StoreName,
  record: T,
  origem: 'local' | 'shared' | 'firebase',
) {
  if (!syncableStores.has(storeName) || !REMOTE_COLLECTION_MAP[storeName]) return;

  await addSyncQueueItem({
    entidade: storeName,
    registroId: record.id,
    operacao: 'upsert',
    payload: record as unknown as Record<string, unknown>,
    origem,
  });
}

export async function saveEntity<K extends keyof EntityByStore>(
  storeName: K,
  record: EntityByStore[K],
  options?: {
    queue?: boolean;
    origem?: 'local' | 'shared' | 'firebase';
  },
) {
  await putRecord(storeName, record);
  if (options?.queue !== false) {
    await queueUpsert(storeName, record as BaseEntity, options?.origem || 'local');
  }
  return record;
}

export async function createEntity<K extends keyof EntityByStore>(
  storeName: K,
  deviceId: string,
  data: Omit<EntityByStore[K], keyof BaseEntity>,
  options?: {
    origem?: 'local' | 'shared' | 'firebase';
  },
) {
  const base = createBaseEntity(deviceId);
  const entity = {
    ...base,
    ...data,
  } as EntityByStore[K];

  return saveEntity(storeName, entity, {
    queue: options?.origem !== 'firebase',
    origem: options?.origem || 'local',
  });
}

export async function updateEntity<K extends keyof EntityByStore>(
  storeName: K,
  id: string,
  patch: Partial<EntityByStore[K]>,
  options?: {
    queue?: boolean;
    origem?: 'local' | 'shared' | 'firebase';
    syncStatus?: EntityByStore[K] extends BaseEntity ? EntityByStore[K]['syncStatus'] : never;
  },
) {
  const current = await getById<EntityByStore[K]>(storeName, id);
  if (!current) return null;

  const next = touchEntity(
    current as unknown as BaseEntity,
    patch as Partial<BaseEntity>,
    options?.syncStatus || 'pending_sync',
  ) as EntityByStore[K];

  return saveEntity(storeName, next, {
    queue: options?.queue !== false,
    origem: options?.origem || 'local',
  });
}

export const repository = {
  list: <K extends keyof EntityByStore>(storeName: K) => listAll<EntityByStore[K]>(storeName),
  get: <K extends keyof EntityByStore>(storeName: K, id: string) =>
    getById<EntityByStore[K]>(storeName, id),
  filter: <K extends keyof EntityByStore>(
    storeName: K,
    predicate: (record: EntityByStore[K]) => boolean,
  ) => filterRecords<EntityByStore[K]>(storeName, predicate),
  bulkPut: <K extends keyof EntityByStore>(storeName: K, records: EntityByStore[K][]) =>
    bulkPut(storeName, records),
};
