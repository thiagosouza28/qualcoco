import { getOrCreateDevice } from '@/core/device';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import { nowIso } from '@/core/date';
import type { Equipe } from '@/core/types';

export const listarEquipes = async () => {
  const equipes = await repository.list('equipes');
  return equipes
    .filter((item) => !item.deletadoEm)
    .sort((a, b) => a.numero - b.numero || a.nome.localeCompare(b.nome));
};

export const listarEquipesAtivas = async () => {
  const equipes = await listarEquipes();
  return equipes.filter((item) => item.ativa);
};

const validarEquipeDuplicada = async (numero: number, currentId?: string) => {
  const equipes = await listarEquipes();
  const duplicada = equipes.find(
    (item) => item.numero === numero && item.id !== currentId,
  );

  if (duplicada) {
    throw new Error(`Já existe equipe cadastrada com o número ${numero}.`);
  }
};

export const cadastrarEquipe = async (input: {
  numero: number;
  nome: string;
  fiscal?: string;
  ativa?: boolean;
}) => {
  if (!input.numero || input.numero < 1) {
    throw new Error('Informe um número de equipe válido.');
  }

  if (!input.nome.trim()) {
    throw new Error('Informe o nome da equipe.');
  }

  await validarEquipeDuplicada(input.numero);
  const device = await getOrCreateDevice();

  return createEntity('equipes', device.id, {
    numero: input.numero,
    nome: input.nome.trim(),
    fiscal: input.fiscal?.trim() || '',
    ativa: input.ativa ?? true,
  });
};

export const atualizarEquipe = async (
  equipe: Equipe,
  input: {
    numero: number;
    nome: string;
    fiscal?: string;
    ativa: boolean;
  },
) => {
  if (!input.numero || input.numero < 1) {
    throw new Error('Informe um número de equipe válido.');
  }

  if (!input.nome.trim()) {
    throw new Error('Informe o nome da equipe.');
  }

  if (input.numero !== equipe.numero) {
    await validarEquipeDuplicada(input.numero, equipe.id);
  }

  const next: Equipe = {
    ...equipe,
    numero: input.numero,
    nome: input.nome.trim(),
    fiscal: input.fiscal?.trim() || '',
    ativa: input.ativa,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: equipe.versao + 1,
  };

  await saveEntity('equipes', next);
  return next;
};

export const alternarEquipeAtiva = async (equipe: Equipe, ativa: boolean) =>
  atualizarEquipe(equipe, {
    numero: equipe.numero,
    nome: equipe.nome,
    fiscal: equipe.fiscal,
    ativa,
  });

export const excluirEquipe = async (equipe: Equipe) => {
  const next: Equipe = {
    ...equipe,
    deletadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: equipe.versao + 1,
    atualizadoEm: nowIso(),
  };

  await saveEntity('equipes', next);
  return next;
};
