import {
  distribuirRuasEntreParcelas,
  gerarRuasDaParcela,
  gerarRuasDistribuidasPorFaixas,
} from '@/core/plots';
import type {
  FaixaFalhaParcela,
  ParcelaConfigurada,
  PlanejamentoEquipeInput,
  SentidoRuas,
} from '@/core/types';

export interface FaixaEquipePreview {
  id: string;
  label: string;
  equipeId: string | null;
  equipeNome: string;
  inicio: number;
  fim: number;
  ruas: Array<[number, number]>;
}

export interface RuaPlanejada {
  ruaNumero: number;
  linhaInicial: number;
  linhaFinal: number;
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  equipeId: string | null;
  equipeNome: string;
}

export interface ParcelaPlanejadaPreview {
  parcelaId: string;
  parcelaCodigo: string;
  label: string;
  linhaInicial: number;
  linhaFinal: number;
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  sentidoRuas: SentidoRuas;
  faixasFalha: FaixaFalhaParcela[];
  previewRuasPorEquipe: FaixaEquipePreview[];
  ruasProgramadas: RuaPlanejada[];
}

export const planejarParcelasAvaliacao = ({
  parcelas,
  planejamentoEquipes,
  alinhamentoTipo,
  sentidoRuas = 'inicio',
}: {
  parcelas: ParcelaConfigurada[];
  planejamentoEquipes: PlanejamentoEquipeInput[];
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  sentidoRuas?: SentidoRuas;
}) => {
  const totalParcelas = parcelas.length;
  if (totalParcelas === 0) return [] as ParcelaPlanejadaPreview[];

  if (planejamentoEquipes.length === 0) {
    return parcelas.map((parcela) => {
      const alinhamentoParcela = parcela.alinhamentoTipo || alinhamentoTipo;
      const sentidoParcela = parcela.sentidoRuas || sentidoRuas;

      return {
        parcelaId: parcela.parcelaId,
        parcelaCodigo: parcela.parcelaCodigo,
        label: parcela.parcelaCodigo,
        linhaInicial: parcela.linhaInicial,
        linhaFinal: parcela.linhaFinal,
        alinhamentoTipo: alinhamentoParcela,
        sentidoRuas: sentidoParcela,
        faixasFalha: parcela.faixasFalha || [],
        previewRuasPorEquipe: [],
        ruasProgramadas: gerarRuasDaParcela({
          linhaInicial: parcela.linhaInicial,
          linhaFinal: parcela.linhaFinal,
          alinhamentoTipo: alinhamentoParcela,
          faixasFalha: parcela.faixasFalha,
          sentidoRuas: sentidoParcela,
        }).map((rua) => ({
          ...rua,
          alinhamentoTipo: alinhamentoParcela,
          equipeId: null,
          equipeNome: '',
        })),
      };
    });
  }

  const distribuicaoPorEquipe = new Map(
    planejamentoEquipes.map((equipe) => [
      equipe.equipeId,
      distribuirRuasEntreParcelas(equipe.totalRuas, totalParcelas),
    ]),
  );

  return parcelas.map((parcela, parcelaIndex) => {
    const alinhamentoParcela = parcela.alinhamentoTipo || alinhamentoTipo;
    const sentidoParcela = parcela.sentidoRuas || sentidoRuas;
    const faixas = planejamentoEquipes
      .map((equipe) => {
        const totalRuasConfigurado =
          equipe.ruasPorParcela &&
          Object.prototype.hasOwnProperty.call(
            equipe.ruasPorParcela,
            parcela.parcelaId,
          )
            ? Number(equipe.ruasPorParcela[parcela.parcelaId] || 0)
            : null;
        const totalRuasEquipe =
          totalRuasConfigurado != null
            ? Math.max(0, totalRuasConfigurado)
            : distribuicaoPorEquipe.get(equipe.equipeId)?.[parcelaIndex] || 0;
        if (totalRuasEquipe <= 0) return null;

        const linhaInicio =
          equipe.linhaInicio != null
            ? Math.max(parcela.linhaInicial, equipe.linhaInicio)
            : parcela.linhaInicial;
        const linhaFim =
          equipe.linhaFim != null
            ? Math.min(parcela.linhaFinal, equipe.linhaFim)
            : parcela.linhaFinal;

        return {
          id: `${parcela.parcelaId}-${equipe.equipeId}`,
          label: equipe.equipeNome,
          equipeId: equipe.equipeId,
          equipeNome: equipe.equipeNome,
          linhaInicio,
          linhaFim,
          fallbackInicio: parcela.linhaInicial,
          fallbackFim: parcela.linhaFinal,
          totalRuas: totalRuasEquipe,
          alinhamentoTipo: alinhamentoParcela,
          faixasFalha: parcela.faixasFalha,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      label: string;
      equipeId: string | null;
      equipeNome: string;
      linhaInicio: number;
      linhaFim: number;
      fallbackInicio: number;
      fallbackFim: number;
      totalRuas: number;
      alinhamentoTipo: 'inferior-impar' | 'inferior-par';
      faixasFalha?: FaixaFalhaParcela[] | null;
    }>;

    const previewRuasPorEquipe = gerarRuasDistribuidasPorFaixas({
      alinhamentoTipo: alinhamentoParcela,
      sentidoRuas: sentidoParcela,
      faixas,
    });

    const ruasProgramadas = previewRuasPorEquipe
      .flatMap((faixa) =>
        faixa.ruas.map(([linhaInicial, linhaFinal]) => ({
          linhaInicial,
          linhaFinal,
          alinhamentoTipo: alinhamentoParcela,
          equipeId: faixa.equipeId,
          equipeNome: faixa.equipeNome,
        })),
      )
      .sort((a, b) =>
        sentidoParcela === 'fim'
          ? b.linhaInicial - a.linhaInicial || b.linhaFinal - a.linhaFinal
          : a.linhaInicial - b.linhaInicial || a.linhaFinal - b.linhaFinal,
      )
      .map((rua, index) => ({
        ...rua,
        ruaNumero: index + 1,
      }));

    return {
      parcelaId: parcela.parcelaId,
      parcelaCodigo: parcela.parcelaCodigo,
      label: parcela.parcelaCodigo,
      linhaInicial: parcela.linhaInicial,
      linhaFinal: parcela.linhaFinal,
      alinhamentoTipo: alinhamentoParcela,
      sentidoRuas: sentidoParcela,
      faixasFalha: parcela.faixasFalha || [],
      previewRuasPorEquipe,
      ruasProgramadas,
    };
  });
};
