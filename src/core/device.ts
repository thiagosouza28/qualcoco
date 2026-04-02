import { STORAGE_KEYS } from '@/core/constants';
import { nowIso } from '@/core/date';
import { addSyncQueueItem, getById, putRecord } from '@/core/localDb';
import type { Dispositivo } from '@/core/types';

const getDeviceName = () =>
  `Campo ${navigator.platform || 'Mobile'} ${navigator.userAgent.includes('Android') ? 'Android' : 'Web'}`;

export const getDeviceId = () => {
  const current = window.localStorage.getItem(STORAGE_KEYS.dispositivoId);
  if (current) return current;

  const created = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEYS.dispositivoId, created);
  return created;
};

export const getOrCreateDevice = async () => {
  const deviceId = getDeviceId();
  const existing = await getById<Dispositivo>('dispositivos', deviceId);

  if (existing) {
    return existing;
  }

  const now = nowIso();
  const device: Dispositivo = {
    id: deviceId,
    localId: `dispositivo:${deviceId}`,
    nomeDispositivo: getDeviceName(),
    identificadorLocal: deviceId,
    ultimoSyncEm: null,
    criadoEm: now,
    atualizadoEm: now,
    deletadoEm: null,
    syncStatus: 'pending_sync',
    versao: 1,
    origemDispositivoId: deviceId,
  };

  await putRecord('dispositivos', device);
  await addSyncQueueItem({
    entidade: 'dispositivos',
    registroId: deviceId,
    operacao: 'upsert',
    payload: device as any,
    origem: 'local',
  });
  
  return device;
};
