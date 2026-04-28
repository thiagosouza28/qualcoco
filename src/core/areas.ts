import { STORAGE_KEYS } from '@/core/constants';
import { nowIso } from '@/core/date';
import { getOrCreateDevice } from '@/core/device';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import type { Area, AreaAtiva } from '@/core/types';

const DEFAULT_LIMITE_COCOS_CHAO = 19;
const DEFAULT_LIMITE_CACHOS = 19;

export type AreaFormInput = {
  nome: string;
  limiteCocosChao: number;
  limiteCachos: number;
};

const normalizarLimiteArea = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

const normalizarNomeArea = (value: unknown) => String(value || '').trim();

const validarAreaInput = (input: AreaFormInput) => {
  const nome = normalizarNomeArea(input.nome);
  if (!nome) {
    throw new Error('Informe o nome da área.');
  }

  return {
    nome,
    limiteCocosChao: normalizarLimiteArea(
      input.limiteCocosChao,
      DEFAULT_LIMITE_COCOS_CHAO,
    ),
    limiteCachos: normalizarLimiteArea(input.limiteCachos, DEFAULT_LIMITE_CACHOS),
  };
};

export const toAreaAtiva = (area: Area): AreaAtiva => ({
  id: area.id,
  nome: area.nome,
  limiteCocosChao: normalizarLimiteArea(
    area.limiteCocosChao,
    DEFAULT_LIMITE_COCOS_CHAO,
  ),
  limiteCachos: normalizarLimiteArea(area.limiteCachos, DEFAULT_LIMITE_CACHOS),
});

export const getAreaAtivaIdSalva = () =>
  window.localStorage.getItem(STORAGE_KEYS.areaAtivaId) || '';

export const getAreaPadraoId = () =>
  window.localStorage.getItem(STORAGE_KEYS.areaPadraoId) || '';

export const isAreaPadrao = (areaId: string) => getAreaPadraoId() === areaId;

export const listarAreas = async () => {
  const areaPadraoId = getAreaPadraoId();
  const areas = await repository.list('areas');

  return areas
    .filter((item) => !item.deletadoEm)
    .sort((a, b) => {
      if (a.id === areaPadraoId && b.id !== areaPadraoId) return -1;
      if (b.id === areaPadraoId && a.id !== areaPadraoId) return 1;
      return (
        a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }) ||
        a.criadoEm.localeCompare(b.criadoEm)
      );
    });
};

export const obterAreaAtivaSalva = async () => {
  const areaId = getAreaAtivaIdSalva();
  if (!areaId) {
    return null;
  }

  const area = await repository.get('areas', areaId);
  if (!area || area.deletadoEm) {
    window.localStorage.removeItem(STORAGE_KEYS.areaAtivaId);
    return null;
  }

  return toAreaAtiva(area);
};

export const selecionarAreaAtiva = async (areaId: string) => {
  const area = await repository.get('areas', areaId);
  if (!area || area.deletadoEm) {
    throw new Error('Área não encontrada.');
  }

  window.localStorage.setItem(STORAGE_KEYS.areaAtivaId, area.id);
  return toAreaAtiva(area);
};

export const limparAreaAtivaSalva = () => {
  window.localStorage.removeItem(STORAGE_KEYS.areaAtivaId);
};

export const definirAreaPadrao = async (areaId: string) => {
  const area = await repository.get('areas', areaId);
  if (!area || area.deletadoEm) {
    throw new Error('Área não encontrada.');
  }

  window.localStorage.setItem(STORAGE_KEYS.areaPadraoId, area.id);
  return toAreaAtiva(area);
};

export const limparAreaPadrao = () => {
  window.localStorage.removeItem(STORAGE_KEYS.areaPadraoId);
};

export const criarArea = async (input: AreaFormInput) => {
  const device = await getOrCreateDevice();
  const normalized = validarAreaInput(input);
  const agora = nowIso();

  return createEntity('areas', device.id, {
    ...normalized,
    createdAt: agora,
    updatedAt: agora,
  });
};

export const atualizarArea = async (areaId: string, input: AreaFormInput) => {
  const atual = await repository.get('areas', areaId);
  if (!atual || atual.deletadoEm) {
    throw new Error('Área não encontrada.');
  }

  const normalized = validarAreaInput(input);
  const agora = nowIso();
  const next: Area = {
    ...atual,
    ...normalized,
    updatedAt: agora,
    atualizadoEm: agora,
    syncStatus: 'pending_sync',
    versao: atual.versao + 1,
  };

  await saveEntity('areas', next);
  return next;
};

export const duplicarArea = async (areaId: string) => {
  const area = await repository.get('areas', areaId);
  if (!area || area.deletadoEm) {
    throw new Error('Área não encontrada.');
  }

  return criarArea({
    nome: `${area.nome} - cópia`,
    limiteCocosChao: area.limiteCocosChao,
    limiteCachos: area.limiteCachos,
  });
};

export const excluirArea = async (areaId: string) => {
  const area = await repository.get('areas', areaId);
  if (!area || area.deletadoEm) {
    return null;
  }

  const agora = nowIso();
  await saveEntity('areas', {
    ...area,
    deletadoEm: agora,
    updatedAt: agora,
    atualizadoEm: agora,
    syncStatus: 'pending_sync',
    versao: area.versao + 1,
  });

  if (getAreaAtivaIdSalva() === areaId) {
    limparAreaAtivaSalva();
  }
  if (getAreaPadraoId() === areaId) {
    limparAreaPadrao();
  }

  return true;
};

