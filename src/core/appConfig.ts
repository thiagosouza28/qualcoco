import { nowIso } from '@/core/date';
import { getDeviceId } from '@/core/device';
import {
  DEFAULT_PERMISSOES_PERFIS,
  normalizePermissoesPerfisConfig,
} from '@/core/permissions';
import { repository } from '@/core/repositories';
import type { Configuracao } from '@/core/types';

export const DEFAULT_LIMITES_CONFIGURACAO = {
  cocosPorBag: 600,
  cargasPorBag: 6,
  limiteCocosChao: 19,
  limiteCachos3Cocos: 19,
};

const normalizarNumeroConfig = (
  value: unknown,
  fallback: number,
  options: { min?: number; positive?: boolean } = {},
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  const min = options.positive ? Number.MIN_VALUE : options.min ?? 0;
  if (parsed < min) return fallback;

  return parsed;
};

export const buildDefaultConfiguracao = (deviceId = getDeviceId()): Configuracao => ({
  id: 'default',
  localId: 'config:default',
  criadoEm: nowIso(),
  atualizadoEm: nowIso(),
  deletadoEm: null,
  syncStatus: 'pending_sync',
  versao: 1,
  origemDispositivoId: deviceId,
  ...DEFAULT_LIMITES_CONFIGURACAO,
  permissoesPerfis: DEFAULT_PERMISSOES_PERFIS,
});

export const mergeConfiguracaoComPadrao = (
  config?: Configuracao | null,
  deviceId = getDeviceId(),
): Configuracao => {
  const fallback = buildDefaultConfiguracao(deviceId);
  const cocosPorBag = Number(config?.cocosPorBag);
  const cargasPorBag = Number(config?.cargasPorBag);
  const limiteCocos = Number(config?.limiteCocosChao);
  const limiteCachos = Number(config?.limiteCachos3Cocos);
  return {
    ...fallback,
    ...(config || {}),
    cocosPorBag: normalizarNumeroConfig(
      cocosPorBag,
      fallback.cocosPorBag,
      { min: 0 },
    ),
    cargasPorBag: normalizarNumeroConfig(
      cargasPorBag,
      fallback.cargasPorBag,
      { positive: true },
    ),
    limiteCocosChao: Number.isFinite(limiteCocos)
      ? limiteCocos
      : fallback.limiteCocosChao,
    limiteCachos3Cocos: Number.isFinite(limiteCachos)
      ? limiteCachos
      : fallback.limiteCachos3Cocos,
    permissoesPerfis: normalizePermissoesPerfisConfig(
      config?.permissoesPerfis || fallback.permissoesPerfis,
    ),
  };
};

export const obterConfiguracaoAtual = async () => {
  const items = await repository.list('configuracoes');
  return mergeConfiguracaoComPadrao((items[0] as Configuracao) || null);
};
