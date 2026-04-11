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
  const normalizedCodigo = normalizarCodigoParcela(input.codigo);
  if (!normalizedCodigo) {
    throw new Error('Informe o codigo da parcela.');
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

  const [equipe, criador, parcelaCatalogo] = await Promise.all([
    input.equipeId ? repository.get('equipes', input.equipeId) : Promise.resolve(null),
    repository.get('colaboradores', input.criadoPor),
    garantirParcelaCatalogo(normalizedCodigo),
  ]);

  const perfilCriador = normalizePerfilUsuario(criador?.perfil);
  if (
    input.origem === 'fiscal' &&
    perfilCriador !== 'fiscal' &&
    perfilCriador !== 'fiscal_chefe' &&
    perfilCriador !== 'administrador'
  ) {
    throw new Error('A origem fiscal exige um usuario com perfil autorizado.');
  }

  const existentes = await repository.filter(
    'parcelasPlanejadas',
    (item) =>
      !item.deletadoEm &&
      item.status !== 'concluida' &&
      normalizarCodigoParcela(item.codigo) === normalizedCodigo &&
      String(item.equipeId || '') === String(input.equipeId || '') &&
      item.dataColheita === input.dataColheita,
  );
  if (existentes[0]) {
    throw new Error('Ja existe uma parcela planejada ativa com este codigo para a mesma equipe e data.');
  }

  const device = await getOrCreateDevice();
  const parcelaPlanejada = await createEntity('parcelasPlanejadas', device.id, {
    codigo: normalizedCodigo,
    equipeId: input.equipeId || null,
    equipeNome: getEquipeNome(equipe),
    alinhamentoInicial: Number(input.alinhamentoInicial),
    alinhamentoFinal: Number(input.alinhamentoFinal),
    alinhamentoTipo: input.alinhamentoTipo || undefined,
    dataColheita: input.dataColheita,
    observacao: String(input.observacao || '').trim(),
    criadoPor: input.criadoPor,
    criadoPorNome: getColaboradorNome(criador),
    origem: input.origem,
    status: 'disponivel',
    parcelaId: parcelaCatalogo.id,
    avaliacaoId: null,
  });

  await notificarNovaParcela({
    parcelaPlanejadaId: parcelaPlanejada.id,
    codigo: parcelaPlanejada.codigo,
    equipeId: parcelaPlanejada.equipeId || null,
  });

  return parcelaPlanejada;
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
