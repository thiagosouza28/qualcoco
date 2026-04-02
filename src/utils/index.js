import { clsx } from 'clsx';
import moment from 'moment';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

export const createPageUrl = (pageName = '') => `/${pageName}`;

export const STORAGE_KEYS = {
  responsavel: 'responsavel_nome',
  jornadaId: 'jornada_id',
  jornadaData: 'jornada_data',
};

export const getResponsavelNome = () =>
  window.localStorage.getItem(STORAGE_KEYS.responsavel) || '';

export const getJornadaId = () =>
  window.localStorage.getItem(STORAGE_KEYS.jornadaId) || '';

export const getJornadaData = () =>
  window.localStorage.getItem(STORAGE_KEYS.jornadaData) || '';

export const setResponsavelNome = (value) =>
  window.localStorage.setItem(STORAGE_KEYS.responsavel, value);

export const clearJornada = () => {
  window.localStorage.removeItem(STORAGE_KEYS.jornadaId);
  window.localStorage.removeItem(STORAGE_KEYS.jornadaData);
};

export const generateJornadaId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export const getDataBrasil = (date = new Date()) => {
  const offset = -3 * 60;
  const localBR = new Date(
    date.getTime() + (offset - date.getTimezoneOffset()) * 60000,
  );
  return localBR.toISOString().split('T')[0];
};

export const getDiaSemanaBrasil = (date = new Date()) => {
  const offset = -3 * 60;
  const localBR = new Date(
    date.getTime() + (offset - date.getTimezoneOffset()) * 60000,
  );
  return moment(localBR).format('dddd');
};

export const formatDateLong = (date) =>
  date ? moment(date).format('DD [de] MMMM [de] YYYY') : '-';

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const getParcelaBase = (value = '') =>
  String(value).replace(/\s+\(Alinh\.\s*[^)]+\)$/i, '');

export const parseResponsaveis = (value = '') =>
  String(value)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

export const formatResponsaveis = (items = []) =>
  Array.from(
    new Set(items.map((item) => String(item || '').trim()).filter(Boolean)),
  ).join(' | ');

export const generateParcelas = () => {
  const parcelas = [];
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letra of letras) {
    for (let dezena = 10; dezena <= 18; dezena += 1) {
      for (let unidade = 1; unidade <= 4; unidade += 1) {
        parcelas.push(`${letra}-${dezena}${unidade}`);
      }
    }
  }
  return parcelas;
};

export const distribuirRuas = (
  totalRuas,
  totalLinhas = 136,
  paridade = 'impar',
) => {
  if (totalRuas <= 0) return [];
  const linhasValidas = [];
  for (let i = 1; i <= totalLinhas - 1; i += 1) {
    const isImpar = i % 2 !== 0;
    if (
      (paridade === 'impar' && isImpar) ||
      (paridade === 'par' && !isImpar)
    ) {
      linhasValidas.push(i);
    }
  }
  if (linhasValidas.length === 0) return [];

  if (totalRuas >= linhasValidas.length) {
    return linhasValidas.map((inicio) => [inicio, inicio + 1]);
  }

  if (totalRuas === 1) {
    return [[linhasValidas[0], linhasValidas[0] + 1]];
  }

  // Espalha as ruas pela faixa inteira, sempre incluindo a primeira e a ultima.
  // Os saltos entre ruas podem variar para encaixar exatamente no fim da faixa.
  const ultimoIndice = linhasValidas.length - 1;
  const indicesSelecionados = Array.from({ length: totalRuas }, (_, index) =>
    Math.round((index * ultimoIndice) / (totalRuas - 1)),
  );

  return indicesSelecionados.map((indice) => {
    const inicio = linhasValidas[indice];
    return [inicio, inicio + 1];
  });
};

const distribuirLinhasValidas = (linhasValidas, totalRuas) => {
  if (!linhasValidas.length || totalRuas <= 0) return [];

  if (totalRuas >= linhasValidas.length) {
    return linhasValidas.map((inicio) => [inicio, inicio + 1]);
  }

  if (totalRuas === 1) {
    return [[linhasValidas[0], linhasValidas[0] + 1]];
  }

  const ultimoIndice = linhasValidas.length - 1;
  const indicesSelecionados = Array.from({ length: totalRuas }, (_, index) =>
    Math.round((index * ultimoIndice) / (totalRuas - 1)),
  );

  return indicesSelecionados.map((indice) => {
    const inicio = linhasValidas[indice];
    return [inicio, inicio + 1];
  });
};

export const gerarRuasComOffset = ({
  totalRuas,
  paridade,
  linhaInicio,
  linhaFim,
}) => {
  const inicio = Number(linhaInicio) || 1;
  const fim = Number(linhaFim) || 136;
  const linhasValidas = [];

  for (let linha = inicio; linha <= fim - 1; linha += 1) {
    const isImpar = linha % 2 !== 0;
    if (
      (paridade === 'impar' && isImpar) ||
      (paridade === 'par' && !isImpar)
    ) {
      linhasValidas.push(linha);
    }
  }

  return distribuirLinhasValidas(linhasValidas, totalRuas).filter(
    ([linhaInicial, linhaFinal]) => linhaInicial < linhaFinal && linhaFinal <= fim,
  );
};

export const normalizarFaixaLinhas = (
  linhaInicio,
  linhaFim,
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

export const gerarRuasDistribuidasPorFaixas = ({
  totalRuas,
  paridade,
  faixas,
}) => {
  const faixasValidas = (faixas || [])
    .map((faixa) => {
      const normalizada = normalizarFaixaLinhas(
        faixa.linhaInicio,
        faixa.linhaFim,
        faixa.fallbackInicio,
        faixa.fallbackFim,
      );

      if (normalizada.fim <= normalizada.inicio) return null;

      return {
        ...faixa,
        ...normalizada,
        totalLinhas: normalizada.fim - normalizada.inicio + 1,
      };
    })
    .filter(Boolean);

  if (faixasValidas.length === 0 || totalRuas <= 0) return [];

  const usaQuantidadePorFaixa = faixasValidas.some(
    (faixa) => Number(faixa.totalRuas) > 0,
  );

  if (usaQuantidadePorFaixa) {
    return faixasValidas
      .map((faixa) => ({
        ...faixa,
        ruas: gerarRuasComOffset({
          totalRuas: Number(faixa.totalRuas) || 0,
          paridade,
          linhaInicio: faixa.inicio,
          linhaFim: faixa.fim,
        }),
      }))
      .filter((faixa) => faixa.ruas.length > 0);
  }

  const totalLinhas = faixasValidas.reduce(
    (sum, faixa) => sum + faixa.totalLinhas,
    0,
  );

  const ruasPorFaixa =
    faixasValidas.length === 1
      ? [totalRuas]
      : (() => {
          const primeiraFaixa = faixasValidas[0];
          const ruasPrimeira = clamp(
            Math.round((totalRuas * primeiraFaixa.totalLinhas) / totalLinhas),
            1,
            totalRuas - 1,
          );
          return [ruasPrimeira, totalRuas - ruasPrimeira];
        })();

  return faixasValidas
    .map((faixa, index) => ({
      ...faixa,
      ruas: gerarRuasComOffset({
        totalRuas: ruasPorFaixa[index],
        paridade,
        linhaInicio: faixa.inicio,
        linhaFim: faixa.fim,
      }),
    }))
    .filter((faixa) => faixa.ruas.length > 0);
};

export const parseRuasProgramadas = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

export const serializarObs = (obs = []) =>
  obs.map((item) => {
    if (typeof item === 'string') return item;
    let str = item.tipo;
    if (item.linha) str += ` (linha ${item.linha})`;
    if (item.planta) str += ` (planta ${item.planta})`;
    return str;
  });

export const desserializarObs = (obs = []) =>
  obs.map((item) => {
    if (typeof item !== 'string') return item;
    return item;
  });

export const formatEquipeNome = (equipe, linhaInicio, linhaFim) => {
  if (!equipe) return '';
  if (linhaInicio && linhaFim) {
    return `${equipe.nome} (L${linhaInicio}-${linhaFim})`;
  }
  return equipe.nome;
};

export const resolveSearchParam = (search, key) => {
  const params = new URLSearchParams(search);
  return params.get(key);
};

export const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));

export const groupBy = (items, getKey) =>
  items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

export const getStatusLabel = (status) => {
  if (status === 'ok') return 'OK';
  if (status === 'refazer') return 'RETOQUE';
  return 'Em Andamento';
};
