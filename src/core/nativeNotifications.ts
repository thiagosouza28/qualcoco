import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import type { Notificacao } from '@/core/types';

const DELIVERED_IDS_STORAGE_KEY = 'qualcoco:native-notifications:delivered';
const MAX_STORED_DELIVERED_IDS = 400;
const NATIVE_NOTIFICATION_DELAY_MS = 800;

const canUseNativeNotifications = () => Capacitor.isNativePlatform();

const loadDeliveredIds = () => {
  try {
    const raw = window.localStorage.getItem(DELIVERED_IDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const saveDeliveredIds = (ids: string[]) => {
  try {
    window.localStorage.setItem(
      DELIVERED_IDS_STORAGE_KEY,
      JSON.stringify(ids.slice(-MAX_STORED_DELIVERED_IDS)),
    );
  } catch {
    // Ignora falhas de persistencia local.
  }
};

const trackDeliveredId = (id: string) => {
  const deliveredIds = loadDeliveredIds();
  if (deliveredIds.includes(id)) {
    return;
  }

  deliveredIds.push(id);
  saveDeliveredIds(deliveredIds);
};

const untrackDeliveredId = (id: string) => {
  const nextIds = loadDeliveredIds().filter((item) => item !== id);
  saveDeliveredIds(nextIds);
};

const wasDelivered = (id: string) => loadDeliveredIds().includes(id);

const createNativeId = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return (hash % 2147480000) + 1;
};

export const prepararNotificacoesNativas = async () => {
  if (!canUseNativeNotifications()) {
    return false;
  }

  const status = await LocalNotifications.checkPermissions();
  if (status.display === 'granted') {
    return true;
  }

  const requested = await LocalNotifications.requestPermissions();
  return requested.display === 'granted';
};

export const publicarNotificacaoNativa = async (
  notificacao: Pick<
    Notificacao,
    'id' | 'titulo' | 'mensagem' | 'acaoPath' | 'acaoLabel'
  >,
) => {
  if (!canUseNativeNotifications()) {
    return false;
  }

  const notificacaoId = String(notificacao.id || '').trim();
  if (!notificacaoId || wasDelivered(notificacaoId)) {
    return false;
  }

  const granted = await prepararNotificacoesNativas();
  if (!granted) {
    return false;
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: createNativeId(notificacaoId),
        title: notificacao.titulo,
        body: notificacao.mensagem,
        schedule: {
          at: new Date(Date.now() + NATIVE_NOTIFICATION_DELAY_MS),
          allowWhileIdle: true,
        },
        extra: {
          notificacaoId,
          acaoPath: notificacao.acaoPath || '/notificacoes',
          acaoLabel: notificacao.acaoLabel || 'Abrir',
        },
      },
    ],
  });

  trackDeliveredId(notificacaoId);
  return true;
};

export const publicarNotificacoesNativasPendentes = async (
  notificacoes: Notificacao[],
  options: {
    limit?: number;
  } = {},
) => {
  if (!canUseNativeNotifications()) {
    return 0;
  }

  const pendentes = notificacoes
    .filter((item) => !item.lida && !item.deletadoEm)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .slice(-(options.limit ?? 5));

  let delivered = 0;
  for (const notificacao of pendentes) {
    if (await publicarNotificacaoNativa(notificacao)) {
      delivered += 1;
    }
  }

  return delivered;
};

export const limparMarcacaoNotificacaoNativa = (notificacaoId?: string | null) => {
  const normalized = String(notificacaoId || '').trim();
  if (!normalized) {
    return;
  }

  untrackDeliveredId(normalized);
};

export const limparTodasNotificacoesNativas = async () => {
  saveDeliveredIds([]);

  if (!canUseNativeNotifications()) {
    return false;
  }

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((item) => ({ id: item.id })),
    });
  }

  await LocalNotifications.removeAllDeliveredNotifications();
  return true;
};
