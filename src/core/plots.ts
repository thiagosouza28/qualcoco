import { MAX_ALINHAMENTO, MAX_PARCELAS } from '@/core/constants';
import type { FaixaFalhaParcela, SentidoRuas } from '@/core/types';

export type AlinhamentoTipo = 'inferior-impar' | 'inferior-par';

export const gerarCatalogoParcelas = () => {
  const parcelas: { codigo: string; descricao: string }[] = [];
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (const letra of letras) {
    for (let dezena = 10; dezena <= 18; dezena += 1) {
      for (let unidade = 1; unidade <= 4; unidade += 1) {
        const codigo = `${letra}-${dezena}${unidade}`;
        parcelas.push({
          codigo,
          descricao: `Parcela ${codigo}`,
        });
      }
    }
  }

  return parcelas;
};

export const gerarRuasDaParcela = ({
  linhaInicial,
  linhaFinal,
  alinhamentoTipo,
  faixasFalha = [],
  sentidoRuas = 'inicio',
}: {
  linhaInicial: number;
  linhaFinal: number;
  alinhamentoTipo: AlinhamentoTipo;
  faixasFalha?: FaixaFalhaParcela[] | null;
  sentidoRuas?: SentidoRuas;
}) => {
  const ruas: Array<{ ruaNumero: number; linhaInicial: number; linhaFinal: number }> = [];
  const start = normalizarLinhaInicialPorAlinhamento(linhaInicial, alinhamentoTipo);
  const end = clamp(linhaFinal, 1, MAX_ALINHAMENTO);
  const linhasValidas: number[] = [];

  for (let linha = start; linha <= end - 1; linha += 2) {
    if (linhaEstaEmFalha(linha, linha + 1, alinhamentoTipo, faixasFalha)) continue;
    linhasValidas.push(linha);
  }

  const linhasOrdenadas =
    sentidoRuas === 'fim' ? [...linhasValidas].reverse() : linhasValidas;

  linhasOrdenadas.forEach((linha, index) => {
    ruas.push({
      ruaNumero: index + 1,
      linhaInicial: linha,
      linhaFinal: Math.min(linha + 1, end),
    });
  });

  return ruas;
};

export const podeSelecionarMaisParcelas = (quantidadeAtual: number) =>
  quantidadeAtual < MAX_PARCELAS;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number(value) || 0));

export const inferirAlinhamentoTipoPorLinha = (
  linhaInicial: number | string | null | undefined,
  fallback: AlinhamentoTipo = 'inferior-par',
) => {
  const linha = Number(linhaInicial);
  if (!Number.isFinite(linha) || linha <= 0) {
    return fallback;
  }

  return linha % 2 === 0 ? 'inferior-par' : 'inferior-impar';
};

export const linhaRespeitaAlinhamentoTipo = (
  linhaInicial: number | string | null | undefined,
  alinhamentoTipo: AlinhamentoTipo,
) => {
  const linha = Number(linhaInicial);
  if (!Number.isFinite(linha) || linha <= 0) {
    return false;
  }

  return inferirAlinhamentoTipoPorLinha(linha, alinhamentoTipo) === alinhamentoTipo;
};

export const normalizarLinhaInicialPorAlinhamento = (
  linhaInicial: number | string | null | undefined,
  alinhamentoTipo: AlinhamentoTipo,
  fallback = 1,
) => {
  const linha = clamp(Number(linhaInicial || fallback), 1, MAX_ALINHAMENTO);
  if (linhaRespeitaAlinhamentoTipo(linha, alinhamentoTipo)) {
    return linha;
  }

  const anterior = linha - 1;
  if (anterior >= 1 && linhaRespeitaAlinhamentoTipo(anterior, alinhamentoTipo)) {
    return anterior;
  }

  const proxima = linha + 1;
  if (proxima <= MAX_ALINHAMENTO && linhaRespeitaAlinhamentoTipo(proxima, alinhamentoTipo)) {
    return proxima;
  }

  return linha;
};

export const normalizarFaixaAlinhamento = ({
  linhaInicial,
  linhaFinal,
  alinhamentoTipo,
  fallbackInicio = 1,
  fallbackFim = MAX_ALINHAMENTO,
}: {
  linhaInicial: number | string | null | undefined;
  linhaFinal: number | string | null | undefined;
  alinhamentoTipo: AlinhamentoTipo;
  fallbackInicio?: number;
  fallbackFim?: number;
}) => {
  const inicio = normalizarLinhaInicialPorAlinhamento(
    linhaInicial,
    alinhamentoTipo,
    fallbackInicio,
  );
  const fim = clamp(Number(linhaFinal || fallbackFim), 1, MAX_ALINHAMENTO);
  const totalLinhas = fim >= inicio ? fim - inicio + 1 : 0;

  return {
    inicio,
    fim,
    linhaInicial: inicio,
    linhaFinal: fim,
    alinhamentoTipo,
    totalLinhas,
    totalDivisoes: Math.floor(totalLinhas / 2),
    linhaInicialAjustada: inicio !== Number(linhaInicial || fallbackInicio),
  };
};

export const distribuirRuasEntreParcelas = (
  totalRuas: number,
  totalParcelas: number,
) => {
  if (totalParcelas <= 0) return [];

  const base = Math.floor(totalRuas / totalParcelas);
  const resto = totalRuas % totalParcelas;

  return Array.from({ length: totalParcelas }, (_, index) =>
    base + (index < resto ? 1 : 0),
  );
};

export const normalizarFaixaLinhas = (
  linhaInicio: number | null | undefined,
  linhaFim: number | null | undefined,
  fallbackInicio = 1,
  fallbackFim = MAX_ALINHAMENTO,
) => {
  const inicio = Number(linhaInicio || fallbackInicio);
  const fim = Number(linhaFim || fallbackFim);

  return {
    inicio: clamp(inicio, 1, MAX_ALINHAMENTO),
    fim: clamp(fim, 1, MAX_ALINHAMENTO),
  };
};

const linhaEstaEmFalha = (
  linhaInicial: number,
  linhaFinal: number,
  alinhamentoTipo: AlinhamentoTipo,
  faixasFalha: FaixaFalhaParcela[] | null | undefined,
) => {
  if (!Array.isArray(faixasFalha) || faixasFalha.length === 0) {
    return false;
  }

  return faixasFalha.some((faixa) => {
    if (!faixa || faixa.alinhamentoTipo !== alinhamentoTipo) {
      return false;
    }

    const inicio = clamp(faixa.linhaInicial, 1, MAX_ALINHAMENTO);
    const fim = clamp(faixa.linhaFinal, 1, MAX_ALINHAMENTO);
    if (fim < inicio) {
      return false;
    }

    return linhaInicial <= fim && linhaFinal >= inicio;
  });
};

const distribuirRuasNoIntervalo = (
  linhasValidas: number[],
  totalRuas: number,
  linhaFim: number,
) => {
  if (!Number.isFinite(totalRuas) || totalRuas <= 0 || linhasValidas.length === 0) {
    return [] as Array<[number, number]>;
  }

  const totalSelecionado = Math.trunc(totalRuas);
  if (totalSelecionado <= 0) {
    return [] as Array<[number, number]>;
  }
  if (totalSelecionado >= linhasValidas.length) {
    return linhasValidas.map((linha) => [linha, Math.min(linha + 1, linhaFim)]);
  }

  if (totalSelecionado === 1) {
    const [linha] = linhasValidas;
    return [[linha, Math.min(linha + 1, linhaFim)]];
  }

  const ultimoIndice = linhasValidas.length - 1;
  const indices = Array.from({ length: totalSelecionado }, (_, index) =>
    Math.round((index * ultimoIndice) / (totalSelecionado - 1)),
  );

  return indices.map((indice) => {
    const linha = linhasValidas[indice];
    return [linha, Math.min(linha + 1, linhaFim)];
  });
};

export const gerarRuasComOffset = ({
  totalRuas,
  alinhamentoTipo,
  linhaInicio,
  linhaFim,
  faixasFalha = [],
  sentidoRuas = 'inicio',
}: {
  totalRuas: number;
  alinhamentoTipo: AlinhamentoTipo;
  linhaInicio: number;
  linhaFim: number;
  faixasFalha?: FaixaFalhaParcela[] | null;
  sentidoRuas?: SentidoRuas;
}) => {
  const inicio = normalizarLinhaInicialPorAlinhamento(linhaInicio, alinhamentoTipo);
  const fim = clamp(Number(linhaFim) || MAX_ALINHAMENTO, 1, MAX_ALINHAMENTO);
  const linhasValidas: number[] = [];

  for (let linha = inicio; linha <= fim - 1; linha += 2) {
    if (linhaEstaEmFalha(linha, linha + 1, alinhamentoTipo, faixasFalha)) {
      continue;
    }
    linhasValidas.push(linha);
  }

  const ruas = distribuirRuasNoIntervalo(linhasValidas, totalRuas, fim);

  return sentidoRuas === 'fim' ? [...ruas].reverse() : ruas;
};

export const gerarRuasDistribuidasPorFaixas = ({
  alinhamentoTipo,
  sentidoRuas = 'inicio',
  faixas,
}: {
  alinhamentoTipo: AlinhamentoTipo;
  sentidoRuas?: SentidoRuas;
  faixas: Array<{
    id: string;
    label: string;
    linhaInicio?: number | null;
    linhaFim?: number | null;
    fallbackInicio?: number;
    fallbackFim?: number;
    totalRuas: number;
    alinhamentoTipo?: AlinhamentoTipo;
    faixasFalha?: FaixaFalhaParcela[] | null;
    equipeId: string | null;
    equipeNome: string;
  }>;
}) => {
  return faixas
    .map((faixa) => {
      const alinhamentoFaixa = faixa.alinhamentoTipo || alinhamentoTipo;
      const normalizada = normalizarFaixaAlinhamento({
        linhaInicial: faixa.linhaInicio,
        linhaFinal: faixa.linhaFim,
        alinhamentoTipo: alinhamentoFaixa,
        fallbackInicio: faixa.fallbackInicio,
        fallbackFim: faixa.fallbackFim,
      });

      if (normalizada.fim <= normalizada.inicio) {
        return null;
      }

      return {
        ...faixa,
        inicio: normalizada.inicio,
        fim: normalizada.fim,
        ruas: gerarRuasComOffset({
          totalRuas: Number(faixa.totalRuas) || 0,
          alinhamentoTipo: alinhamentoFaixa,
          linhaInicio: normalizada.inicio,
          linhaFim: normalizada.fim,
          faixasFalha: faixa.faixasFalha,
          sentidoRuas,
        }),
      };
    })
    .filter(
      (
        faixa,
      ): faixa is {
        id: string;
        label: string;
        totalRuas: number;
        equipeId: string | null;
        equipeNome: string;
        inicio: number;
        fim: number;
        ruas: Array<[number, number]>;
      } => Boolean(faixa && faixa.ruas.length > 0),
    );
};
