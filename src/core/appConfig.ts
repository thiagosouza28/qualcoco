import { nowIso } from '@/core/date';
import { getDeviceId } from '@/core/device';
import {
  DEFAULT_PERMISSOES_PERFIS,
  normalizePermissoesPerfisConfig,
} from '@/core/permissions';
import { repository } from '@/core/repositories';
import type { Configuracao } from '@/core/types';

export const DEFAULT_LIMITES_CONFIGURACAO = {
  limiteCocosChao: 19,
  limiteCachos3Cocos: 19,
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
  const limiteCocos = Number(config?.limiteCocosChao);
  const limiteCachos = Number(config?.limiteCachos3Cocos);
  return {
    ...fallback,
    ...(config || {}),
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
