import { openDB } from 'idb';
import {
  APP_DATA_RESET_VERSION,
  STORAGE_KEYS,
  STORE_NAMES,
} from '@/core/constants';
import { gerarCatalogoParcelas } from '@/core/plots';
import { sanitizeStoreRecord } from '@/core/storeSanitizers';
import type {
  BaseEntity,
  Parcela,
  StoreName,
  SyncLog,
  SyncQueueItem,
} from '@/core/types';
import { nowIso } from '@/core/date';

const DB_NAME = 'qualcoco-campo-v2';
const DB_VERSION = 6;
const SYNC_QUEUE_CHANGED_EVENT = 'qualcoco:sync-queue-changed';
const LEGACY_STORAGE_KEYS = ['responsavel_nome', 'jornada_id', 'jornada_data'];
const PARCELAS_CATALOGO_SEED_VERSION = '2026-03-23-v1';
const PARCELAS_CATALOGO_SYNC_POLICY_VERSION = '2026-03-30-v1';

const createDbPromise = () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      STORE_NAMES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: 'id',
          });
          store.createIndex('atualizadoEm', 'atualizadoEm');
          if (storeName !== 'syncQueue') {
            store.createIndex('syncStatus', 'syncStatus');
          }
        }
      });
    },
  });

let dbPromise = createDbPromise();

export const getDb = () => dbPromise;

const clearAppStorageKeys = () => {
  [
    ...Object.values(STORAGE_KEYS),
    ...LEGACY_STORAGE_KEYS,
  ].forEach((key) => window.localStorage.removeItem(key));
};

const deleteLocalDatabase = async () =>
  new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error || new Error('Falha ao apagar banco local.'));
    request.onblocked = () => resolve();
  });

export const resetLocalAppDataIfNeeded = async () => {
  const currentResetVersion = window.localStorage.getItem(
    STORAGE_KEYS.dataResetVersion,
  );

  if (currentResetVersion === APP_DATA_RESET_VERSION) {
    return false;
  }

  try {
    const db = await dbPromise;
    db.close();
  } catch (_error) {
    // Ignora falhas de fechamento e tenta apagar o banco mesmo assim.
  }

  await deleteLocalDatabase();
  clearAppStorageKeys();
  window.localStorage.setItem(
    STORAGE_KEYS.dataResetVersion,
    APP_DATA_RESET_VERSION,
  );
  dbPromise = createDbPromise();
  return true;
};

export const initLocalDb = async () => {
  await resetLocalAppDataIfNeeded();
  await dbPromise;
  await seedCatalogoParcelasIfNeeded();
  await cleanupCatalogoParcelasSyncQueueIfNeeded();
};

export const listAll = async <T>(storeName: StoreName) => {
  const db = await dbPromise;
  return (await db.getAll(storeName)) as T[];
};

export const getById = async <T>(storeName: StoreName, id: string) => {
  const db = await dbPromise;
  return (await db.get(storeName, id)) as T | undefined;
};

export const putRecord = async <T>(storeName: StoreName, record: T) => {
  const db = await dbPromise;
  const sanitizedRecord = sanitizeStoreRecord(storeName, record);
  await db.put(storeName, sanitizedRecord);
  return sanitizedRecord;
};

export const bulkPut = async <T>(storeName: StoreName, records: T[]) => {
  const db = await dbPromise;
  const tx = db.transaction(storeName, 'readwrite');
  const sanitizedRecords = records.map((record) => sanitizeStoreRecord(storeName, record));
  for (const record of sanitizedRecords) {
    tx.store.put(record);
  }
  await tx.done;
  return sanitizedRecords;
};

const getOrCreateSeedDeviceId = () => {
  const current = window.localStorage.getItem(STORAGE_KEYS.dispositivoId);
  if (current) return current;

  const created = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEYS.dispositivoId, created);
  return created;
};

const seedCatalogoParcelasIfNeeded = async () => {
  if (
    window.localStorage.getItem(STORAGE_KEYS.parcelasCatalogoSeedVersion) ===
    PARCELAS_CATALOGO_SEED_VERSION
  ) {
    return 0;
  }

  const parcelasExistentes = await listAll<Parcela>('parcelas');
  const codigosExistentes = new Set(
    parcelasExistentes
      .filter((item) => !item.deletadoEm)
      .map((item) => String(item.codigo || '').trim().toUpperCase()),
  );
  const faltantes = gerarCatalogoParcelas().filter(
    (item) => !codigosExistentes.has(item.codigo.trim().toUpperCase()),
  );

  if (faltantes.length === 0) {
    window.localStorage.setItem(
      STORAGE_KEYS.parcelasCatalogoSeedVersion,
      PARCELAS_CATALOGO_SEED_VERSION,
    );
    return 0;
  }

  const deviceId = getOrCreateSeedDeviceId();
  const parcelas = faltantes.map<Parcela>(({ codigo, descricao }) => ({
    ...createBaseEntity(deviceId),
    codigo,
    descricao,
    ativo: true,
    syncStatus: 'synced',
  }));

  await bulkPut('parcelas', parcelas);
  window.localStorage.setItem(
    STORAGE_KEYS.parcelasCatalogoSeedVersion,
    PARCELAS_CATALOGO_SEED_VERSION,
  );
  return parcelas.length;
};

const cleanupCatalogoParcelasSyncQueueIfNeeded = async () => {
  if (
    window.localStorage.getItem(
      STORAGE_KEYS.parcelasCatalogoSyncPolicyVersion,
    ) === PARCELAS_CATALOGO_SYNC_POLICY_VERSION
  ) {
    return 0;
  }

  const catalogoCodigos = new Set(
    gerarCatalogoParcelas().map((item) => item.codigo.trim().toUpperCase()),
  );
  const queue = await filterRecords<SyncQueueItem>(
    'syncQueue',
    (item) =>
      item.entidade === 'parcelas' &&
      item.operacao === 'upsert' &&
      item.origem === 'local',
  );

  let removidos = 0;
  for (const item of queue) {
    const codigo = String(
      (item.payload as { codigo?: string } | null)?.codigo || '',
    )
      .trim()
      .toUpperCase();
    if (!codigo || !catalogoCodigos.has(codigo)) {
      continue;
    }

    await deleteRecord('syncQueue', item.id);

    const parcela = await getById<Parcela>('parcelas', item.registroId);
    if (parcela && !parcela.deletadoEm && parcela.syncStatus !== 'synced') {
      await putRecord('parcelas', {
        ...parcela,
        syncStatus: 'synced',
      });
    }

    removidos += 1;
  }

  window.localStorage.setItem(
    STORAGE_KEYS.parcelasCatalogoSyncPolicyVersion,
    PARCELAS_CATALOGO_SYNC_POLICY_VERSION,
  );

  if (removidos > 0) {
    window.dispatchEvent(new CustomEvent(SYNC_QUEUE_CHANGED_EVENT));
  }

  return removidos;
};

export const deleteRecord = async (storeName: StoreName, id: string) => {
  const db = await dbPromise;
  await db.delete(storeName, id);
};

export const filterRecords = async <T>(
  storeName: StoreName,
  predicate: (record: T) => boolean,
) => {
  const items = await listAll<T>(storeName);
  return items.filter(predicate);
};

export const countRecords = async (storeName: StoreName) => {
  const db = await dbPromise;
  return db.count(storeName);
};

export const createBaseEntity = (deviceId: string): BaseEntity => {
  const now = nowIso();
  const id = crypto.randomUUID();

  return {
    id,
    localId: `${deviceId}:${id}`,
    criadoEm: now,
    atualizadoEm: now,
    deletadoEm: null,
    syncStatus: 'pending_sync',
    versao: 1,
    origemDispositivoId: deviceId,
  };
};

export const touchEntity = <T extends BaseEntity>(
  current: T,
  patch: Partial<T>,
  syncStatus: T['syncStatus'] = 'pending_sync',
) => ({
  ...current,
  ...patch,
  atualizadoEm: nowIso(),
  syncStatus,
  versao: current.versao + 1,
});

export const addSyncQueueItem = async (
  item: Omit<SyncQueueItem, 'id' | 'criadoEm' | 'atualizadoEm' | 'tentativas' | 'status'>,
) => {
  const existing = await filterRecords<SyncQueueItem>(
    'syncQueue',
    (record) =>
      record.entidade === item.entidade &&
      record.registroId === item.registroId &&
      record.operacao === item.operacao,
  );

  if (existing.length > 0) {
    const [current, ...duplicates] = existing.sort((left, right) =>
      right.atualizadoEm.localeCompare(left.atualizadoEm),
    );

    for (const duplicate of duplicates) {
      await deleteRecord('syncQueue', duplicate.id);
    }

    const next: SyncQueueItem = {
      ...current,
      payload: item.payload,
      origem: item.origem,
      status: 'pending',
      atualizadoEm: nowIso(),
    };

    await putRecord('syncQueue', next);
    window.dispatchEvent(new CustomEvent(SYNC_QUEUE_CHANGED_EVENT));
    return next;
  }

  const record: SyncQueueItem = {
    id: crypto.randomUUID(),
    tentativas: 0,
    status: 'pending',
    criadoEm: nowIso(),
    atualizadoEm: nowIso(),
    ...item,
  };

  await putRecord('syncQueue', record);
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_CHANGED_EVENT));
  return record;
};

export const addSyncLog = async (
  log: Omit<SyncLog, keyof BaseEntity>,
) => {
  const deviceId = log.dispositivoId || window.localStorage.getItem(STORAGE_KEYS.dispositivoId) || '';
  const base = createBaseEntity(deviceId);
  
  const record: SyncLog = {
    ...base,
    ...log,
  };

  await putRecord('syncLogs', record);
  return record;
};
