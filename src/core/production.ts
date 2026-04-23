import { mergeConfiguracaoComPadrao } from '@/core/appConfig';
import type { Configuracao } from '@/core/types';

export type FeedbackFaixa = 'low' | 'medium' | 'high';

export type ProducaoCalculada = {
  cargas: number;
  bags: number;
  cocosEstimados: number;
  cocosPorBag: number;
  cargasPorBag: number;
};

const normalizarQuantidade = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

export const calcularProducaoPorCargas = (
  cargasInput: unknown,
  config?: Configuracao | null,
): ProducaoCalculada => {
  const configAtual = mergeConfiguracaoComPadrao(config);
  const cargas = normalizarQuantidade(cargasInput);
  const cargasPorBag = Math.max(1, normalizarQuantidade(configAtual.cargasPorBag));
  const cocosPorBag = normalizarQuantidade(configAtual.cocosPorBag);
  const bags = cargas / cargasPorBag;

  return {
    cargas,
    bags,
    cocosEstimados: bags * cocosPorBag,
    cocosPorBag,
    cargasPorBag,
  };
};

export const formatarProducaoNumero = (
  value: unknown,
  maximumFractionDigits = 2,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';

  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 1,
    maximumFractionDigits,
  });
};

export const calcularFaixaFeedback = (
  value: unknown,
  limite: unknown,
): FeedbackFaixa | null => {
  const parsedValue = normalizarQuantidade(value);
  const parsedLimit = normalizarQuantidade(limite);

  if (parsedLimit <= 0) {
    return null;
  }

  const percentual = (parsedValue / parsedLimit) * 100;
  if (parsedValue >= parsedLimit) return 'high';
  if (percentual <= 50) return 'low';
  return 'medium';
};

export const calcularProgressoFeedback = (
  value: unknown,
  limite: unknown,
) => {
  const parsedLimit = normalizarQuantidade(limite);
  if (parsedLimit <= 0) {
    return null;
  }

  const parsedValue = normalizarQuantidade(value);
  return Math.max(0, Math.min(parsedValue / parsedLimit, 1));
};
