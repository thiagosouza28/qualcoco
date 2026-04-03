import {
  getIdTokenResult,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  type QueryConstraint,
  type WhereFilterOp,
} from 'firebase/firestore';
import { STORAGE_KEYS } from '@/core/constants';
import { camelizeKeys, snakeifyKeys } from '@/core/casing';
import { nowIso } from '@/core/date';
import { firebaseAuth, firebaseConfigurationHint, firebaseProviderMode, firestoreDb } from '@/core/firebaseClient';
import type { Colaborador } from '@/core/types';

type CloudSessionUser = {
  id: string;
  colaboradorId: string;
  matricula: string;
};

type CloudSessionType = 'device' | 'colaborador';

export type CloudSession = {
  token: string;
  expiresAt: string;
  sessionType: CloudSessionType;
  deviceId: string;
  user: CloudSessionUser | null;
};

type CloudAuthListener = (session: CloudSession | null) => void;

type DeviceSnapshot = {
  id?: string;
  identificadorLocal?: string;
  nomeDispositivo?: string;
};

type CursorPayload = {
  hasMore: boolean;
  afterUpdatedAt: string | null;
  afterId: string | null;
};

type CloudListResponse = {
  rows: Record<string, unknown>[];
  cursor: CursorPayload;
};

type FilterOperator = 'eq' | 'is' | 'gt' | 'gte';

type QueryFilter = {
  field: string;
  operator: FilterOperator;
  value: unknown;
};

type OrderOptions = {
  ascending?: boolean;
};

type UpsertOptions = {
  onConflict?: string;
};

const CLOUD_PAGE_SIZE = 50;
const PUBLIC_COLABORADORES_PAGE_SIZE = 200;
const authListeners = new Set<CloudAuthListener>();

const createCloudError = (
  message: string,
  code = 'firebase_error',
  status = 500,
  hint = '',
) => {
  const error = new Error(message) as Error & {
    code?: string;
    status?: number;
    hint?: string;
  };
  error.code = code;
  error.status = status;
  error.hint = hint;
  return error;
};

const emitAuthChange = (session: CloudSession | null) => {
  for (const listener of authListeners) {
    listener(session);
  }
};

const readPersistedSession = () => {
  const raw = window.localStorage.getItem(STORAGE_KEYS.cloudSession);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Omit<CloudSession, 'token' | 'expiresAt'>;
  } catch {
    return null;
  }
};

const persistSessionMeta = (session: Pick<CloudSession, 'sessionType' | 'deviceId' | 'user'>) => {
  window.localStorage.setItem(STORAGE_KEYS.cloudSession, JSON.stringify(session));
};

const clearPersistedSession = () => {
  window.localStorage.removeItem(STORAGE_KEYS.cloudSession);
};

const getStoredDeviceId = () => {
  const current = window.localStorage.getItem(STORAGE_KEYS.dispositivoId);
  if (current) {
    return current;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEYS.dispositivoId, created);
  return created;
};

const buildDeviceSnapshot = (device?: DeviceSnapshot) => {
  const deviceId = String(
    device?.id || device?.identificadorLocal || getStoredDeviceId(),
  ).trim();

  return {
    id: deviceId,
    identificadorLocal: deviceId,
    nomeDispositivo:
      String(
        device?.nomeDispositivo ||
          (typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
          'Mobile',
      ).trim() || 'Mobile',
  };
};

const getQueryLimit = (requested?: number, maxLimit = CLOUD_PAGE_SIZE) =>
  Math.max(1, Math.min(Number(requested) || maxLimit, maxLimit));

const normalizeFields = (fields?: string) =>
  String(fields || '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

const pickFields = (row: Record<string, unknown>, fields?: string) => {
  const normalizedFields = normalizeFields(fields);
  if (normalizedFields.length === 0) {
    return row;
  }

  const required = new Set(['id', 'atualizado_em', ...normalizedFields]);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => required.has(key)),
  );
};

const withDocIdentity = (
  id: string,
  row: Record<string, unknown> | undefined,
): Record<string, unknown> => ({
  ...(row || {}),
  id: typeof row?.id === 'string' && row.id.trim() ? row.id : id,
});

const buildCursorResponse = (
  rows: Record<string, unknown>[],
  requestedLimit: number,
): CursorPayload => {
  const lastRow = rows[rows.length - 1];

  return {
    hasMore: rows.length === requestedLimit,
    afterUpdatedAt:
      typeof lastRow?.atualizado_em === 'string' ? lastRow.atualizado_em : null,
    afterId: typeof lastRow?.id === 'string' ? lastRow.id : null,
  };
};

const buildConstraints = ({
  updatedAfter,
  requestedLimit,
  extraFilters = [],
}: {
  updatedAfter?: string;
  requestedLimit?: number;
  extraFilters?: Array<{ field: string; op: WhereFilterOp; value: unknown }>;
}) => {
  const constraints: QueryConstraint[] = [];

  extraFilters.forEach((filter) => {
    constraints.push(where(filter.field, filter.op, filter.value));
  });

  if (updatedAfter) {
    constraints.push(where('atualizado_em', '>=', updatedAfter));
  }

  constraints.push(orderBy('atualizado_em', 'asc'));
  return constraints;
};

const ensureConfigured = () => {
  if (!firebaseAuth || !firestoreDb) {
    throw createCloudError(
      firebaseConfigurationHint || 'Firebase não configurado no ambiente.',
      firebaseConfigurationHint ? 'firebase_invalid_config' : 'firebase_missing_config',
      500,
      firebaseConfigurationHint,
    );
  }
};

const buildCloudSession = async (
  firebaseUser: User,
  meta?: Partial<Pick<CloudSession, 'sessionType' | 'deviceId' | 'user'>> | null,
): Promise<CloudSession> => {
  const tokenResult = await getIdTokenResult(firebaseUser);

  return {
    token: tokenResult.token,
    expiresAt: tokenResult.expirationTime,
    sessionType: meta?.sessionType === 'colaborador' ? 'colaborador' : 'device',
    deviceId: String(meta?.deviceId || getStoredDeviceId()).trim(),
    user:
      meta?.sessionType === 'colaborador' && meta.user
        ? {
            id: String(meta.user.id || firebaseUser.uid),
            colaboradorId: String(meta.user.colaboradorId || ''),
            matricula: String(meta.user.matricula || ''),
          }
        : null,
  };
};

const ensureFirebaseUser = async () => {
  ensureConfigured();

  if (firebaseAuth!.currentUser) {
    return firebaseAuth!.currentUser;
  }

  const credential = await signInAnonymously(firebaseAuth!);
  return credential.user;
};

const upsertDeviceDocument = async (device: ReturnType<typeof buildDeviceSnapshot>) => {
  ensureConfigured();

  const ref = doc(firestoreDb!, 'dispositivos', device.id);
  const current = await getDoc(ref);
  const payload = {
    ...(current.data() || {}),
    id: device.id,
    identificador_local: device.identificadorLocal,
    nome_dispositivo: device.nomeDispositivo,
    ultimo_sync_em: current.data()?.ultimo_sync_em ?? null,
    local_id: String(current.data()?.local_id || `device:${device.id}`),
    criado_em: current.data()?.criado_em || nowIso(),
    atualizado_em: nowIso(),
    deletado_em: null,
    sync_status: 'synced',
    versao: Number(current.data()?.versao || 1),
    origem_dispositivo_id: String(
      current.data()?.origem_dispositivo_id || device.id,
    ),
  };

  await setDoc(ref, payload, { merge: true });
};

const findDocumentByConflict = async (
  collectionName: string,
  conflictTarget: string,
  payload: Record<string, unknown>,
) => {
  ensureConfigured();

  const fields = String(conflictTarget || '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    return null;
  }

  const constraints = fields.map((field) => where(field, '==', payload[field] ?? null));
  const snapshot = await getDocs(
    query(collection(firestoreDb!, collectionName), ...constraints, limit(1)),
  );

  return snapshot.docs[0] || null;
};

const fetchCollectionRowsInternal = async ({
  collectionName,
  updatedAfter,
  afterUpdatedAt,
  afterId,
  limit: requestedLimit,
  fields,
  extraFilters = [],
  maxLimit = CLOUD_PAGE_SIZE,
}: {
  collectionName: string;
  updatedAfter?: string;
  afterUpdatedAt?: string;
  afterId?: string;
  limit?: number;
  fields?: string;
  extraFilters?: Array<{ field: string; op: WhereFilterOp; value: unknown }>;
  maxLimit?: number;
}) => {
  ensureConfigured();
  const effectiveLimit = getQueryLimit(requestedLimit, maxLimit);
  const constraints = buildConstraints({
    updatedAfter,
    requestedLimit,
    extraFilters,
  });

  if (afterId) {
    const cursorSnapshot = await getDoc(doc(firestoreDb!, collectionName, afterId));
    if (cursorSnapshot.exists()) {
      constraints.push(startAfter(cursorSnapshot));
    } else if (afterUpdatedAt) {
      constraints.push(startAfter(afterUpdatedAt));
    }
  } else if (afterUpdatedAt) {
    constraints.push(startAfter(afterUpdatedAt));
  }

  constraints.push(limit(effectiveLimit));
  const q = query(
    collection(firestoreDb!, collectionName),
    ...constraints,
  );
  const snapshot = await getDocs(q);
  const rows = snapshot.docs.map((item) =>
    pickFields(withDocIdentity(item.id, item.data() as Record<string, unknown>), fields),
  );

  return {
    rows,
    cursor: buildCursorResponse(rows, effectiveLimit),
  } satisfies CloudListResponse;
};

const matchesFilter = (row: Record<string, unknown>, filter: QueryFilter) => {
  const rowValue = row[filter.field];

  switch (filter.operator) {
    case 'eq':
      return rowValue === filter.value;
    case 'is':
      return filter.value === null ? rowValue === null : rowValue === filter.value;
    case 'gt':
      return String(rowValue || '') > String(filter.value || '');
    case 'gte':
      return String(rowValue || '') >= String(filter.value || '');
    default:
      return true;
  }
};

class FirebaseQueryBuilder {
  private readonly collectionName: string;
  private action: 'select' | 'upsert' | 'delete' = 'select';
  private filters: QueryFilter[] = [];
  private limitCount: number | null = null;
  private payload: Record<string, unknown> | null = null;
  private conflictTarget = 'id';
  private selectedFields = '';

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  select(fields?: string) {
    this.selectedFields = String(fields || '').trim();
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, operator: 'eq', value });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ field, operator: 'is', value });
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push({ field, operator: 'gt', value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ field, operator: 'gte', value });
    return this;
  }

  order(_field: string, _options?: OrderOptions) {
    return this;
  }

  limit(value: number) {
    this.limitCount = value;
    return this;
  }

  range(_start: number, _end: number) {
    return this;
  }

  upsert(payload: Record<string, unknown>, options?: UpsertOptions) {
    this.action = 'upsert';
    this.payload = payload;
    this.conflictTarget = options?.onConflict || 'id';
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  async single() {
    const response = await this.execute();
    return {
      ...response,
      data: Array.isArray(response.data) ? response.data[0] || null : response.data,
    };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async executeSelect() {
    try {
      const snapshot = await fetchCollectionRowsInternal({
        collectionName: this.collectionName,
        limit: this.limitCount || CLOUD_PAGE_SIZE,
        fields: this.selectedFields || undefined,
      });

      return {
        data: snapshot.rows.filter((row) =>
          this.filters.every((filter) => matchesFilter(row, filter)),
        ),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error,
      };
    }
  }

  private async executeDelete() {
    try {
      const currentId = this.filters.find(
        (item) => item.field === 'id' && item.operator === 'eq',
      )?.value;

      if (typeof currentId !== 'string' || !currentId.trim()) {
        throw createCloudError(
          'Delete remoto sem id em Firebase.',
          'firebase_delete_missing_id',
          400,
        );
      }

      await deleteDoc(doc(firestoreDb!, this.collectionName, currentId));
      return {
        data: null,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error,
      };
    }
  }

  private async executeUpsert() {
    try {
      const payload = this.payload || {};
      const conflictDoc =
        this.conflictTarget !== 'id'
          ? await findDocumentByConflict(this.collectionName, this.conflictTarget, payload)
          : null;
      const targetId =
        conflictDoc?.id ||
        (typeof payload.id === 'string' && payload.id.trim() ? payload.id : crypto.randomUUID());
      const ref = doc(firestoreDb!, this.collectionName, targetId);
      const nextPayload = {
        ...payload,
        id: targetId,
      };

      await setDoc(ref, nextPayload, { merge: true });
      const saved = await getDoc(ref);

      return {
        data: saved.exists()
          ? withDocIdentity(saved.id, saved.data() as Record<string, unknown>)
          : null,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error,
      };
    }
  }

  private async execute() {
    if (this.action === 'delete') {
      return await this.executeDelete();
    }

    if (this.action === 'upsert') {
      return await this.executeUpsert();
    }

    return await this.executeSelect();
  }
}

export const cloudProviderMode = firebaseProviderMode;
export const cloudConfigurationHint = firebaseConfigurationHint;
export const isCloudConfigured = Boolean(firebaseAuth && firestoreDb);

export const onCloudAuthStateChange = (listener: CloudAuthListener) => {
  ensureConfigured();

  const unsubscribe = onAuthStateChanged(firebaseAuth!, (user) => {
    if (!user) {
      clearPersistedSession();
      listener(null);
      return;
    }

    const persisted = readPersistedSession();
    void buildCloudSession(user, persisted).then(listener).catch(() => listener(null));
  });

  authListeners.add(listener);

  return {
    unsubscribe() {
      authListeners.delete(listener);
      unsubscribe();
    },
  };
};

export const getHealthyCloudSessionColaboradorId = () =>
  readPersistedSession()?.user?.colaboradorId || '';

export const clearCloudSessionLocal = () => {
  clearPersistedSession();
  emitAuthChange(null);
};

export const ensureCloudDeviceSession = async (device?: DeviceSnapshot) => {
  const firebaseUser = await ensureFirebaseUser();
  const snapshot = buildDeviceSnapshot(device);
  await upsertDeviceDocument(snapshot);

  const nextSession = await buildCloudSession(firebaseUser, {
    sessionType: 'device',
    deviceId: snapshot.id,
    user: null,
  });

  persistSessionMeta({
    sessionType: nextSession.sessionType,
    deviceId: nextSession.deviceId,
    user: nextSession.user,
  });
  emitAuthChange(nextSession);
  return nextSession;
};

export const signInCloudColaborador = async (
  colaborador: Colaborador,
  _pin: string,
  device?: DeviceSnapshot,
) => {
  const snapshot = buildDeviceSnapshot(device);
  const firebaseUser = await ensureFirebaseUser();
  await upsertDeviceDocument(snapshot);

  const nextSession = await buildCloudSession(firebaseUser, {
    sessionType: 'colaborador',
    deviceId: snapshot.id,
    user: {
      id: firebaseUser.uid,
      colaboradorId: colaborador.id,
      matricula: colaborador.matricula,
    },
  });

  persistSessionMeta({
    sessionType: nextSession.sessionType,
    deviceId: nextSession.deviceId,
    user: nextSession.user,
  });
  emitAuthChange(nextSession);
  return nextSession;
};

export const signOutCloudSession = async () => {
  clearPersistedSession();
  emitAuthChange(null);

  if (!firebaseAuth) {
    return;
  }

  try {
    await signOut(firebaseAuth);
  } catch {
    // logout local prevalece
  }
};

export const getCloudSessionSafe = async (
  requiredMode: 'any' | 'colaborador' = 'any',
): Promise<CloudSession | null> => {
  if (!firebaseAuth?.currentUser) {
    return null;
  }

  const persisted = readPersistedSession();
  const current =
    persisted ||
    ({
      sessionType: 'device',
      deviceId: getStoredDeviceId(),
      user: null,
    } satisfies Pick<CloudSession, 'sessionType' | 'deviceId' | 'user'>);

  if (requiredMode === 'colaborador' && current.sessionType !== 'colaborador') {
    return null;
  }

  const session = await buildCloudSession(firebaseAuth.currentUser, current);
  persistSessionMeta({
    sessionType: session.sessionType,
    deviceId: session.deviceId,
    user: session.user,
  });
  return session;
};

export const fetchCloudSession = async (): Promise<CloudSession | null> =>
  await getCloudSessionSafe('any');

const ensureCloudReadSession = async () => {
  const currentSession = await getCloudSessionSafe('any');
  if (currentSession) {
    return currentSession;
  }

  return await ensureCloudDeviceSession();
};

export const fetchCloudCapabilities = async () => ({
  provider: 'firebase',
  warnings: [] as string[],
  supportsAvaliacaoMediaCachos3: true,
  supportsRegistroQuantidadeCachos3: true,
  supportsAvaliacaoFinalStatus: true,
  supportsAvaliacaoFlowOptions: true,
  supportsAvaliacaoRuaTipoFalha: true,
  supportsAvaliacaoDataColheita: true,
  supportsDeviceBootstrapSession: true,
  pageSize: CLOUD_PAGE_SIZE,
});

export const fetchCloudPublicColaboradores = async ({
  updatedAfter,
  afterUpdatedAt,
  afterId,
  limit: requestedLimit,
  fields,
}: {
  updatedAfter?: string;
  afterUpdatedAt?: string;
  afterId?: string;
  limit?: number;
  fields?: string;
}) => {
  await ensureCloudReadSession();
  const response = await fetchCollectionRowsInternal({
    collectionName: 'colaboradores',
    updatedAfter,
    afterUpdatedAt,
    afterId,
    limit: requestedLimit,
    fields,
    extraFilters: [
      { field: 'ativo', op: '==', value: true },
      { field: 'deletado_em', op: '==', value: null },
    ],
    maxLimit: PUBLIC_COLABORADORES_PAGE_SIZE,
  });

  return response;
};

export const fetchCloudCollectionRows = async ({
  collection: collectionName,
  updatedAfter,
  afterUpdatedAt,
  afterId,
  limit: requestedLimit,
  fields,
}: {
  collection: string;
  updatedAfter?: string;
  afterUpdatedAt?: string;
  afterId?: string;
  limit?: number;
  fields?: string;
}) => {
  await ensureCloudReadSession();
  return await fetchCollectionRowsInternal({
    collectionName,
    updatedAfter,
    afterUpdatedAt,
    afterId,
    limit: requestedLimit,
    fields,
  });
};

export const pushCloudMutation = async ({
  collection: collectionName,
  operation,
  payload,
  conflictTarget,
  recordId,
}: {
  collection: string;
  operation: 'upsert' | 'delete';
  payload?: Record<string, unknown>;
  conflictTarget?: string;
  recordId?: string;
}) => {
  await ensureCloudDeviceSession();
  ensureConfigured();

  if (operation === 'delete') {
    const normalizedId = String(recordId || payload?.id || '').trim();
    if (!normalizedId) {
      throw createCloudError(
        'Delete remoto sem id em Firebase.',
        'firebase_delete_missing_id',
        400,
      );
    }

    await deleteDoc(doc(firestoreDb!, collectionName, normalizedId));
    return { row: null };
  }

  const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
  const targetDoc =
    conflictTarget && conflictTarget !== 'id'
      ? await findDocumentByConflict(collectionName, conflictTarget, normalizedPayload)
      : null;
  const targetId =
    targetDoc?.id ||
    String(
      normalizedPayload.id ||
        recordId ||
        crypto.randomUUID(),
    ).trim();
  const ref = doc(firestoreDb!, collectionName, targetId);
  const documentPayload = {
    ...normalizedPayload,
    id: targetId,
  };

  await setDoc(ref, documentPayload, { merge: true });
  const saved = await getDoc(ref);

  return {
    row: saved.exists()
      ? withDocIdentity(saved.id, saved.data() as Record<string, unknown>)
      : null,
  };
};

export const firebaseRemoteCompat = {
  from(collectionName: string) {
    return new FirebaseQueryBuilder(collectionName);
  },
};
