import { MAX_PARCELAS } from '@/core/constants';
import type { FaixaFalhaParcela, SentidoRuas } from '@/core/types';

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
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  faixasFalha?: FaixaFalhaParcela[] | null;
  sentidoRuas?: SentidoRuas;
}) => {
  const ruas: Array<{ ruaNumero: number; linhaInicial: number; linhaFinal: number }> = [];
  const start = Math.max(1, linhaInicial);
  const end = Math.min(136, linhaFinal);
  const isImpar = alinhamentoTipo === 'inferior-impar';
  const linhasValidas: number[] = [];

  for (let linha = start; linha < end; linha += 1) {
    const linhaValida = isImpar ? linha % 2 !== 0 : linha % 2 === 0;
    if (!linhaValida) continue;
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
  fallback: 'inferior-impar' | 'inferior-par' = 'inferior-par',
) => {
  const linha = Number(linhaInicial);
  if (!Number.isFinite(linha) || linha <= 0) {
    return fallback;
  }

  return linha % 2 === 0 ? 'inferior-par' : 'inferior-impar';
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
  fallbackFim = 136,
) => {
  const inicio = Number(linhaInicio || fallbackInicio);
  const fim = Number(linhaFim || fallbackFim);

  return {
    inicio: clamp(inicio, 1, 136),
    fim: clamp(fim, 1, 136),
  };
};

const linhaEstaEmFalha = (
  linhaInicial: number,
  linhaFinal: number,
  alinhamentoTipo: 'inferior-impar' | 'inferior-par',
  faixasFalha: FaixaFalhaParcela[] | null | undefined,
) => {
  if (!Array.isArray(faixasFalha) || faixasFalha.length === 0) {
    return false;
  }

  return faixasFalha.some((faixa) => {
    if (!faixa || faixa.alinhamentoTipo !== alinhamentoTipo) {
      return false;
    }

    const inicio = clamp(faixa.linhaInicial, 1, 136);
    const fim = clamp(faixa.linhaFinal, 1, 136);
    if (fim < inicio) {
      return false;
    }

    return linhaInicial <= fim && linhaFinal >= inicio;
  });
};

const selecionarItensDistribuidos = <T>(
  itensOrdenados: T[],
  totalSelecionado: number,
) => {
  if (!itensOrdenados.length || totalSelecionado <= 0) return [] as T[];

  if (totalSelecionado >= itensOrdenados.length) {
    return [...itensOrdenados];
  }

  if (totalSelecionado === 1) {
    return [itensOrdenados[0]];
  }

  const ultimoIndice = itensOrdenados.length - 1;
  const indicesSelecionados = Array.from(
    { length: totalSelecionado },
    (_, index) => Math.round((index * ultimoIndice) / (totalSelecionado - 1)),
  );

  const vistos = new Set<number>();
  const selecionados = indicesSelecionados.reduce<T[]>((acc, indice) => {
    if (vistos.has(indice)) return acc;
    vistos.add(indice);
    acc.push(itensOrdenados[indice]);
    return acc;
  }, []);

  if (selecionados.length >= totalSelecionado) {
    return selecionados;
  }

  for (let index = 0; index < itensOrdenados.length; index += 1) {
    if (vistos.has(index)) continue;
    vistos.add(index);
    selecionados.push(itensOrdenados[index]);
    if (selecionados.length >= totalSelecionado) {
      break;
    }
  }

  return selecionados;
};

const agruparLinhasContiguas = (linhasValidas: number[]) => {
  const segmentos: number[][] = [];

  linhasValidas.forEach((linha) => {
    const ultimoSegmento = segmentos[segmentos.length - 1];
    const ultimaLinha = ultimoSegmento?.[ultimoSegmento.length - 1];

    if (!ultimoSegmento || ultimaLinha == null || linha - ultimaLinha > 2) {
      segmentos.push([linha]);
      return;
    }

    ultimoSegmento.push(linha);
  });

  return segmentos;
};

const distribuirLinhasValidas = (
  linhasValidas: number[],
  totalRuas: number,
  sentidoRuas: SentidoRuas,
) => {
  if (!linhasValidas.length || totalRuas <= 0) return [] as Array<[number, number]>;

  const linhasOrdenadas =
    sentidoRuas === 'fim' ? [...linhasValidas].reverse() : linhasValidas;

  if (totalRuas >= linhasValidas.length) {
    return linhasOrdenadas.map(
      (inicio) => [inicio, inicio + 1] as [number, number],
    );
  }

  const segmentos = agruparLinhasContiguas(linhasValidas);

  if (segmentos.length <= 1) {
    return selecionarItensDistribuidos(linhasOrdenadas, totalRuas).map(
      (inicio) => [inicio, inicio + 1] as [number, number],
    );
  }

  const linhasPrioritariasAsc = segmentos.reduce<number[]>(
    (acc, segmento, index) => {
      if (!segmento.length) return acc;

      if (index > 0) {
        acc.push(segmento[0]);
      }

      if (index < segmentos.length - 1) {
        acc.push(segmento[segmento.length - 1]);
      }

      return acc;
    },
    [],
  );

  const linhasPrioritarias = Array.from(new Set(linhasPrioritariasAsc));
  const linhasPrioritariasOrdenadas =
    sentidoRuas === 'fim'
      ? [...linhasPrioritarias].sort((a, b) => b - a)
      : [...linhasPrioritarias].sort((a, b) => a - b);

  const linhasSelecionadasPrioritarias = selecionarItensDistribuidos(
    linhasPrioritariasOrdenadas,
    Math.min(totalRuas, linhasPrioritariasOrdenadas.length),
  );

  if (linhasSelecionadasPrioritarias.length >= totalRuas) {
    return linhasSelecionadasPrioritarias.map(
      (inicio) => [inicio, inicio + 1] as [number, number],
    );
  }

  const linhasSelecionadasSet = new Set(linhasSelecionadasPrioritarias);
  const linhasRestantes = linhasOrdenadas.filter(
    (linha) => !linhasSelecionadasSet.has(linha),
  );
  const linhasComplementares = selecionarItensDistribuidos(
    linhasRestantes,
    totalRuas - linhasSelecionadasPrioritarias.length,
  );
  const linhasFinaisSet = new Set([
    ...linhasSelecionadasPrioritarias,
    ...linhasComplementares,
  ]);

  return linhasOrdenadas
    .filter((linha) => linhasFinaisSet.has(linha))
    .map((inicio) => [inicio, inicio + 1] as [number, number]);
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
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  linhaInicio: number;
  linhaFim: number;
  faixasFalha?: FaixaFalhaParcela[] | null;
  sentidoRuas?: SentidoRuas;
}) => {
  const inicio = Number(linhaInicio) || 1;
  const fim = Number(linhaFim) || 136;
  const linhasValidas: number[] = [];

  for (let linha = inicio; linha <= fim - 1; linha += 1) {
    const usaLinha =
      alinhamentoTipo === 'inferior-impar' ? linha % 2 !== 0 : linha % 2 === 0;
    if (usaLinha) {
      if (linhaEstaEmFalha(linha, linha + 1, alinhamentoTipo, faixasFalha)) {
        continue;
      }
      linhasValidas.push(linha);
    }
  }

  return distribuirLinhasValidas(linhasValidas, totalRuas, sentidoRuas).filter(
    ([linhaInicial, linhaFinal]) => linhaInicial < linhaFinal && linhaFinal <= fim,
  );
};

export const gerarRuasDistribuidasPorFaixas = ({
  alinhamentoTipo,
  sentidoRuas = 'inicio',
  faixas,
}: {
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  sentidoRuas?: SentidoRuas;
  faixas: Array<{
    id: string;
    label: string;
    linhaInicio?: number | null;
    linhaFim?: number | null;
    fallbackInicio?: number;
    fallbackFim?: number;
    totalRuas: number;
    alinhamentoTipo?: 'inferior-impar' | 'inferior-par';
    faixasFalha?: FaixaFalhaParcela[] | null;
    equipeId: string | null;
    equipeNome: string;
  }>;
}) => {
  return faixas
    .map((faixa) => {
      const normalizada = normalizarFaixaLinhas(
        faixa.linhaInicio,
        faixa.linhaFim,
        faixa.fallbackInicio,
        faixa.fallbackFim,
      );

      if (normalizada.fim <= normalizada.inicio) {
        return null;
      }

        return {
          ...faixa,
          inicio: normalizada.inicio,
          fim: normalizada.fim,
          ruas: gerarRuasComOffset({
            totalRuas: Number(faixa.totalRuas) || 0,
            alinhamentoTipo: faixa.alinhamentoTipo || alinhamentoTipo,
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
