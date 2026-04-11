import { nowIso } from '@/core/date';
import { getOrCreateDevice } from '@/core/device';
import { notificarNovaParcela } from '@/core/notifications';
import { normalizarCodigoParcela } from '@/core/parcelCode';
import {
  getAccessContext,
  normalizePerfilUsuario,
} from '@/core/permissions';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import type {
  Colaborador,
  Equipe,
  Parcela,
  ParcelaPlanejada,
} from '@/core/types';

const getEquipeNome = (equipe?: Equipe | null) =>
  equipe?.nome || (typeof equipe?.numero === 'number' ? String(equipe.numero).padStart(2, '0') : '');

const getColaboradorNome = (colaborador?: Colaborador | null) =>
  colaborador?.nome || colaborador?.primeiroNome || '';

type ParcelaPlanejadaInput = {
  codigo: string;
  equipeId: string | null;
  alinhamentoInicial: number;
  alinhamentoFinal: number;
  alinhamentoTipo?: ParcelaPlanejada['alinhamentoTipo'];
  dataColheita: string;
  observacao?: string;
  criadoPor: string;
  origem: ParcelaPlanejada['origem'];
};

const normalizarInputParcelaPlanejada = (input: ParcelaPlanejadaInput) => {
  const normalizedCodigo = normalizarCodigoParcela(input.codigo);
  const equipeId = String(input.equipeId || '').trim() || null;

  if (!normalizedCodigo) {
    throw new Error('Informe o codigo da parcela.');
  }
  if (!equipeId) {
    throw new Error('Selecione a equipe da parcela.');
  }
  if (!input.dataColheita) {
    throw new Error('Informe a data da colheita.');
  }
  if (
    !Number.isFinite(input.alinhamentoInicial) ||
    !Number.isFinite(input.alinhamentoFinal) ||
    input.alinhamentoInicial <= 0 ||
    input.alinhamentoFinal <= 0 ||
    input.alinhamentoFinal < input.alinhamentoInicial
  ) {
    throw new Error('Informe um alinhamento inicial e final valido.');
  }
  if (!input.criadoPor) {
    throw new Error('Usuario responsavel nao informado para o cadastro.');
  }

  return {
    ...input,
    codigo: normalizedCodigo,
    equipeId,
    observacao: String(input.observacao || '').trim(),
    alinhamentoInicial: Number(input.alinhamentoInicial),
    alinhamentoFinal: Number(input.alinhamentoFinal),
  };
};

const validarDuplicidadeParcelaPlanejada = async (
  input: ReturnType<typeof normalizarInputParcelaPlanejada>,
  options: {
    ignoreId?: string;
  } = {},
) => {
  const existentes = await repository.filter(
    'parcelasPlanejadas',
    (item) =>
      !item.deletadoEm &&
      item.status !== 'concluida' &&
      item.id !== options.ignoreId &&
      normalizarCodigoParcela(item.codigo) === input.codigo &&
      String(item.equipeId || '') === String(input.equipeId || '') &&
      item.dataColheita === input.dataColheita,
  );
  if (existentes[0]) {
    throw new Error(
      'Ja existe uma parcela planejada ativa com este codigo para a mesma equipe e data.',
    );
  }
};

export const garantirParcelaCatalogo = async (codigo: string) => {
  const normalizedCodigo = normalizarCodigoParcela(codigo);
  if (!normalizedCodigo) {
    throw new Error('Informe o codigo da parcela.');
  }

  const existentes = await repository.filter(
    'parcelas',
    (item) =>
      !item.deletadoEm &&
      normalizarCodigoParcela(item.codigo) === normalizedCodigo,
  );

  if (existentes[0]) {
    return existentes[0];
  }

  const device = await getOrCreateDevice();
  return await createEntity('parcelas', device.id, {
    codigo: normalizedCodigo,
    descricao: normalizedCodigo,
    ativo: true,
  });
};

export const cadastrarParcelaPlanejada = async (input: {
  codigo: string;
  equipeId: string | null;
  alinhamentoInicial: number;
  alinhamentoFinal: number;
  alinhamentoTipo?: ParcelaPlanejada['alinhamentoTipo'];
  dataColheita: string;
  observacao?: string;
  criadoPor: string;
  origem: ParcelaPlanejada['origem'];
}) => {
  const normalizedInput = normalizarInputParcelaPlanejada(input);

  const [equipe, criador, parcelaCatalogo] = await Promise.all([
    repository.get('equipes', normalizedInput.equipeId),
    repository.get('colaboradores', normalizedInput.criadoPor),
    garantirParcelaCatalogo(normalizedInput.codigo),
  ]);

  const perfilCriador = normalizePerfilUsuario(criador?.perfil);
  if (
    normalizedInput.origem === 'fiscal' &&
    perfilCriador !== 'fiscal' &&
    perfilCriador !== 'fiscal_chefe' &&
    perfilCriador !== 'administrador'
  ) {
    throw new Error('A origem fiscal exige um usuario com perfil autorizado.');
  }

  await validarDuplicidadeParcelaPlanejada(normalizedInput);

  const device = await getOrCreateDevice();
  const parcelaPlanejada = await createEntity('parcelasPlanejadas', device.id, {
    codigo: normalizedInput.codigo,
    equipeId: normalizedInput.equipeId,
    equipeNome: getEquipeNome(equipe),
    alinhamentoInicial: normalizedInput.alinhamentoInicial,
    alinhamentoFinal: normalizedInput.alinhamentoFinal,
    alinhamentoTipo: normalizedInput.alinhamentoTipo || undefined,
    dataColheita: normalizedInput.dataColheita,
    observacao: normalizedInput.observacao,
    criadoPor: normalizedInput.criadoPor,
    criadoPorNome: getColaboradorNome(criador),
    origem: normalizedInput.origem,
    status: 'disponivel',
    parcelaId: parcelaCatalogo.id,
    avaliacaoId: null,
  });

  await notificarNovaParcela({
    parcelaPlanejadaId: parcelaPlanejada.id,
    codigo: parcelaPlanejada.codigo,
    equipeId: parcelaPlanejada.equipeId || null,
    equipeNome: parcelaPlanejada.equipeNome,
  });

  return parcelaPlanejada;
};

export const cadastrarParcelasPlanejadasEmLote = async (input: {
  parcelas: ParcelaPlanejadaInput[];
}) => {
  const parcelas = input.parcelas || [];
  if (parcelas.length === 0) {
    throw new Error('Adicione pelo menos uma parcela antes de salvar.');
  }

  const chaves = new Set<string>();
  for (const parcela of parcelas) {
    const normalized = normalizarInputParcelaPlanejada(parcela);
    const chave = [normalized.codigo, normalized.equipeId, normalized.dataColheita].join(':');
    if (chaves.has(chave)) {
      throw new Error(
        `A parcela ${normalized.codigo} foi informada mais de uma vez para a mesma equipe e data.`,
      );
    }
    chaves.add(chave);
  }

  const cadastradas: ParcelaPlanejada[] = [];
  for (const parcela of parcelas) {
    cadastradas.push(await cadastrarParcelaPlanejada(parcela));
  }

  return cadastradas;
};

export const atualizarParcelaPlanejada = async (
  parcelaPlanejadaId: string,
  input: Omit<ParcelaPlanejadaInput, 'criadoPor' | 'origem'>,
) => {
  const atual = await repository.get('parcelasPlanejadas', parcelaPlanejadaId);
  if (!atual || atual.deletadoEm) {
    throw new Error('Parcela planejada nao encontrada.');
  }
  if (atual.status !== 'disponivel' || atual.avaliacaoId) {
    throw new Error('So e possivel editar parcelas planejadas ainda disponiveis.');
  }

  const normalizedInput = normalizarInputParcelaPlanejada({
    ...input,
    criadoPor: atual.criadoPor,
    origem: atual.origem,
  });

  const [equipe, parcelaCatalogo] = await Promise.all([
    repository.get('equipes', normalizedInput.equipeId),
    garantirParcelaCatalogo(normalizedInput.codigo),
  ]);

  await validarDuplicidadeParcelaPlanejada(normalizedInput, {
    ignoreId: atual.id,
  });

  const next: ParcelaPlanejada = {
    ...atual,
    codigo: normalizedInput.codigo,
    equipeId: normalizedInput.equipeId,
    equipeNome: getEquipeNome(equipe),
    alinhamentoInicial: normalizedInput.alinhamentoInicial,
    alinhamentoFinal: normalizedInput.alinhamentoFinal,
    alinhamentoTipo: normalizedInput.alinhamentoTipo || undefined,
    dataColheita: normalizedInput.dataColheita,
    observacao: normalizedInput.observacao,
    parcelaId: parcelaCatalogo.id,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: atual.versao + 1,
  };

  await saveEntity('parcelasPlanejadas', next);
  return next;
};

export const excluirParcelaPlanejada = async (
  parcelaPlanejadaId: string,
  options: {
    actorPerfil?: string | null;
  } = {},
) => {
  const atual = await repository.get('parcelasPlanejadas', parcelaPlanejadaId);
  if (!atual || atual.deletadoEm) {
    throw new Error('Parcela planejada nao encontrada.');
  }
  const actorPerfil = normalizePerfilUsuario(options.actorPerfil);
  const podeExcluirEmQualquerStatus = actorPerfil === 'administrador';

  if (!podeExcluirEmQualquerStatus && (atual.status !== 'disponivel' || atual.avaliacaoId)) {
    throw new Error('So e possivel excluir parcelas planejadas ainda disponiveis.');
  }

  const next: ParcelaPlanejada = {
    ...atual,
    deletadoEm: nowIso(),
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: atual.versao + 1,
  };

  await saveEntity('parcelasPlanejadas', next);
  return next;
};

export const listarParcelasPlanejadasVisiveis = async (input: {
  usuarioId?: string;
  equipeId?: string | null;
  incluirConcluidas?: boolean;
}) => {
  const access = await getAccessContext(input.usuarioId);
  const equipeDiaId = String(input.equipeId || '').trim();

  return (await repository.list('parcelasPlanejadas'))
    .filter((item) => !item.deletadoEm)
    .filter((item) => input.incluirConcluidas || item.status !== 'concluida')
    .filter((item) => {
      if (access.visaoTotal) {
        return true;
      }

      if (access.perfil === 'fiscal') {
        return Boolean(item.equipeId) && access.equipeIds.includes(item.equipeId || '');
      }

      if (access.perfil === 'colaborador') {
        return equipeDiaId ? item.equipeId === equipeDiaId : true;
      }

      return true;
    })
    .sort((a, b) =>
      b.dataColheita.localeCompare(a.dataColheita) ||
      a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
    );
};

export const atualizarStatusParcelaPlanejada = async (input: {
  parcelaPlanejadaId: string;
  status: ParcelaPlanejada['status'];
  avaliacaoId?: string | null;
}) => {
  const parcelaPlanejada = await repository.get(
    'parcelasPlanejadas',
    input.parcelaPlanejadaId,
  );
  if (!parcelaPlanejada || parcelaPlanejada.deletadoEm) {
    return null;
  }

  const next: ParcelaPlanejada = {
    ...parcelaPlanejada,
    status: input.status,
    avaliacaoId:
      input.avaliacaoId === undefined
        ? parcelaPlanejada.avaliacaoId || null
        : input.avaliacaoId || null,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: parcelaPlanejada.versao + 1,
  };
  await saveEntity('parcelasPlanejadas', next);
  return next;
};

export const vincularParcelasPlanejadasAvaliacao = async (input: {
  parcelaPlanejadaIds?: string[];
  avaliacaoId: string;
  status?: ParcelaPlanejada['status'];
}) => {
  const ids = Array.from(
    new Set((input.parcelaPlanejadaIds || []).filter(Boolean)),
  );
  const atualizadas: ParcelaPlanejada[] = [];

  for (const parcelaPlanejadaId of ids) {
    const updated = await atualizarStatusParcelaPlanejada({
      parcelaPlanejadaId,
      avaliacaoId: input.avaliacaoId,
      status: input.status || 'em_andamento',
    });
    if (updated) {
      atualizadas.push(updated);
    }
  }

  return atualizadas;
};

export const listarParcelasPlanejadasPorAvaliacao = async (avaliacaoId?: string) => {
  if (!avaliacaoId) {
    return [];
  }

  return (await repository.filter(
    'parcelasPlanejadas',
    (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
  )).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
};

export const obterParcelaPlanejada = async (parcelaPlanejadaId?: string | null) => {
  if (!parcelaPlanejadaId) {
    return null;
  }

  const parcelaPlanejada = await repository.get('parcelasPlanejadas', parcelaPlanejadaId);
  return parcelaPlanejada && !parcelaPlanejada.deletadoEm ? parcelaPlanejada : null;
};

export const listarParcelasPlanejadasEmRetoque = async (input: {
  usuarioId?: string;
  equipeId?: string | null;
}) =>
  (await listarParcelasPlanejadasVisiveis({
    usuarioId: input.usuarioId,
    equipeId: input.equipeId,
    incluirConcluidas: true,
  })).filter((item) => item.status === 'em_retoque');
