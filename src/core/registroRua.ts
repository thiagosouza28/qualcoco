export const LEGACY_COLETA_OBSERVACOES = [
  'Falta colher',
  'Falta tropear',
] as const;

export type EstadoColetaRua = 'normal' | 'falta_colher' | 'falta_tropear';

const normalizeObservacaoText = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const splitObservacoes = (observacoes = '') =>
  String(observacoes)
    .split(' • ')
    .map((item) => item.trim())
    .filter(Boolean);

export const getMarcacoesLegadasColeta = (observacoes = '') => {
  const normalized = normalizeObservacaoText(observacoes);
  return {
    faltaColher: normalized.includes('falta colher'),
    faltaTropear: normalized.includes('falta tropear'),
  };
};

export const limparMarcacoesLegadasColeta = (
  observacoes: string | null | undefined,
) =>
  splitObservacoes(String(observacoes || ''))
    .filter((item) => {
      const normalized = normalizeObservacaoText(item);
      return normalized !== 'falta colher' && normalized !== 'falta tropear';
    })
    .join(' • ');

export const normalizarContagemRua = (
  value: number | string | null | undefined,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.trunc(parsed));
};

export const resolverEstadoColetaRua = ({
  quantidade,
  quantidadeCachos3,
  observacoes = '',
}: {
  quantidade: number | string | null | undefined;
  quantidadeCachos3: number | string | null | undefined;
  observacoes?: string | null | undefined;
}): EstadoColetaRua => {
  const quantidadeNormalizada = Number(quantidade);
  const cachosNormalizados = Number(quantidadeCachos3);

  if (Number.isFinite(cachosNormalizados) && cachosNormalizados < 0) {
    return 'falta_colher';
  }

  if (Number.isFinite(quantidadeNormalizada) && quantidadeNormalizada < 0) {
    return 'falta_tropear';
  }

  const legacy = getMarcacoesLegadasColeta(observacoes || '');
  if (legacy.faltaColher) {
    return 'falta_colher';
  }

  if (legacy.faltaTropear) {
    return 'falta_tropear';
  }

  return 'normal';
};

export const serializarEstadoColetaRua = ({
  estado,
  quantidade,
  quantidadeCachos3,
}: {
  estado: EstadoColetaRua;
  quantidade: number | string | null | undefined;
  quantidadeCachos3: number | string | null | undefined;
}) => {
  const quantidadeNormalizada = normalizarContagemRua(quantidade);
  const cachosNormalizados = normalizarContagemRua(quantidadeCachos3);

  if (estado === 'falta_colher') {
    return {
      quantidade: -1,
      quantidadeCachos3: -1,
    };
  }

  if (estado === 'falta_tropear') {
    return {
      quantidade: -1,
      quantidadeCachos3: cachosNormalizados,
    };
  }

  return {
    quantidade: quantidadeNormalizada,
    quantidadeCachos3: cachosNormalizados,
  };
};

export const obterApresentacaoEstadoColetaRua = ({
  quantidade,
  quantidadeCachos3,
  observacoes = '',
}: {
  quantidade: number | string | null | undefined;
  quantidadeCachos3: number | string | null | undefined;
  observacoes?: string | null | undefined;
}) => {
  const estado = resolverEstadoColetaRua({
    quantidade,
    quantidadeCachos3,
    observacoes,
  });

  return {
    estado,
    quantidade: normalizarContagemRua(quantidade),
    quantidadeCachos3: normalizarContagemRua(quantidadeCachos3),
    faltaColher: estado === 'falta_colher',
    faltaTropear: estado === 'falta_tropear',
    siglaCacho: estado === 'falta_colher' ? 'F.C' : null,
    siglaCocos:
      estado === 'falta_colher'
        ? '--'
        : estado === 'falta_tropear'
          ? 'F.T'
          : null,
  };
};
