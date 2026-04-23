import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, FileText, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Share } from '@capacitor/share';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { repository } from '@/core/repositories';
import { useCampoApp } from '@/core/AppProvider';
import { listarIdsAvaliacoesAcessiveis } from '@/core/evaluations';
import type { AvaliacaoRetoque, Producao, SiglaResumoParcela } from '@/core/types';
import { canViewReports, normalizePapelAvaliacao } from '@/core/permissions';
import { useRolePermissions } from '@/core/useRolePermissions';
import {
  limparMarcacoesLegadasColeta,
  obterApresentacaoEstadoColetaRua,
} from '@/core/registroRua';
import { createRelatorioPdfBlob } from '@/lib/relatorioPdf';
import {
  formatDateLabel,
  formatDateTimeLabel,
  normalizeDateKey,
  todayIso,
} from '@/core/date';
import { mergeConfiguracaoComPadrao } from '@/core/appConfig';
import {
  calcularProducaoPorCargas,
  formatarProducaoNumero,
} from '@/core/production';

const ROWS_PER_PAGE = 40;
const DEFAULT_TEAM_SPACER_ROWS = 3;
const MAX_TEAM_SPACER_ROWS = 8;
const TEAM_HISTORY_DAYS = 7;
const TEAM_HISTORY_ENTRIES = 4;
const REFERENTE_LABEL = `Referente${String.fromCharCode(160)}a`;

type PeriodoRelatorioAvancado =
  | 'semanal'
  | 'mensal'
  | 'trimestral'
  | 'semestral'
  | 'anual';

const PERIODOS_RELATORIO: Array<{
  value: PeriodoRelatorioAvancado;
  label: string;
}> = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];
const MEDALHAS_RANKING = ['🥇', '🥈', '🥉'];

const formatDateKeyRelatorio = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const getPeriodoRelatorioRange = (
  anchor: string,
  periodo: PeriodoRelatorioAvancado,
) => {
  const normalizedAnchor = normalizeDateKey(anchor) || todayIso();
  const base = new Date(`${normalizedAnchor}T12:00:00`);
  const start = new Date(base);

  if (Number.isNaN(base.getTime())) {
    return { start: todayIso(), end: todayIso() };
  }

  if (periodo === 'semanal') {
    start.setDate(base.getDate() - 6);
  } else if (periodo === 'mensal') {
    start.setDate(1);
  } else if (periodo === 'trimestral') {
    start.setMonth(Math.floor(base.getMonth() / 3) * 3, 1);
  } else if (periodo === 'semestral') {
    start.setMonth(base.getMonth() < 6 ? 0 : 6, 1);
  } else {
    start.setMonth(0, 1);
  }

  return {
    start: formatDateKeyRelatorio(start),
    end: formatDateKeyRelatorio(base),
  };
};

const dataDentroPeriodoRelatorio = (
  value: string | null | undefined,
  range: { start: string; end: string },
) => {
  const normalized = normalizeDateKey(value);
  return Boolean(normalized && normalized >= range.start && normalized <= range.end);
};

const padRelatorioNumero = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '--';
  return String(Math.trunc(parsed)).padStart(2, '0');
};

const formatQuantidadeRelatorio = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '-';
  return String(Math.trunc(parsed)).padStart(2, '0');
};

const formatEquipeRelatorio = (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '--';
  return /^\d+$/.test(normalized) ? normalized.padStart(2, '0') : normalized;
};

const isSiglaResumoParcela = (value: unknown): value is SiglaResumoParcela =>
  value === 'A.C.R' ||
  value === 'A.N.C.R' ||
  value === 'A.C.N.R' ||
  value === 'A.N.C.N.R';

const normalizarSiglasResumoParcela = (
  raw: unknown,
): Partial<Record<string, SiglaResumoParcela>> => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.entries(raw as Record<string, unknown>).reduce<
    Partial<Record<string, SiglaResumoParcela>>
  >((acc, [equipe, sigla]) => {
    if (!isSiglaResumoParcela(sigla)) {
      return acc;
    }

    acc[formatEquipeRelatorio(equipe)] = sigla;
    return acc;
  }, {});
};

const formatStatusRelatorio = (value: string | null | undefined) => {
  if (value === 'ok' || value === 'completed') return 'OK';
  if (value === 'revisado') return 'Revisado';
  if (value === 'em_retoque') return 'Em retoque';
  if (value === 'refazer') return 'Retoque';
  return 'Em andamento';
};

const mergeStatusRelatorio = (
  current: string | null | undefined,
  next: string | null | undefined,
) => {
  if (current === 'refazer' || next === 'refazer') return 'refazer';
  if (current === 'em_retoque' || next === 'em_retoque') return 'em_retoque';
  if (current === 'in_progress' || next === 'in_progress') return 'in_progress';
  if (current === 'revisado' || next === 'revisado') return 'revisado';
  return 'ok';
};

const formatResumoContagem = (value: number, singular: string, plural: string) =>
  `${value} ${value === 1 ? singular : plural}`;

const buildDateWindowRelatorio = (anchor: string, total: number) => {
  const normalizedAnchor = normalizeDateKey(anchor) || todayIso();
  const baseDate = new Date(`${normalizedAnchor}T12:00:00`);

  if (Number.isNaN(baseDate.getTime())) {
    return [];
  }

  return Array.from({ length: total }, (_, index) => {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() - (total - index - 1));
    return formatDateKeyRelatorio(nextDate);
  });
};

const formatDiaCurtoRelatorio = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
  }).format(date);
};

const getHistoricoEquipeStatusMeta = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'refazer' || normalized === 'em_retoque') {
    return {
      label: 'Retoque',
      dotClassName: 'bg-[var(--qc-danger)]',
      surfaceClassName:
        'border-[rgba(197,58,53,0.22)] bg-[rgba(197,58,53,0.08)] text-[var(--qc-danger)]',
    };
  }

  if (
    normalized === 'ok' ||
    normalized === 'revisado' ||
    normalized === 'completed'
  ) {
    return {
      label: 'Positivo',
      dotClassName: 'bg-[#1f61a4]',
      surfaceClassName:
        'border-[rgba(31,97,164,0.22)] bg-[rgba(31,97,164,0.08)] text-[#1f61a4]',
    };
  }

  if (normalized === 'draft' || normalized === 'in_progress') {
    return {
      label: 'Andamento',
      dotClassName: 'bg-[#dd7c29]',
      surfaceClassName:
        'border-[rgba(221,124,41,0.22)] bg-[rgba(221,124,41,0.08)] text-[#b45c13]',
    };
  }

  return {
    label: 'Sem registro',
    dotClassName: 'bg-[rgba(93,98,78,0.3)]',
    surfaceClassName:
      'border-[var(--qc-border)] bg-[var(--qc-surface-muted)] text-[var(--qc-text-muted)]',
  };
};

const formatRuaRelatorio = (
  linhaInicial: number | string | null | undefined,
  linhaFinal: number | string | null | undefined,
  separator = ' -> ',
) => `${padRelatorioNumero(linhaInicial)}${separator}${padRelatorioNumero(linhaFinal)}`;

const getEquipeSortValue = (value: string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const getDiaSemanaRelatorio = (value?: string | null) => {
  if (!value) return '';

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diaSemana = date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
};

const montarReferenteRelatorio = (dataColheita: string | null | undefined) => {
  const diaSemana = getDiaSemanaRelatorio(dataColheita);
  return [REFERENTE_LABEL, diaSemana || '-'].join('\n');
};

const montarObservacaoRelatorio = (observacoes: string | null | undefined) =>
  limparMarcacoesLegadasColeta(observacoes).trim();

const excedeuLimiteRelatorio = (
  value: number | string | null | undefined,
  limite: number,
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > limite;
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error('Falha ao converter PDF para base64.'));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Conversão de PDF inválida.'));
        return;
      }

      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });

const openPdfInBrowser = (blob: Blob, fileName: string) => {
  const blobUrl = URL.createObjectURL(blob);
  const popup = window.open(blobUrl, '_blank');

  if (!popup) {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};

const RELATORIO_NATIVE_DIRECTORY = Directory.Cache;

const saveAndOpenPdfOnDevice = async (blob: Blob, fileName: string) => {
  const path = `Relatorios/${fileName}`;
  const data = await blobToBase64(blob);

  await Filesystem.writeFile({
    path,
    data,
    // Usa armazenamento interno do app para evitar EACCES em Documents.
    directory: RELATORIO_NATIVE_DIRECTORY,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    path,
    directory: RELATORIO_NATIVE_DIRECTORY,
  });

  try {
    await FileOpener.open({
      filePath: uri,
      contentType: 'application/pdf',
      openWithDefault: false,
    });
    return;
  } catch (error) {
    const { value } = await Share.canShare();
    if (!value) {
      throw error;
    }

    await Share.share({
      title: 'Relatório QualCoco',
      text: 'PDF diário de controle de qualidade',
      files: [uri],
      dialogTitle: 'Abrir ou compartilhar PDF',
    });
  }
};

type RelatorioPdfRow = {
  id: string;
  data: string;
  dataColheita: string;
  parcela: string;
  parcelaCompleta?: boolean;
  siglaResumoParcela?: SiglaResumoParcela | '';
  equipe: string;
  equipeKey: string;
  equipeSort: number;
  linhaInicial: number;
  linhaFinal: number;
  rua: string;
  cachoPl: string;
  cocosDeixados: string;
  observacao: string;
  referente: string;
  responsaveisLista: string[];
  excedeuCacho: boolean;
  excedeuCocos: boolean;
};

type RelatorioPdfGroup = {
  key: string;
  parcela: string;
  equipe: string;
  equipeSort: number;
  dataColheita: string;
  responsaveis: string[];
  referentes: string[];
  rows: RelatorioPdfRow[];
};

type GrupoHistoricoEquipe = {
  id: string;
  equipe: string;
  equipeSort: number;
  data: string;
  status: string;
  responsaveis: string[];
  parcelas: string[];
};

type RelatorioEquipeAvancado = {
  equipe: string;
  equipeSort: number;
  totalCargas: number;
  totalBags: number;
  totalCocos: number;
  mediaCocosPorBag: number;
  indiceCocosChao: number;
  indiceCachos: number;
  registros: number;
};

const BarraProducaoEquipes = ({
  data,
}: {
  data: RelatorioEquipeAvancado[];
}) => {
  const max = Math.max(1, ...data.map((item) => item.totalBags));

  return (
    <div className="stack-sm">
      {data.slice(0, 8).map((item) => (
        <div key={item.equipe} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2">
          <span className="text-xs font-black text-[var(--qc-text)]">
            Eq. {item.equipe}
          </span>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--qc-surface-muted)]">
            <div
              className="h-full rounded-full bg-[#1f61a4] transition-all duration-500"
              style={{ width: `${Math.max(3, (item.totalBags / max) * 100)}%` }}
            />
          </div>
          <span className="text-right text-xs font-bold tabular-nums text-[var(--qc-secondary)]">
            {formatarProducaoNumero(item.totalBags)}
          </span>
        </div>
      ))}
    </div>
  );
};

const LinhaEvolucaoBags = ({
  pontos,
}: {
  pontos: Array<{ data: string; bags: number }>;
}) => {
  const max = Math.max(1, ...pontos.map((item) => item.bags));
  const width = 320;
  const height = 120;
  const points = pontos
    .map((item, index) => {
      const x =
        pontos.length <= 1 ? width / 2 : (index / (pontos.length - 1)) * width;
      const y = height - (item.bags / max) * (height - 18) - 9;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--qc-border)] bg-white p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full">
        <polyline
          points={points}
          fill="none"
          stroke="#006b44"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pontos.map((item, index) => {
          const x =
            pontos.length <= 1 ? width / 2 : (index / (pontos.length - 1)) * width;
          const y = height - (item.bags / max) * (height - 18) - 9;
          return (
            <circle key={`${item.data}-${index}`} cx={x} cy={y} r="4" fill="#1f61a4" />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-[10px] font-bold text-[var(--qc-text-muted)]">
        <span>{pontos[0]?.data ? formatDateLabel(pontos[0].data) : '-'}</span>
        <span>
          {pontos[pontos.length - 1]?.data
            ? formatDateLabel(pontos[pontos.length - 1].data)
            : '-'}
        </span>
      </div>
    </div>
  );
};

const GraficoEficienciaCocosChao = ({
  data,
}: {
  data: RelatorioEquipeAvancado[];
}) => {
  const sorted = data
    .slice()
    .sort((a, b) => {
      if (a.indiceCocosChao !== b.indiceCocosChao) {
        return a.indiceCocosChao - b.indiceCocosChao;
      }
      return b.totalBags - a.totalBags;
    })
    .slice(0, 8);
  const max = Math.max(1, ...sorted.map((item) => item.indiceCocosChao));

  return (
    <div className="stack-sm">
      {sorted.map((item, index) => {
        const ratio = item.indiceCocosChao / max;
        const color =
          index === 0
            ? '#006b44'
            : ratio <= 0.5
              ? '#1f61a4'
              : ratio <= 0.8
                ? '#9a7a12'
                : '#c53a35';

        return (
          <div
            key={item.equipe}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.75rem] items-center gap-2"
          >
            <span className="text-xs font-black text-[var(--qc-text)]">
              Eq. {item.equipe}
            </span>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--qc-surface-muted)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(3, ratio * 100)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <span className="text-right text-xs font-bold tabular-nums text-[var(--qc-secondary)]">
              {formatarProducaoNumero(item.indiceCocosChao)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const paginateGroupedRows = (
  groups: RelatorioPdfGroup[],
  rowsPerPage: number,
  spacerRows: number,
) => {
  if (!groups.length) {
    return [{ entries: [], blankRows: rowsPerPage }];
  }

  const pages: Array<{
    entries: Array<
      | { type: 'spacer'; key: string; count: number }
      | {
          type: 'segment';
          key: string;
          responsaveis: string[];
          rows: RelatorioPdfRow[];
        }
    >;
    blankRows: number;
  }> = [];
  let currentEntries: Array<
    | { type: 'spacer'; key: string; count: number }
    | {
        type: 'segment';
        key: string;
        responsaveis: string[];
        rows: RelatorioPdfRow[];
      }
  > = [];
  let remainingRows = rowsPerPage;

  const pushPage = () => {
    pages.push({
      entries: currentEntries,
      blankRows: remainingRows,
    });
    currentEntries = [];
    remainingRows = rowsPerPage;
  };

  groups.forEach((group) => {
    const groupFitsSinglePage = group.rows.length <= rowsPerPage;
    let start = 0;

    while (start < group.rows.length) {
      const isFirstSegment = start === 0;

      if (isFirstSegment && groupFitsSinglePage) {
        const requiredRows =
          group.rows.length +
          (currentEntries.length > 0 ? spacerRows : 0);
        if (currentEntries.length > 0 && requiredRows > remainingRows) {
          pushPage();
        }
      }

      if (isFirstSegment && currentEntries.length > 0 && spacerRows > 0) {
        if (remainingRows <= spacerRows) {
          pushPage();
        }

        if (currentEntries.length > 0) {
          currentEntries.push({
            type: 'spacer',
            key: `spacer-${group.key}-${pages.length}-${start}`,
            count: spacerRows,
          });
          remainingRows -= spacerRows;
        }
      }

      if (remainingRows === 0) {
        pushPage();
      }

      const take = Math.min(group.rows.length - start, remainingRows);
      currentEntries.push({
        type: 'segment',
        key: `${group.key}-${start}`,
        responsaveis: group.responsaveis,
        rows: group.rows.slice(start, start + take),
      });
      start += take;
      remainingRows -= take;
    }
  });

  if (currentEntries.length > 0 || pages.length === 0) {
    pushPage();
  }

  return pages;
};

export function TelaRelatorio() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { dataFiltro?: string } | null;
  const { usuarioAtual } = useCampoApp();
  const { config, permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);
  const [dataFiltro, setDataFiltro] = useState(todayIso());
  const [periodoAvancado, setPeriodoAvancado] =
    useState<PeriodoRelatorioAvancado>('semanal');
  const [gerando, setGerando] = useState(false);
  const [espacoEntreEquipes, setEspacoEntreEquipes] = useState(
    DEFAULT_TEAM_SPACER_ROWS,
  );

  const { data: avaliacoesHistorico = [] } = useQuery({
    queryKey: ['relatorio', 'avaliacoes', usuarioAtual?.id],
    queryFn: async () => {
      if (!usuarioAtual?.id) {
        return [];
      }

      const [all, avaliacaoIdsAcessiveis] = await Promise.all([
        repository.list('avaliacoes'),
        listarIdsAvaliacoesAcessiveis(usuarioAtual.id),
      ]);

      return all.filter(
        (item) =>
          !item.deletadoEm &&
          (item.usuarioId === usuarioAtual.id ||
            avaliacaoIdsAcessiveis.has(item.id)),
      );
    },
    enabled: Boolean(usuarioAtual?.id),
  });

  const { data: ruas = [] } = useQuery({
    queryKey: ['relatorio', 'ruas'],
    queryFn: () => repository.list('avaliacaoRuas'),
  });

  const { data: participantes = [] } = useQuery({
    queryKey: ['relatorio', 'participantes'],
    queryFn: () => repository.list('avaliacaoColaboradores'),
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['relatorio', 'colaboradores'],
    queryFn: () => repository.list('colaboradores'),
  });

  const { data: registros = [] } = useQuery({
    queryKey: ['relatorio', 'registros'],
    queryFn: () => repository.list('registrosColeta'),
  });

  const { data: retoques = [] } = useQuery({
    queryKey: ['relatorio', 'retoques'],
    queryFn: () => repository.list('avaliacaoRetoques'),
  });

  const { data: producoes = [] } = useQuery({
    queryKey: ['relatorio', 'producoes'],
    queryFn: () => repository.list('producoes'),
  });

  const { data: avaliacaoParcelas = [] } = useQuery({
    queryKey: ['relatorio', 'avaliacaoParcelas'],
    queryFn: () => repository.list('avaliacaoParcelas'),
  });

  const avaliacoes = useMemo(
    () =>
      avaliacoesHistorico.filter((item) => normalizeDateKey(item.dataAvaliacao) === dataFiltro),
    [avaliacoesHistorico, dataFiltro],
  );

  const avaliacaoIds = useMemo(
    () => new Set(avaliacoes.map((item) => item.id)),
    [avaliacoes],
  );

  const periodoRange = useMemo(
    () => getPeriodoRelatorioRange(dataFiltro, periodoAvancado),
    [dataFiltro, periodoAvancado],
  );

  const avaliacaoHistoricoIds = useMemo(
    () => new Set(avaliacoesHistorico.map((item) => item.id)),
    [avaliacoesHistorico],
  );

  const avaliacoesHistoricoMap = useMemo(
    () => new Map(avaliacoesHistorico.map((item) => [item.id, item])),
    [avaliacoesHistorico],
  );

  useEffect(() => {
    const nextDataFiltro = routeState?.dataFiltro;
    if (typeof nextDataFiltro === 'string' && nextDataFiltro) {
      setDataFiltro(nextDataFiltro);
    }
  }, [routeState]);

  const colaboradoresMap = useMemo(
    () => new Map(colaboradores.map((item) => [item.id, item])),
    [colaboradores],
  );

  const responsaveisPorAvaliacao = useMemo(
    () =>
      participantes.reduce<Record<string, string[]>>((acc, item) => {
        if (item.deletadoEm) return acc;
        if (normalizePapelAvaliacao(item.papel) !== 'responsavel_principal') return acc;

        const nome =
          item.colaboradorPrimeiroNome ||
          item.colaboradorNome ||
          colaboradoresMap.get(item.colaboradorId)?.primeiroNome ||
          colaboradoresMap.get(item.colaboradorId)?.nome ||
          '';
        if (!nome) return acc;

        acc[item.avaliacaoId] = acc[item.avaliacaoId] || [];
        if (!acc[item.avaliacaoId].includes(nome)) {
          acc[item.avaliacaoId].push(nome);
        }
        return acc;
      }, {}),
    [colaboradoresMap, participantes],
  );

  const parcelaCodigoMap = useMemo(
    () => new Map(avaliacaoParcelas.map((item) => [item.id, item.parcelaCodigo])),
    [avaliacaoParcelas],
  );

  const ruasMap = useMemo(
    () => new Map(ruas.map((item) => [item.id, item])),
    [ruas],
  );

  const producaoEventos = useMemo(() => {
    const configAtual = mergeConfiguracaoComPadrao(config);
    const producaoRetoqueIds = new Set(
      producoes
        .filter((item) => !item.deletadoEm && item.retoqueId)
        .map((item) => item.retoqueId as string),
    );
    const eventos = producoes
      .filter(
        (item) =>
          !item.deletadoEm &&
          dataDentroPeriodoRelatorio(item.data, periodoRange) &&
          (!item.avaliacaoId || avaliacaoHistoricoIds.has(item.avaliacaoId)),
      )
      .map((item) => ({
        id: item.id,
        equipe: formatEquipeRelatorio(item.equipeNome),
        equipeSort: getEquipeSortValue(item.equipeNome),
        data: normalizeDateKey(item.data) || dataFiltro,
        cargas: Number(item.cargas || 0),
        bags: Number(item.bags || 0),
        cocosEstimados: Number(item.cocosEstimados || 0),
      }));

    retoques
      .filter(
        (item) =>
          !item.deletadoEm &&
          !producaoRetoqueIds.has(item.id) &&
          dataDentroPeriodoRelatorio(item.dataRetoque, periodoRange) &&
          (avaliacaoHistoricoIds.has(item.avaliacaoId) ||
            avaliacaoHistoricoIds.has(item.avaliacaoOriginalId)),
      )
      .forEach((item) => {
        const calculado = calcularProducaoPorCargas(
          item.quantidadeCargas,
          configAtual,
        );
        const bags = Number(item.quantidadeBags || calculado.bags);
        const cocosEstimados = Number(item.cocosEstimados || bags * configAtual.cocosPorBag);
        eventos.push({
          id: item.id,
          equipe: formatEquipeRelatorio(item.equipeNome),
          equipeSort: getEquipeSortValue(item.equipeNome),
          data: normalizeDateKey(item.dataRetoque) || dataFiltro,
          cargas: Number(item.quantidadeCargas || 0),
          bags,
          cocosEstimados,
        });
      });

    return eventos;
  }, [
    avaliacaoHistoricoIds,
    config,
    dataFiltro,
    periodoRange,
    producoes,
    retoques,
  ]);

  const relatorioEquipesAvancado = useMemo<RelatorioEquipeAvancado[]>(() => {
    const groups = new Map<string, RelatorioEquipeAvancado>();
    const ensureGroup = (equipe: string, equipeSort: number) => {
      const key = equipe || '--';
      const current = groups.get(key);
      if (current) return current;

      const created: RelatorioEquipeAvancado = {
        equipe: key,
        equipeSort,
        totalCargas: 0,
        totalBags: 0,
        totalCocos: 0,
        mediaCocosPorBag: 0,
        indiceCocosChao: 0,
        indiceCachos: 0,
        registros: 0,
      };
      groups.set(key, created);
      return created;
    };

    producaoEventos.forEach((item) => {
      const group = ensureGroup(item.equipe, item.equipeSort);
      group.totalCargas += item.cargas;
      group.totalBags += item.bags;
      group.totalCocos += item.cocosEstimados;
    });

    registros
      .filter((item) => !item.deletadoEm)
      .forEach((registro) => {
        const rua = ruasMap.get(registro.ruaId);
        const avaliacao = avaliacoesHistoricoMap.get(registro.avaliacaoId);
        if (!rua || !avaliacao || !avaliacaoHistoricoIds.has(registro.avaliacaoId)) {
          return;
        }

        const dataRegistro =
          normalizeDateKey(registro.registradoEm) ||
          normalizeDateKey(rua.dataAvaliacao) ||
          normalizeDateKey(avaliacao.dataAvaliacao);
        if (!dataDentroPeriodoRelatorio(dataRegistro, periodoRange)) {
          return;
        }

        const equipe = formatEquipeRelatorio(rua.equipeNome || avaliacao.equipeNome);
        const group = ensureGroup(
          equipe,
          getEquipeSortValue(rua.equipeNome || avaliacao.equipeNome),
        );
        group.indiceCocosChao += Number(registro.quantidade || 0);
        group.indiceCachos += Number(registro.quantidadeCachos3 || 0);
        group.registros += 1;
      });

    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        mediaCocosPorBag:
          item.totalBags > 0 ? item.totalCocos / item.totalBags : 0,
        indiceCocosChao:
          item.registros > 0 ? item.indiceCocosChao / item.registros : 0,
        indiceCachos: item.registros > 0 ? item.indiceCachos / item.registros : 0,
      }))
      .sort((a, b) => {
        if (a.equipeSort !== b.equipeSort) return a.equipeSort - b.equipeSort;
        return a.equipe.localeCompare(b.equipe, 'pt-BR', { numeric: true });
      });
  }, [
    avaliacaoHistoricoIds,
    avaliacoesHistoricoMap,
    periodoRange,
    producaoEventos,
    registros,
    ruasMap,
  ]);

  const rankingEquipes = useMemo(
    () =>
      relatorioEquipesAvancado
        .slice()
        .sort((a, b) => {
          if (a.indiceCocosChao !== b.indiceCocosChao) {
            return a.indiceCocosChao - b.indiceCocosChao;
          }
          if (a.indiceCachos !== b.indiceCachos) {
            return a.indiceCachos - b.indiceCachos;
          }
          return b.totalBags - a.totalBags;
        }),
    [relatorioEquipesAvancado],
  );

  const evolucaoBags = useMemo(() => {
    const groups = new Map<string, number>();
    producaoEventos.forEach((item) => {
      groups.set(item.data, (groups.get(item.data) || 0) + item.bags);
    });

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-10)
      .map(([data, bags]) => ({ data, bags }));
  }, [producaoEventos]);

  const totaisProducao = useMemo(
    () =>
      relatorioEquipesAvancado.reduce(
        (acc, item) => ({
          cargas: acc.cargas + item.totalCargas,
          bags: acc.bags + item.totalBags,
          cocos: acc.cocos + item.totalCocos,
        }),
        { cargas: 0, bags: 0, cocos: 0 },
      ),
    [relatorioEquipesAvancado],
  );

  const linhasDoDia = useMemo(() => {
    const avaliacaoMap = new Map(avaliacoes.map((item) => [item.id, item]));
    const registrosAtivos = new Set(
      registros.filter((item) => !item.deletadoEm).map((item) => item.ruaId),
    );

    return ruas
      .filter(
        (item) =>
          avaliacaoIds.has(item.avaliacaoId) &&
          !item.deletadoEm &&
          registrosAtivos.has(item.id),
      )
      .map((rua) => {
        const avaliacao = avaliacaoMap.get(rua.avaliacaoId);
        return {
          id: rua.id,
          avaliacaoId: rua.avaliacaoId,
          parcela:
            parcelaCodigoMap.get(rua.avaliacaoParcelaId) ||
            avaliacao?.parcelaCodigo ||
            'Parcela',
          data: rua.dataAvaliacao || avaliacao?.dataAvaliacao || dataFiltro,
          equipe: formatEquipeRelatorio(rua.equipeNome),
          equipeSort: getEquipeSortValue(rua.equipeNome),
          linhaInicial: Number(rua.linhaInicial || 0),
          linhaFinal: Number(rua.linhaFinal || 0),
          rua: formatRuaRelatorio(rua.linhaInicial, rua.linhaFinal),
          status: avaliacao?.status || 'in_progress',
        };
      })
      .sort((a, b) => {
        if (a.parcela !== b.parcela) {
          return a.parcela.localeCompare(b.parcela, 'pt-BR', { numeric: true });
        }
        if (a.equipeSort !== b.equipeSort) {
          return a.equipeSort - b.equipeSort;
        }
        if (a.equipe !== b.equipe) {
          return a.equipe.localeCompare(b.equipe, 'pt-BR', { numeric: true });
        }
        if (a.linhaInicial !== b.linhaInicial) {
          return a.linhaInicial - b.linhaInicial;
        }
        return a.linhaFinal - b.linhaFinal;
      });
  }, [avaliacaoIds, avaliacoes, dataFiltro, parcelaCodigoMap, registros, ruas]);

  const gruposConsolidados = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        equipe: string;
        equipeSort: number;
        data: string;
        status: string;
        responsaveis: Set<string>;
        parcelas: Set<string>;
      }
    >();

    linhasDoDia.forEach((item) => {
      const key = `${item.equipe}::${item.data}`;
      const current = groups.get(key);
      const responsaveis = responsaveisPorAvaliacao[item.avaliacaoId] || [];

      if (!current) {
        groups.set(key, {
          id: key,
          equipe: item.equipe,
          equipeSort: item.equipeSort,
          data: item.data,
          status: item.status,
          responsaveis: new Set(responsaveis),
          parcelas: new Set(item.parcela ? [item.parcela] : []),
        });
        return;
      }

      current.status = mergeStatusRelatorio(current.status, item.status);
      responsaveis.forEach((responsavel) => current.responsaveis.add(responsavel));
      if (item.parcela) {
        current.parcelas.add(item.parcela);
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        responsaveis: Array.from(group.responsaveis).sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true }),
        ),
        parcelas: Array.from(group.parcelas).sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true }),
        ),
      }))
      .sort((a, b) => {
        if (a.equipeSort !== b.equipeSort) {
          return a.equipeSort - b.equipeSort;
        }
        if (a.equipe !== b.equipe) {
          return a.equipe.localeCompare(b.equipe, 'pt-BR', { numeric: true });
        }
        return a.data.localeCompare(b.data, 'pt-BR', { numeric: true });
      });
  }, [linhasDoDia, responsaveisPorAvaliacao]);

  const gruposHistoricoEquipes = useMemo<GrupoHistoricoEquipe[]>(() => {
    const avaliacaoMap = new Map(
      avaliacoesHistorico.map((item) => [item.id, item]),
    );
    const groups = new Map<
      string,
      {
        id: string;
        equipe: string;
        equipeSort: number;
        data: string;
        status: string;
        responsaveis: Set<string>;
        parcelas: Set<string>;
      }
    >();

    ruas
      .filter((item) => !item.deletadoEm && avaliacaoMap.has(item.avaliacaoId))
      .forEach((rua) => {
        const avaliacao = avaliacaoMap.get(rua.avaliacaoId);
        const data = normalizeDateKey(rua.dataAvaliacao || avaliacao?.dataAvaliacao);
        if (!data || data > dataFiltro) {
          return;
        }

        const equipe = formatEquipeRelatorio(rua.equipeNome || avaliacao?.equipeNome);
        const key = `${equipe}::${data}`;
        const current = groups.get(key);
        const responsaveis = responsaveisPorAvaliacao[rua.avaliacaoId] || [];
        const parcela =
          parcelaCodigoMap.get(rua.avaliacaoParcelaId) ||
          avaliacao?.parcelaCodigo ||
          'Parcela';

        if (!current) {
          groups.set(key, {
            id: key,
            equipe,
            equipeSort: getEquipeSortValue(rua.equipeNome || avaliacao?.equipeNome),
            data,
            status: avaliacao?.status || 'in_progress',
            responsaveis: new Set(responsaveis),
            parcelas: new Set(parcela ? [parcela] : []),
          });
          return;
        }

        current.status = mergeStatusRelatorio(current.status, avaliacao?.status);
        responsaveis.forEach((responsavel) => current.responsaveis.add(responsavel));
        if (parcela) {
          current.parcelas.add(parcela);
        }
      });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        responsaveis: Array.from(group.responsaveis).sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true }),
        ),
        parcelas: Array.from(group.parcelas).sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true }),
        ),
      }))
      .sort((a, b) => {
        if (a.equipeSort !== b.equipeSort) {
          return a.equipeSort - b.equipeSort;
        }
        if (a.equipe !== b.equipe) {
          return a.equipe.localeCompare(b.equipe, 'pt-BR', { numeric: true });
        }
        return b.data.localeCompare(a.data, 'pt-BR', { numeric: true });
      });
  }, [avaliacoesHistorico, dataFiltro, parcelaCodigoMap, responsaveisPorAvaliacao, ruas]);

  const historicoPorEquipe = useMemo(() => {
    const janelaDatas = buildDateWindowRelatorio(dataFiltro, TEAM_HISTORY_DAYS);
    const groups = new Map<
      string,
      {
        equipe: string;
        equipeSort: number;
        registros: GrupoHistoricoEquipe[];
      }
    >();

    gruposHistoricoEquipes.forEach((item) => {
      const current = groups.get(item.equipe) || {
        equipe: item.equipe,
        equipeSort: item.equipeSort,
        registros: [],
      };
      current.registros.push(item);
      groups.set(item.equipe, current);
    });

    return Array.from(groups.values())
      .map((group) => {
        const registros = group.registros
          .slice()
          .sort((a, b) => b.data.localeCompare(a.data, 'pt-BR', { numeric: true }));
        const mapaDatas = new Map(registros.map((item) => [item.data, item]));
        const totalParcelas = new Set(registros.flatMap((item) => item.parcelas)).size;

        return {
          ...group,
          totalParcelas,
          janela: janelaDatas.map((data) => ({
            data,
            registro: mapaDatas.get(data) || null,
          })),
          ultimosRegistros: registros.slice(0, TEAM_HISTORY_ENTRIES),
        };
      })
      .sort((a, b) => {
        if (a.equipeSort !== b.equipeSort) {
          return a.equipeSort - b.equipeSort;
        }
        return a.equipe.localeCompare(b.equipe, 'pt-BR', { numeric: true });
      });
  }, [dataFiltro, gruposHistoricoEquipes]);

  const stats = useMemo(() => {
    const avaliacaoIdsComDados = new Set(linhasDoDia.map((item) => item.avaliacaoId));
    const equipes = new Set(
      linhasDoDia.map((item) => item.equipe).filter(Boolean),
    ).size;
    const parcelas = new Set(
      linhasDoDia.map((item) => item.parcela).filter(Boolean),
    ).size;
    const responsaveis = new Set(
      participantes
        .filter(
          (item) =>
            avaliacaoIdsComDados.has(item.avaliacaoId) &&
            !item.deletadoEm,
        )
        .map((item) => item.colaboradorId),
    ).size;

    return {
      equipes,
      parcelas,
      responsaveis,
    };
  }, [linhasDoDia, participantes]);

  const diaSemana = useMemo(() => {
    return getDiaSemanaRelatorio(dataFiltro);
  }, [dataFiltro]);

  if (!canViewReports(usuarioAtual?.perfil, permissionMatrix)) {
    return (
      <LayoutMobile
        title="Relatorio"
        subtitle="Acesso restrito"
        onBack={() => navigate('/dashboard')}
      >
        <AccessDeniedCard description="Os relatórios consolidados só aparecem quando essa consulta está liberada para o seu perfil pelo administrador." />
      </LayoutMobile>
    );
  }

  const handleGerarPdf = async () => {
    setGerando(true);
    try {
      const allColaboradores = await repository.list('colaboradores');
      const allParcelas = await repository.list('parcelas');
      const allConfigs = await repository.list('configuracoes');
      const allAvaliacaoColaboradores = await repository.list(
        'avaliacaoColaboradores',
      );
      const allAvaliacaoParcelas = await repository.list('avaliacaoParcelas');
      const allAvaliacaoRuas = await repository.list('avaliacaoRuas');
      const allRegistros = await repository.list('registrosColeta');
      const allRetoques = await repository.list('avaliacaoRetoques');

      const colabMap = new Map(allColaboradores.map((item) => [item.id, item]));
      const retoqueByAvaliacaoId = new Map(
        allRetoques
          .filter((item) => !item.deletadoEm)
          .map((item) => [item.avaliacaoId, item] as [string, AvaliacaoRetoque]),
      );
      const parcelaCodigoMap = new Map(
        allAvaliacaoParcelas.map((item) => [item.id, item.parcelaCodigo]),
      );
      const parcelaSiglasResumoMap = new Map(
        allAvaliacaoParcelas.map((item) => [
          item.id,
          normalizarSiglasResumoParcela(item.siglasResumo),
        ]),
      );
      const parcelMap = new Map(allParcelas.map((item) => [item.id, item.codigo]));
      const configAtual = mergeConfiguracaoComPadrao(allConfigs[0] || config);
      const limiteCocos = configAtual.limiteCocosChao;
      const limiteCachos = configAtual.limiteCachos3Cocos;
      const registroPorRuaId = new Map(
        allRegistros
          .filter((item) => !item.deletadoEm)
          .map((item) => [item.ruaId, item]),
      );

      const rows: RelatorioPdfRow[] = [];
      for (const avaliacao of avaliacoes) {
        const avColabs = allAvaliacaoColaboradores.filter(
          (item) => item.avaliacaoId === avaliacao.id && !item.deletadoEm,
        );
        const avRuas = allAvaliacaoRuas.filter(
          (item) => item.avaliacaoId === avaliacao.id && !item.deletadoEm,
        );
        const conclusaoParcelaEquipe = new Map<string, boolean>();
        const resolveNomeColaborador = (item: (typeof avColabs)[number]) =>
          colabMap.get(item.colaboradorId)?.primeiroNome ||
          item.colaboradorPrimeiroNome ||
          item.colaboradorNome ||
          '';

        const responsaveis = avColabs
          .filter((item) => normalizePapelAvaliacao(item.papel) === 'responsavel_principal')
          .flatMap((item) => {
            const nome = resolveNomeColaborador(item);
            return nome ? [nome] : [];
          });
        const ajudantes = avColabs
          .filter((item) => normalizePapelAvaliacao(item.papel) === 'ajudante')
          .flatMap((item) => {
            const nome = resolveNomeColaborador(item);
            return nome ? [nome] : [];
          });
        const participantes = avColabs
          .flatMap((item) => {
            const nome = resolveNomeColaborador(item);
            return nome ? [nome] : [];
          });
        const responsaveisLista = Array.from(
          new Set(
            responsaveis.length > 0 || ajudantes.length > 0
              ? [...responsaveis, ...ajudantes]
              : participantes,
          ),
        );

        avRuas.forEach((rua) => {
          const key = `${rua.avaliacaoParcelaId}::${formatEquipeRelatorio(rua.equipeNome)}`;
          if (conclusaoParcelaEquipe.has(key)) {
            return;
          }

          const ruasDoGrupo = avRuas.filter(
            (item) =>
              item.avaliacaoParcelaId === rua.avaliacaoParcelaId &&
              formatEquipeRelatorio(item.equipeNome) === formatEquipeRelatorio(rua.equipeNome),
          );

          conclusaoParcelaEquipe.set(
            key,
            ruasDoGrupo.every(
              (item) => registroPorRuaId.has(item.id) || Boolean(item.tipoFalha),
            ),
          );
        });

        for (const rua of avRuas) {
          const registro = registroPorRuaId.get(rua.id);
          if (!registro) {
          continue;
          }

          const dataRelatorio = rua.dataAvaliacao || avaliacao.dataAvaliacao;
          const dataColheita = avaliacao.dataColheita || dataRelatorio;
          const referente = montarReferenteRelatorio(dataColheita);
          const observacoesRegistro = registro?.observacoes || avaliacao.observacoes || '';
          const observacaoBase = montarObservacaoRelatorio(observacoesRegistro);
          const retoque =
            retoqueByAvaliacaoId.get(avaliacao.id) ||
            (avaliacao.avaliacaoOriginalId
              ? retoqueByAvaliacaoId.get(avaliacao.avaliacaoOriginalId)
              : null);
          const observacaoExtra: string[] = [];
          if (avaliacao.marcadoRetoquePorNome) {
            observacaoExtra.push(`Fiscal responsável: ${avaliacao.marcadoRetoquePorNome}`);
          }
          if (avaliacao.retoqueDesignadoParaNome) {
            observacaoExtra.push(`Executor designado: ${avaliacao.retoqueDesignadoParaNome}`);
          }
          if (retoque) {
            const bags = Number(retoque.quantidadeBags || 0);
            const cargas = Number(retoque.quantidadeCargas || 0);
            const cocosEstimados = Number(
              retoque.cocosEstimados || bags * configAtual.cocosPorBag,
            );
            const dataRetoque = retoque.dataRetoque
              ? `Data retoque: ${retoque.dataRetoque}`
              : '';
            observacaoExtra.push(
              `Retoque: ${bags} bags / ${cargas} cargas / ${cocosEstimados} cocos`,
              dataRetoque,
            );
            if (retoque.observacao) {
              observacaoExtra.push(`Obs. retoque: ${retoque.observacao}`);
            }
          }
          const observacao = [observacaoBase, ...observacaoExtra]
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join('\n');
          const apresentacaoColeta = obterApresentacaoEstadoColetaRua({
            quantidade: registro.quantidade,
            quantidadeCachos3: registro.quantidadeCachos3,
            observacoes: observacoesRegistro,
          });

          rows.push({
            id: rua.id,
            data: dataRelatorio,
            dataColheita,
            parcela:
              parcelaCodigoMap.get(rua.avaliacaoParcelaId) ||
              avaliacao.parcelaCodigo ||
              parcelMap.get(rua.parcelaId) ||
              '-',
            parcelaCompleta:
              conclusaoParcelaEquipe.get(
                `${rua.avaliacaoParcelaId}::${formatEquipeRelatorio(rua.equipeNome)}`,
              ) ?? false,
            siglaResumoParcela:
              parcelaSiglasResumoMap.get(rua.avaliacaoParcelaId)?.[
                formatEquipeRelatorio(rua.equipeNome)
              ] || '',
            equipe: formatEquipeRelatorio(rua.equipeNome),
            equipeKey: formatEquipeRelatorio(rua.equipeNome),
            equipeSort: getEquipeSortValue(rua.equipeNome),
            linhaInicial: Number(rua.linhaInicial || 0),
            linhaFinal: Number(rua.linhaFinal || 0),
            rua: formatRuaRelatorio(rua.linhaInicial, rua.linhaFinal, '-'),
            cachoPl: apresentacaoColeta.faltaColher
              ? 'F.C'
              : formatQuantidadeRelatorio(apresentacaoColeta.quantidadeCachos3),
            cocosDeixados: apresentacaoColeta.faltaColher
              ? '--'
              : apresentacaoColeta.faltaTropear
              ? 'F.T'
              : formatQuantidadeRelatorio(apresentacaoColeta.quantidade),
            referente,
            responsaveisLista,
            observacao,
            excedeuCacho: !apresentacaoColeta.faltaColher
              ? excedeuLimiteRelatorio(apresentacaoColeta.quantidadeCachos3, limiteCachos)
              : false,
            excedeuCocos:
              !apresentacaoColeta.faltaTropear && !apresentacaoColeta.faltaColher
                ? excedeuLimiteRelatorio(apresentacaoColeta.quantidade, limiteCocos)
              : false,
          });
        }
      }

      rows.sort((a, b) => {
        if (a.equipeSort !== b.equipeSort) {
          return a.equipeSort - b.equipeSort;
        }
        if (a.equipe !== b.equipe) {
          return String(a.equipe).localeCompare(String(b.equipe), 'pt-BR', {
            numeric: true,
          });
        }
        if (a.dataColheita !== b.dataColheita) {
          return String(a.dataColheita).localeCompare(String(b.dataColheita), 'pt-BR', {
            numeric: true,
          });
        }
        if (a.parcela !== b.parcela) {
          return String(a.parcela).localeCompare(String(b.parcela), 'pt-BR', {
            numeric: true,
          });
        }
        if (a.linhaInicial !== b.linhaInicial) {
          return a.linhaInicial - b.linhaInicial;
        }
        return a.linhaFinal - b.linhaFinal;
      });

      if (rows.length === 0) {
        alert('Nenhum dado encontrado para gerar o PDF.');
        return;
      }

      const groupedRows = new Map<
        string,
        {
          key: string;
          parcela: string;
          equipe: string;
          equipeSort: number;
          dataColheita: string;
          responsaveis: Set<string>;
          referentes: Set<string>;
          rows: RelatorioPdfRow[];
        }
      >();

      rows.forEach((row) => {
        const colheitaKey = row.dataColheita || row.referente || 'sem_colheita';
        const groupKey = `${row.equipeKey}::${colheitaKey}`;
        if (!groupedRows.has(groupKey)) {
          groupedRows.set(groupKey, {
            key: groupKey,
            parcela: row.parcela,
            equipe: row.equipe,
            equipeSort: row.equipeSort,
            dataColheita: colheitaKey,
            responsaveis: new Set<string>(),
            referentes: new Set<string>(),
            rows: [],
          });
        }

        const group = groupedRows.get(groupKey)!;
        row.responsaveisLista.forEach((responsavel) => group.responsaveis.add(responsavel));
        if (row.referente) {
          group.referentes.add(row.referente);
        }
        group.rows.push(row);
      });

      const teamGroups: RelatorioPdfGroup[] = Array.from(groupedRows.values())
        .sort((a, b) => {
          if (a.equipeSort !== b.equipeSort) {
            return a.equipeSort - b.equipeSort;
          }
          if (a.equipe !== b.equipe) {
            return a.equipe.localeCompare(b.equipe, 'pt-BR', { numeric: true });
          }
          if (a.dataColheita !== b.dataColheita) {
            return String(a.dataColheita).localeCompare(String(b.dataColheita), 'pt-BR', {
              numeric: true,
            });
          }
          return String(a.parcela).localeCompare(String(b.parcela), 'pt-BR', {
            numeric: true,
          });
        })
        .map((group) => ({
          key: group.key,
          parcela: group.parcela,
          equipe: group.equipe,
          equipeSort: group.equipeSort,
          dataColheita: group.dataColheita,
          responsaveis: Array.from(group.responsaveis).sort((a, b) =>
            a.localeCompare(b, 'pt-BR', { numeric: true }),
          ),
          referentes: Array.from(group.referentes),
          rows: group.rows,
        }));

      const printPages = paginateGroupedRows(
        teamGroups,
        ROWS_PER_PAGE,
        espacoEntreEquipes,
      );

      const blob = await createRelatorioPdfBlob({
        dataTitulo: formatDateTimeLabel(dataFiltro).split(' ')[0],
        referenteLabel: 'Relatório Diário QualCoco',
        footerCode: `Gerado por ${
          usuarioAtual?.nome || 'Sistema'
        } em ${new Date().toLocaleString()}`,
        printPages,
      });
      const fileName = `Relatorio_${dataFiltro}.pdf`;

      if (Capacitor.isNativePlatform()) {
        await saveAndOpenPdfOnDevice(blob, fileName);
        return;
      }

      openPdfInBrowser(blob, fileName);
    } catch (error) {
      console.error(error);
      alert(
        'Erro ao gerar PDF: ' +
          (error instanceof Error ? error.message : 'Erro desconhecido'),
      );
    } finally {
      setGerando(false);
    }
  };

  return (
    <LayoutMobile
      title="Relatório"
      subtitle="Folha diária consolidada por data"
      onBack={() => navigate('/dashboard')}
      showBottomNav
    >
      <div className="stack-lg">
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-4">
            <div className="stack-md">
              <div className="space-y-2">
                <label className="px-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--qc-secondary)]">
                  Data do Relatório
                </label>
                <div className="relative">
                  <Input
                    type="date"
                    className="h-11 rounded-[16px] pl-11"
                    value={dataFiltro}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDataFiltro(event.target.value)}
                  />
                  <CalendarIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--qc-text-muted)]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Dia da Avaliação
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {diaSemana}
                  </p>
                </div>
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Equipes do Dia
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {stats.equipes}
                  </p>
                </div>
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Parcelas
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {stats.parcelas}
                  </p>
                </div>
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Responsáveis
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {stats.responsaveis}
                  </p>
                </div>
              </div>

              <div className="stack-xs rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                  Espaço entre equipes no PDF
                </span>
                <div className="mt-2 flex h-11 items-center overflow-hidden rounded-[16px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)]">
                  <button
                    type="button"
                    className="h-full border-r border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                    onClick={() =>
                      setEspacoEntreEquipes((current) =>
                        Math.max(0, Math.min(MAX_TEAM_SPACER_ROWS, current - 1)),
                      )
                    }
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    max={String(MAX_TEAM_SPACER_ROWS)}
                    className="w-full bg-transparent text-center font-bold text-[var(--qc-text)] focus:outline-none"
                    value={espacoEntreEquipes}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setEspacoEntreEquipes(
                        Math.max(
                          0,
                          Math.min(
                            MAX_TEAM_SPACER_ROWS,
                            Number(event.target.value) || 0,
                          ),
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="h-full border-l border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                    onClick={() =>
                      setEspacoEntreEquipes((current) =>
                        Math.max(0, Math.min(MAX_TEAM_SPACER_ROWS, current + 1)),
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-[var(--qc-text-muted)]">
                  Define quantas linhas em branco o PDF deixa entre uma equipe e outra.
                </p>
              </div>

              <Button
                className="h-12 w-full rounded-[18px] text-base font-bold"
                onClick={handleGerarPdf}
                disabled={gerando || linhasDoDia.length === 0}
              >
                {gerando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileText className="h-5 w-5" />
                )}
                {gerando ? 'Gerando PDF' : 'Gerar PDF'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="stack-md p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-[var(--qc-text)]">
                  Relatórios por equipe
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Produção, eficiência e ranking calculados por período.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                {formatDateLabel(periodoRange.start)} a {formatDateLabel(periodoRange.end)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {PERIODOS_RELATORIO.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  variant={periodoAvancado === item.value ? 'default' : 'outline'}
                  className="h-10 rounded-[14px] text-xs font-bold"
                  onClick={() => setPeriodoAvancado(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Cargas
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {formatarProducaoNumero(totaisProducao.cargas)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Bags
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {formatarProducaoNumero(totaisProducao.bags)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Cocos
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {formatarProducaoNumero(totaisProducao.cocos, 0)}
                </p>
              </div>
            </div>

            {relatorioEquipesAvancado.length === 0 ? (
              <div className="rounded-[20px] border border-[var(--qc-border)] bg-white p-5 text-center">
                <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                  Nenhuma produção encontrada no período selecionado.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                  <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                    Equipes vs produção (bags)
                  </p>
                  <div className="mt-4">
                    <BarraProducaoEquipes data={relatorioEquipesAvancado} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-black tracking-tight text-[var(--qc-text)]">
                      Evolução da produção
                    </p>
                    <LinhaEvolucaoBags pontos={evolucaoBags} />
                  </div>
                  <div className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                    <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                      Ranking automático
                    </p>
                    <div className="mt-3 stack-sm">
                      {rankingEquipes.slice(0, 3).map((item, index) => (
                        <div
                          key={item.equipe}
                          className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-black text-[var(--qc-text)]">
                              {MEDALHAS_RANKING[index] || `${index + 1}º`} {index + 1}º lugar · Equipe {item.equipe}
                            </p>
                            <p className="text-xs text-[var(--qc-text-muted)]">
                              Coco chão {formatarProducaoNumero(item.indiceCocosChao)} · Cachos {formatarProducaoNumero(item.indiceCachos)}
                            </p>
                          </div>
                          <span className="text-sm font-black tabular-nums text-[#1f61a4]">
                            {formatarProducaoNumero(item.totalBags)} bags
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                    <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                      Eficiência - menor coco no chão
                    </p>
                    <div className="mt-4">
                      <GraficoEficienciaCocosChao data={relatorioEquipesAvancado} />
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                    <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                      Dados por equipe
                    </p>
                    <div className="mt-3 stack-sm">
                      {relatorioEquipesAvancado.map((item) => (
                        <div
                          key={item.equipe}
                          className="rounded-[16px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-[var(--qc-text)]">
                              Equipe {item.equipe}
                            </p>
                            <span className="text-sm font-black tabular-nums text-[#1f61a4]">
                              {formatarProducaoNumero(item.totalBags)} bags
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                            <div>
                              <p className="font-extrabold uppercase text-[var(--qc-secondary)]">
                                Cargas
                              </p>
                              <p className="font-black tabular-nums text-[var(--qc-text)]">
                                {formatarProducaoNumero(item.totalCargas)}
                              </p>
                            </div>
                            <div>
                              <p className="font-extrabold uppercase text-[var(--qc-secondary)]">
                                Cocos
                              </p>
                              <p className="font-black tabular-nums text-[var(--qc-text)]">
                                {formatarProducaoNumero(item.totalCocos, 0)}
                              </p>
                            </div>
                            <div>
                              <p className="font-extrabold uppercase text-[var(--qc-secondary)]">
                                Média/bag
                              </p>
                              <p className="font-black tabular-nums text-[var(--qc-text)]">
                                {formatarProducaoNumero(item.mediaCocosPorBag, 0)}
                              </p>
                            </div>
                            <div>
                              <p className="font-extrabold uppercase text-[var(--qc-secondary)]">
                                Coco chão
                              </p>
                              <p className="font-black tabular-nums text-[var(--qc-text)]">
                                {formatarProducaoNumero(item.indiceCocosChao)}
                              </p>
                            </div>
                            <div>
                              <p className="font-extrabold uppercase text-[var(--qc-secondary)]">
                                Cachos
                              </p>
                              <p className="font-black tabular-nums text-[var(--qc-text)]">
                                {formatarProducaoNumero(item.indiceCachos)}
                              </p>
                            </div>
                            <div>
                              <p className="font-extrabold uppercase text-[var(--qc-secondary)]">
                                Registros
                              </p>
                              <p className="font-black tabular-nums text-[var(--qc-text)]">
                                {formatarProducaoNumero(item.registros, 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-[rgba(0,107,68,0.16)] bg-[rgba(0,107,68,0.07)] p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                      Melhor equipe
                    </p>
                    <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                      Equipe {rankingEquipes[0]?.equipe || '--'}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(197,58,53,0.18)] bg-[rgba(197,58,53,0.07)] p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                      Pior equipe
                    </p>
                    <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                      Equipe {rankingEquipes[rankingEquipes.length - 1]?.equipe || '--'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="stack-md">
          <div className="px-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-xl font-black tracking-tight text-[var(--qc-text)] sm:text-[1.35rem]">
                Registros Consolidados
              </h2>
              <span className="inline-flex w-fit whitespace-nowrap rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                {formatResumoContagem(stats.equipes, 'equipe', 'equipes')} •{' '}
                {formatResumoContagem(stats.parcelas, 'parcela', 'parcelas')}
              </span>
            </div>
          </div>

          {gruposConsolidados.length === 0 ? (
            <Card className="surface-card border-none shadow-sm">
              <CardContent className="p-6 text-center">
                <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                  Nenhuma avaliação encontrada para a data selecionada.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="stack-md">
              {gruposConsolidados.map((item) => (
                <Card key={item.id} className="surface-card border-none shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black tracking-tight text-[var(--qc-text)]">
                          Equipe {item.equipe}
                        </p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                          {formatDateTimeLabel(item.data).split(' ')[0]}
                        </p>
                      </div>

                      <span className="inline-flex rounded-full border border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--qc-primary)]">
                        {formatResumoContagem(item.parcelas.length, 'parcela', 'parcelas')}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4 sm:grid-cols-3">
                      <div className="stack-xs">
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                          Parcelas
                        </span>
                        <p className="text-sm font-bold text-[var(--qc-text)]">
                          {item.parcelas.length > 0
                            ? item.parcelas.join(' • ')
                            : 'Não informado'}
                        </p>
                      </div>
                      <div className="stack-xs">
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                          Responsável
                        </span>
                        <p className="text-sm font-bold text-[var(--qc-text)]">
                          {item.responsaveis?.length ? item.responsaveis.join(', ') : 'Não informado'}
                        </p>
                      </div>
                      <div className="stack-xs">
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                          Status
                        </span>
                        <p className="text-sm font-bold text-[var(--qc-text)]">
                          {formatStatusRelatorio(item.status)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="stack-md">
          <div className="px-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-[var(--qc-text)] sm:text-[1.35rem]">
                  Histórico por Equipe
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Azul indica dia positivo e vermelho indica dia com retoque.
                </p>
              </div>
              <span className="inline-flex w-fit whitespace-nowrap rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                Últimos {TEAM_HISTORY_DAYS} dias até {formatDateLabel(dataFiltro)}
              </span>
            </div>
          </div>

          {historicoPorEquipe.length === 0 ? (
            <Card className="surface-card border-none shadow-sm">
              <CardContent className="p-6 text-center">
                <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                  Nenhum histórico por equipe encontrado até a data selecionada.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="stack-md">
              {historicoPorEquipe.map((item) => (
                <Card key={item.equipe} className="surface-card border-none shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black tracking-tight text-[var(--qc-text)]">
                          Equipe {item.equipe}
                        </p>
                        <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                          {formatResumoContagem(item.totalParcelas, 'parcela', 'parcelas')} no histórico
                        </p>
                      </div>

                      <span className="inline-flex rounded-full border border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--qc-primary)]">
                        {formatResumoContagem(item.registros.length, 'registro', 'registros')}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-7 gap-2">
                      {item.janela.map(({ data, registro }) => {
                        const meta = getHistoricoEquipeStatusMeta(registro?.status);
                        return (
                          <div
                            key={`${item.equipe}-${data}`}
                            className={`rounded-[16px] border px-2 py-3 text-center ${meta.surfaceClassName}`}
                          >
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em]">
                              {formatDiaCurtoRelatorio(data)}
                            </p>
                            <span className={`mx-auto mt-2 block h-2.5 w-2.5 rounded-full ${meta.dotClassName}`} />
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 stack-sm">
                      {item.ultimosRegistros.map((registro) => {
                        const meta = getHistoricoEquipeStatusMeta(registro.status);
                        return (
                          <div
                            key={registro.id}
                            className="rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm font-black text-[var(--qc-text)]">
                                {formatDateLabel(registro.data)}
                              </p>
                              <span
                                className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] ${meta.surfaceClassName}`}
                              >
                                {meta.label}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="stack-xs">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                                  Parcelas
                                </span>
                                <p className="text-sm font-bold text-[var(--qc-text)]">
                                  {registro.parcelas.length > 0
                                    ? registro.parcelas.join(' • ')
                                    : 'Não informado'}
                                </p>
                              </div>
                              <div className="stack-xs">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                                  Responsável
                                </span>
                                <p className="text-sm font-bold text-[var(--qc-text)]">
                                  {registro.responsaveis.length > 0
                                    ? registro.responsaveis.join(', ')
                                    : 'Não informado'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </LayoutMobile>
  );
}

