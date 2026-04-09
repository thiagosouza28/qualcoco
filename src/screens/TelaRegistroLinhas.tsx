import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronRight,
  Info,
  ListChecks,
  PencilLine,
  X,
} from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { CounterInput } from '@/components/CounterInput';
import { useCampoApp } from '@/core/AppProvider';
import {
  limparFalhaRua,
  finalizarAvaliacao,
  obterAvaliacaoDetalhada,
  registrarRetoque,
  salvarRegistroColeta,
} from '@/core/evaluations';
import { saveEntity } from '@/core/repositories';
import { nowIso } from '@/core/date';
import {
  canOperateAssignedRetoque,
  canStartEvaluation,
  normalizePapelAvaliacao,
} from '@/core/permissions';
import { inferirAlinhamentoTipoPorLinha } from '@/core/plots';
import { STORAGE_KEYS } from '@/core/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils';
import {
  type EstadoColetaRua,
  limparMarcacoesLegadasColeta,
  normalizarContagemRua,
  obterApresentacaoEstadoColetaRua,
  resolverEstadoColetaRua,
  serializarEstadoColetaRua,
} from '@/core/registroRua';
import { useRolePermissions } from '@/core/useRolePermissions';
import type {
  ModoCalculo,
  SentidoRuas,
  SiglaResumoParcela,
  TipoFalhaRua,
} from '@/core/types';

const OBSERVACOES_DETALHADAS = ['Abelha', 'Tapio'] as const;
const HARDWARE_VOLUME_EVENT = 'qualcoco:hardware-volume';
const COUNTER_MIN = 0;
const COUNTER_MAX = 999;

type ObservacaoDetalhadaTipo = (typeof OBSERVACOES_DETALHADAS)[number];
type ObservacaoDetalhada = {
  tipo: ObservacaoDetalhadaTipo;
  linha: number;
  planta: number;
};
type ObservacoesRuaDraft = {
  detalhadas: ObservacaoDetalhada[];
  plantasEsquecidas: number;
  livre: string;
  estadoColeta: EstadoColetaRua;
};
type ContadorVolumeAlvo = 'quantidade' | 'cachos3';
type ParcelaStatus = 'pendente' | 'em_andamento' | 'concluida';
type ResumoParcelaSiglaDraft = {
  avaliacaoParcelaId: string;
  parcelaCodigo: string;
  siglas: Record<string, SiglaResumoParcela | null>;
};
type ResumoRegistroRua = {
  quantidade: number;
  cachos3: number;
  plantasEsquecidas: number;
  abelhas: number;
  tapios: number;
  faltaColher: boolean;
  faltaTropear: boolean;
};

const SIGLAS_RESUMO_PARCELA = [
  {
    value: 'A.C.R',
    label: 'A.C.R',
    descricao: 'Área coroada e rebaixada',
  },
  {
    value: 'A.N.C.R',
    label: 'A.N.C.R',
    descricao: 'Área não coroada e rebaixada',
  },
  {
    value: 'A.C.N.R',
    label: 'A.C.N.R',
    descricao: 'Área coroada e não rebaixada',
  },
  {
    value: 'A.N.C.N.R',
    label: 'A.N.C.N.R',
    descricao: 'Área não coroada e não rebaixada',
  },
] satisfies Array<{
  value: SiglaResumoParcela;
  label: string;
  descricao: string;
}>;

const isSiglaResumoParcela = (value: unknown): value is SiglaResumoParcela =>
  SIGLAS_RESUMO_PARCELA.some((item) => item.value === value);

function parseObservacoesString(observacoes = ''): {
  detalhadas: ObservacaoDetalhada[];
  plantasEsquecidas: number;
  livre: string;
} {
  const parts = limparMarcacoesLegadasColeta(observacoes)
    .split(' • ')
    .map((item) => item.trim())
    .filter(Boolean);

  const detalhadas: ObservacaoDetalhada[] = [];
  let plantasEsquecidas = 0;
  const livre: string[] = [];

  parts.forEach((part) => {
    const matchDetalhada = part.match(
      /^(Abelha|Abelhas|Tapio|Tapios)\s*\(linha\s*(\d+)\)\s*\(planta\s*(\d+)\)$/i,
    );
    if (matchDetalhada) {
      detalhadas.push({
        tipo: matchDetalhada[1].toLowerCase().startsWith('abelh')
          ? 'Abelha'
          : 'Tapio',
        linha: Number(matchDetalhada[2]),
        planta: Number(matchDetalhada[3]),
      });
      return;
    }

    const matchPlantas = part.match(/^Plantas esquecidas:\s*(\d+)/i);
    if (matchPlantas) {
      plantasEsquecidas = Number(matchPlantas[1]) || 0;
      return;
    }

    const matchLivre = part.match(/^Obs\.\s*(.+)$/i);
    if (matchLivre) {
      livre.push(matchLivre[1].trim());
      return;
    }

    livre.push(part);
  });

  return {
    detalhadas,
    plantasEsquecidas,
    livre: livre.join(' • '),
  };
}

function buildObservacoesString({
  detalhadas,
  plantasEsquecidas,
  livre,
}: {
  detalhadas: ObservacaoDetalhada[];
  plantasEsquecidas: number;
  livre: string;
}) {
  const parts: string[] = [];

  detalhadas.forEach((item) => {
    parts.push(`${item.tipo} (linha ${item.linha}) (planta ${item.planta})`);
  });

  if (plantasEsquecidas > 0) {
    parts.push(`Plantas esquecidas: ${plantasEsquecidas}`);
  }

  if (livre.trim()) {
    parts.push(`Obs. ${livre.trim()}`);
  }

  return parts.join(' • ');
}

const getObservacoesRuaDraftStorageKey = (avaliacaoId: string, ruaId: string) =>
  `${STORAGE_KEYS.registroRuaObservacoesDraftPrefix}:${avaliacaoId}:${ruaId}`;

const normalizeObservacoesRuaDraft = (
  raw: unknown,
): ObservacoesRuaDraft | null => {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<ObservacoesRuaDraft>;
  const detalhadas = Array.isArray(candidate.detalhadas)
    ? candidate.detalhadas
        .filter(
          (item): item is ObservacaoDetalhada =>
            Boolean(item) &&
            typeof item === 'object' &&
            OBSERVACOES_DETALHADAS.includes(
              (item as ObservacaoDetalhada).tipo as ObservacaoDetalhadaTipo,
            ) &&
            Number.isFinite(Number((item as ObservacaoDetalhada).linha)) &&
            Number.isFinite(Number((item as ObservacaoDetalhada).planta)),
        )
        .map((item) => ({
          tipo: item.tipo,
          linha: Number(item.linha),
          planta: Number(item.planta),
        }))
    : [];
  const legacyTags = Array.isArray((candidate as { tags?: unknown[] }).tags)
    ? ((candidate as { tags?: string[] }).tags || []).join(' • ')
    : '';
  const estadoColeta =
    candidate.estadoColeta === 'normal' ||
    candidate.estadoColeta === 'falta_colher' ||
    candidate.estadoColeta === 'falta_tropear'
      ? candidate.estadoColeta
      : resolverEstadoColetaRua({
          quantidade: 0,
          quantidadeCachos3: 0,
          observacoes: legacyTags,
        });

  return {
    detalhadas,
    plantasEsquecidas: Math.max(
      0,
      Number(candidate.plantasEsquecidas || 0) || 0,
    ),
    livre: String(candidate.livre || ''),
    estadoColeta,
  };
};

const loadObservacoesRuaDraft = (
  avaliacaoId: string,
  ruaId: string,
): ObservacoesRuaDraft | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(
      getObservacoesRuaDraftStorageKey(avaliacaoId, ruaId),
    );
    if (!raw) return null;
    return normalizeObservacoesRuaDraft(JSON.parse(raw));
  } catch {
    return null;
  }
};

const persistObservacoesRuaDraft = (
  avaliacaoId: string,
  ruaId: string,
  draft: ObservacoesRuaDraft,
) => {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    getObservacoesRuaDraftStorageKey(avaliacaoId, ruaId),
    JSON.stringify(draft),
  );
};

const clearObservacoesRuaDraft = (avaliacaoId: string, ruaId: string) => {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(
    getObservacoesRuaDraftStorageKey(avaliacaoId, ruaId),
  );
};

const buildObservacoesRuaDraftSnapshot = ({
  detalhadas,
  plantasEsquecidas,
  livre,
  estadoColeta,
}: ObservacoesRuaDraft): ObservacoesRuaDraft => ({
  detalhadas,
  plantasEsquecidas,
  livre,
  estadoColeta,
});

function resumirRegistroRua(
  quantidade: number,
  cachos3: number,
  observacoes = '',
): ResumoRegistroRua {
  const parsed = parseObservacoesString(observacoes);
  const apresentacao = obterApresentacaoEstadoColetaRua({
    quantidade,
    quantidadeCachos3: cachos3,
    observacoes,
  });

  return {
    quantidade: apresentacao.quantidade,
    cachos3: apresentacao.quantidadeCachos3,
    plantasEsquecidas: parsed.plantasEsquecidas,
    abelhas: parsed.detalhadas.filter((item) => item.tipo === 'Abelha').length,
    tapios: parsed.detalhadas.filter((item) => item.tipo === 'Tapio').length,
    faltaColher: apresentacao.faltaColher,
    faltaTropear: apresentacao.faltaTropear,
  };
}

const formatarTipoFalha = (value: TipoFalhaRua | null | undefined) => {
  if (value === 'linha_invalida') return 'Linha inválida';
  if (value === 'rua_com_falha') return 'Rua com falha';
  return '';
};

const formatarModoCalculo = (value: ModoCalculo) =>
  value === 'media_vizinhas' ? 'Média vizinha' : 'Manual';

const formatarNumeroRuaDisplay = (
  value: number | string | null | undefined,
) => {
  const normalized = String(value ?? '').trim();
  return normalized || '--';
};

const formatarEquipeResumoParcela = (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '--';
  return /^\d+$/.test(normalized) ? normalized.padStart(2, '0') : normalized;
};

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

    acc[formatarEquipeResumoParcela(equipe)] = sigla;
    return acc;
  }, {});
};

const getNumeroRuaFontClass = (displayValue: string) => {
  const digits = displayValue.replace(/\D/g, '').length;

  if (digits >= 4) {
    return 'text-[clamp(2.2rem,8.6vw,3.3rem)] tracking-[-0.03em]';
  }

  if (digits === 3) {
    return 'text-[clamp(2.6rem,10.6vw,4rem)] tracking-[-0.04em]';
  }

  if (digits === 2) {
    return 'text-[clamp(2.9rem,12vw,4.4rem)] tracking-[-0.05em]';
  }

  return 'text-[clamp(3.1rem,13vw,4.7rem)] tracking-[-0.06em]';
};

function RuaNumeroCard({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  const displayValue = formatarNumeroRuaDisplay(value);

  return (
    <div
      className="mx-auto flex h-[clamp(128px,30vw,150px)] w-full max-w-[148px] min-w-0 overflow-hidden rounded-[18px] border border-[var(--qc-border-strong)] bg-white shadow-[0_14px_24px_-20px_rgba(0,107,68,0.18)]"
      style={{ justifyContent: 'center', alignItems: 'center' }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden px-2 py-2.5 sm:px-3 sm:py-3"
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <p className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
          {label}
        </p>

        <div
          className="flex min-h-0 w-full flex-1 overflow-hidden"
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <span
            className={cn(
              'block max-w-full overflow-hidden whitespace-nowrap font-black leading-none tabular-nums text-[var(--qc-primary)]',
              getNumeroRuaFontClass(displayValue),
            )}
            style={{ textAlign: 'center' }}
          >
            {displayValue}
          </span>
        </div>
      </div>
    </div>
  );
}

function RuaResumoMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--qc-border)] bg-white px-3 py-2 text-center shadow-[0_10px_18px_-18px_rgba(17,33,23,0.22)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-black leading-none tabular-nums text-[var(--qc-primary)]">
        {value}
      </p>
    </div>
  );
}

function RuaResumoChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-[rgba(0,107,68,0.12)] bg-[rgba(0,107,68,0.08)] px-2.5 py-1 text-[11px] font-bold text-[var(--qc-primary)]">
      {label}: {value}
    </span>
  );
}

export function TelaRegistroLinhas() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const { permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);

  const [ruaIndex, setRuaIndex] = useState(0);
  const [quantidade, setQuantidade] = useState(0);
  const [cachos3, setCachos3] = useState(0);
  const [contadorVolumeAtivo, setContadorVolumeAtivo] =
    useState<ContadorVolumeAlvo>('cachos3');
  const [estadoColeta, setEstadoColeta] =
    useState<EstadoColetaRua>('normal');
  const [observacoesDetalhadas, setObservacoesDetalhadas] = useState<
    ObservacaoDetalhada[]
  >([]);
  const [plantasEsquecidas, setPlantasEsquecidas] = useState(0);
  const [observacaoLivre, setObservacaoLivre] = useState('');
  const [observacaoDetalhadaTipo, setObservacaoDetalhadaTipo] =
    useState<ObservacaoDetalhadaTipo | null>(null);
  const [observacaoDetalhadaLinha, setObservacaoDetalhadaLinha] = useState('');
  const [observacaoDetalhadaPlanta, setObservacaoDetalhadaPlanta] = useState('');
  const [observacoesDraftRuaId, setObservacoesDraftRuaId] = useState('');
  const [observacoesDraftDirty, setObservacoesDraftDirty] = useState(false);

  const [showObs, setShowObs] = useState(false);
  const [showAllRuas, setShowAllRuas] = useState(false);
  const [showEditRuas, setShowEditRuas] = useState(false);
  const [showInvertParcela, setShowInvertParcela] = useState(false);
  const [showResumoParcelaModal, setShowResumoParcelaModal] = useState(false);
  const [showFinalizacaoModal, setShowFinalizacaoModal] = useState(false);
  const [ultimaParcelaConcluida, setUltimaParcelaConcluida] = useState<
    string | null
  >(null);
  const [resumoParcelaDraft, setResumoParcelaDraft] =
    useState<ResumoParcelaSiglaDraft | null>(null);
  const [finalizandoDestino, setFinalizandoDestino] = useState<
    'dashboard' | 'relatorio' | null
  >(null);
  const [showRetoqueModal, setShowRetoqueModal] = useState(false);
  const [retoqueBags, setRetoqueBags] = useState('');
  const [retoqueCargas, setRetoqueCargas] = useState('');
  const [retoqueData, setRetoqueData] = useState(nowIso().slice(0, 10));
  const [retoqueObs, setRetoqueObs] = useState('');
  const [retoqueRegistrado, setRetoqueRegistrado] = useState(false);
  const [editRuaLinhaIni, setEditRuaLinhaIni] = useState('');
  const [editRuaLinhaFim, setEditRuaLinhaFim] = useState('');
  const [invertParcelaSentido, setInvertParcelaSentido] =
    useState<SentidoRuas>('inicio');
  const initializedIndexRef = useRef<string | null>(null);
  const ruaSelecionadaIdRef = useRef<string | null>(null);
  const parcelasStatusRef = useRef<Record<string, ParcelaStatus>>({});

  const { data, isFetched } = useQuery({
    queryKey: ['avaliacao', id, usuarioAtual?.id],
    queryFn: () => obterAvaliacaoDetalhada(id, usuarioAtual?.id),
    enabled: Boolean(id && usuarioAtual?.id),
  });

  useEffect(() => {
    if (isFetched && !data) {
      navigate('/dashboard', { replace: true });
    }
  }, [data, isFetched, navigate]);

  useEffect(() => {
    const status = data?.avaliacao?.status;
    if (!isFetched || !status) {
      return;
    }

    if (status !== 'draft' && status !== 'in_progress') {
      navigate(`/detalhe/${id}`, { replace: true });
    }
  }, [data?.avaliacao?.status, id, isFetched, navigate]);

  const avaliacaoTipoAtual = data?.avaliacao?.tipo || 'normal';
  const podeEditarFluxoAtual =
    avaliacaoTipoAtual === 'retoque'
      ? canOperateAssignedRetoque({
          perfil: usuarioAtual?.perfil,
          usuarioId: usuarioAtual?.id,
          responsavelId:
            data?.avaliacao?.responsavelPrincipalId || data?.avaliacao?.usuarioId,
          designadoParaId: data?.avaliacao?.retoqueDesignadoParaId,
          matrix: permissionMatrix,
        })
      : canStartEvaluation(usuarioAtual?.perfil, permissionMatrix);

  const ruas = useMemo(() => data?.ruas || [], [data]);
  const ruaAtual = ruas[ruaIndex] || null;
  const totalRuas = ruas.length;
  const modoCalculo = (data?.avaliacao?.modoCalculo || 'manual') as ModoCalculo;
  const parcelasMap = useMemo(
    () => new Map((data?.parcelas || []).map((item) => [item.id, item])),
    [data?.parcelas],
  );
  const parcelaAtual =
    (ruaAtual && parcelasMap.get(ruaAtual.avaliacaoParcelaId)) ||
    data?.parcelas[0] ||
    null;
  const equipeAtual = ruaAtual?.equipeNome || '01';
  const registrosMap = useMemo(
    () => new Map((data?.registros || []).map((item) => [item.ruaId, item])),
    [data?.registros],
  );
  const resumoRegistrosPorRua = useMemo(
    () =>
      new Map(
        (data?.registros || []).map((item) => [
          item.ruaId,
          resumirRegistroRua(
            item.quantidade,
            item.quantidadeCachos3 || 0,
            item.observacoes,
          ),
        ]),
      ),
    [data?.registros],
  );
  const ruaIdsComRegistro = useMemo(
    () => new Set((data?.registros || []).map((item) => item.ruaId)),
    [data?.registros],
  );
  const ruasComFalhaIds = useMemo(
    () =>
      new Set(
        ruas
          .filter((item) => item.tipoFalha === 'rua_com_falha' || item.tipoFalha === 'linha_invalida')
          .map((item) => item.id),
      ),
    [ruas],
  );
  const totalConcluidas = useMemo(
    () =>
      ruas.filter(
        (item) => ruaIdsComRegistro.has(item.id) || ruasComFalhaIds.has(item.id),
      ).length,
    [ruaIdsComRegistro, ruas, ruasComFalhaIds],
  );
  const ruasContexto = useMemo(() => {
    return [-2, -1, 0, 1, 2].map((offset) => {
      const index = ruaIndex + offset;
      const rua =
        index >= 0 && index < ruas.length
          ? ruas[index]
          : null;

      return {
        key: `${rua?.id || 'empty'}:${offset}`,
        index,
        offset,
        rua,
        label:
          offset === 0
            ? 'Atual'
            : offset < 0
              ? 'Anterior'
              : 'Próxima',
      };
    });
  }, [ruaIndex, ruas]);
  const parcelasStatus = useMemo(
    () =>
      (data?.parcelas || []).map((parcela) => {
        const ruasDaParcela = ruas.filter(
          (item) => item.avaliacaoParcelaId === parcela.id,
        );
        const concluidas = ruasDaParcela.filter(
          (item) => ruaIdsComRegistro.has(item.id) || ruasComFalhaIds.has(item.id),
        ).length;
        const falhas = ruasDaParcela.filter((item) => ruasComFalhaIds.has(item.id)).length;
        const status: ParcelaStatus =
          concluidas === 0
            ? 'pendente'
            : concluidas >= ruasDaParcela.length
              ? 'concluida'
              : 'em_andamento';

        return {
          parcelaId: parcela.id,
          parcelaCodigo: parcela.parcelaCodigo,
          status,
          total: ruasDaParcela.length,
          concluidas,
          falhas,
        };
      }),
    [data?.parcelas, ruaIdsComRegistro, ruas, ruasComFalhaIds],
  );
  const statusParcelaAtual =
    parcelasStatus.find((item) => item.parcelaId === parcelaAtual?.id) || null;
  const ruasParcelaAtual = useMemo(() => {
    if (!ruaAtual) return [];
    return ruas.filter(
      (item) => item.avaliacaoParcelaId === ruaAtual.avaliacaoParcelaId,
    );
  }, [ruaAtual, ruas]);
  const sentidoParcelaAtual = useMemo<SentidoRuas>(() => {
    if (ruasParcelaAtual.length < 2) return 'inicio';
    return ruasParcelaAtual[0].linhaInicial > ruasParcelaAtual[ruasParcelaAtual.length - 1].linhaInicial
      ? 'fim'
      : 'inicio';
  }, [ruasParcelaAtual]);

  const registroExistente = useMemo(() => {
    if (!ruaAtual || !data?.registros) return null;
    return data.registros.find((item) => item.ruaId === ruaAtual.id) || null;
  }, [data?.registros, ruaAtual]);
  const mediaRuasVizinhas = useMemo(() => {
    if (!ruaAtual) return null;

    let anterior: { quantidade: number; quantidadeCachos3: number } | null = null;
    for (let index = ruaIndex - 1; index >= 0; index -= 1) {
      const rua = ruas[index];
      if (!rua || ruasComFalhaIds.has(rua.id)) continue;
      const registro = registrosMap.get(rua.id);
      if (
        registro &&
        resolverEstadoColetaRua({
          quantidade: registro.quantidade,
          quantidadeCachos3: registro.quantidadeCachos3,
          observacoes: registro.observacoes,
        }) === 'normal'
      ) {
        anterior = registro;
        break;
      }
    }

    let posterior: { quantidade: number; quantidadeCachos3: number } | null = null;
    for (let index = ruaIndex + 1; index < ruas.length; index += 1) {
      const rua = ruas[index];
      if (!rua || ruasComFalhaIds.has(rua.id)) continue;
      const registro = registrosMap.get(rua.id);
      if (
        registro &&
        resolverEstadoColetaRua({
          quantidade: registro.quantidade,
          quantidadeCachos3: registro.quantidadeCachos3,
          observacoes: registro.observacoes,
        }) === 'normal'
      ) {
        posterior = registro;
        break;
      }
    }

    if (!anterior || !posterior) {
      return null;
    }

    return {
      quantidade: Math.round((anterior.quantidade + posterior.quantidade) / 2),
      cachos3: Math.round(
        ((anterior.quantidadeCachos3 || 0) + (posterior.quantidadeCachos3 || 0)) / 2,
      ),
    };
  }, [registrosMap, ruaAtual, ruaIndex, ruas, ruasComFalhaIds]);
  const observacoesResumo = useMemo(
    () =>
      buildObservacoesString({
        detalhadas: observacoesDetalhadas,
        plantasEsquecidas,
        livre: observacaoLivre,
      }),
    [observacaoLivre, observacoesDetalhadas, plantasEsquecidas],
  );
  const faltaColherMarcada = estadoColeta === 'falta_colher';
  const faltaTropearMarcada = estadoColeta === 'falta_tropear';
  const siglaCacho = faltaColherMarcada ? 'F.C' : null;
  const siglaCocos = faltaColherMarcada ? '--' : faltaTropearMarcada ? 'F.T' : null;

  const persistCurrentObservacoesDraft = () => {
    if (!id || !observacoesDraftRuaId || !observacoesDraftDirty) return;

    persistObservacoesRuaDraft(id, observacoesDraftRuaId, buildObservacoesRuaDraftSnapshot({
      detalhadas: observacoesDetalhadas,
      plantasEsquecidas,
      livre: observacaoLivre,
      estadoColeta,
    }));
  };

  const clearCurrentObservacoesDraft = (ruaId = observacoesDraftRuaId) => {
    if (!id || !ruaId) return;

    clearObservacoesRuaDraft(id, ruaId);
    if (ruaId === observacoesDraftRuaId) {
      setObservacoesDraftDirty(false);
    }
  };

  const navegarParaRua = (nextIndex: number) => {
    persistCurrentObservacoesDraft();
    const nextRua = ruas[nextIndex];
    if (nextRua) {
      ruaSelecionadaIdRef.current = nextRua.id;
    }
    setRuaIndex(nextIndex);
  };

  const obterProximaRuaPendente = (
    currentIndex: number,
    completedIds = ruaIdsComRegistro,
    failedIds = ruasComFalhaIds,
  ) => {
    if (ruas.length === 0) return null;

    const isPendente = (index: number) => {
      const rua = ruas[index];
      if (!rua) return false;
      return !completedIds.has(rua.id) && !failedIds.has(rua.id);
    };

    for (let index = currentIndex + 1; index < ruas.length; index += 1) {
      if (isPendente(index)) return index;
    }

    for (let index = 0; index < currentIndex; index += 1) {
      if (isPendente(index)) return index;
    }

    return null;
  };

  const obterRuaAnteriorValida = (currentIndex: number) => {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const rua = ruas[index];
      if (rua && !ruasComFalhaIds.has(rua.id)) {
        return index;
      }
    }
    return null;
  };

  useEffect(() => {
    if (ruaAtual?.id) {
      ruaSelecionadaIdRef.current = ruaAtual.id;
    }
  }, [ruaAtual?.id]);

  useEffect(() => {
    if (!ruas.length || !ruaSelecionadaIdRef.current) return;

    const selectedIndex = ruas.findIndex(
      (item) => item.id === ruaSelecionadaIdRef.current,
    );
    if (selectedIndex >= 0 && selectedIndex !== ruaIndex) {
      setRuaIndex(selectedIndex);
    }
  }, [ruaIndex, ruas]);

  useEffect(() => {
    if (ruaIndex > 0 && ruaIndex > totalRuas - 1) {
      setRuaIndex(Math.max(totalRuas - 1, 0));
    }
  }, [ruaIndex, totalRuas]);

  useEffect(() => {
    if (!ruas.length) return;

    const currentKey = `${id}:${ruas.length}`;
    if (initializedIndexRef.current === currentKey) {
      return;
    }

    initializedIndexRef.current = currentKey;
    const primeiroPendente = obterProximaRuaPendente(-1);
    if (primeiroPendente != null) {
      setRuaIndex(primeiroPendente);
    }
  }, [id, ruas.length, ruasComFalhaIds, ruaIdsComRegistro]);

  useEffect(() => {
    if (!parcelasStatus.length) return;

    const nextStatusMap = parcelasStatus.reduce<Record<string, ParcelaStatus>>(
      (acc, item) => {
        acc[item.parcelaId] = item.status;
        return acc;
      },
      {},
    );

    parcelasStatus.forEach((item) => {
      const previousStatus = parcelasStatusRef.current[item.parcelaId];
      if (previousStatus && previousStatus !== 'concluida' && item.status === 'concluida') {
        setUltimaParcelaConcluida(item.parcelaCodigo);

        const draft = montarResumoParcelaDraft(item.parcelaId);
        const temSiglaPendente =
          draft &&
          Object.values(draft.siglas).some((siglaAtual) => siglaAtual == null);

        if (temSiglaPendente) {
          setShowFinalizacaoModal(false);
          abrirResumoParcelaModal(item.parcelaId);
        }
      }
    });

    parcelasStatusRef.current = nextStatusMap;
  }, [parcelasStatus]);

  useEffect(() => {
    if (!ruaAtual?.id) {
      setQuantidade(0);
      setCachos3(0);
      setEstadoColeta('normal');
      setObservacoesDetalhadas([]);
      setPlantasEsquecidas(0);
      setObservacaoLivre('');
      setObservacoesDraftRuaId('');
      setObservacoesDraftDirty(false);
      setObservacaoDetalhadaTipo(null);
      setObservacaoDetalhadaLinha('');
      setObservacaoDetalhadaPlanta('');
      return;
    }

    const draft = loadObservacoesRuaDraft(id, ruaAtual.id);
    const parsed = parseObservacoesString(registroExistente?.observacoes || '');
    const source = draft || {
      detalhadas: parsed.detalhadas,
      plantasEsquecidas: parsed.plantasEsquecidas,
      livre: parsed.livre,
      estadoColeta: resolverEstadoColetaRua({
        quantidade: registroExistente?.quantidade,
        quantidadeCachos3: registroExistente?.quantidadeCachos3,
        observacoes: registroExistente?.observacoes,
      }),
    };

    setQuantidade(normalizarContagemRua(registroExistente?.quantidade));
    setCachos3(normalizarContagemRua(registroExistente?.quantidadeCachos3));
    setEstadoColeta(source.estadoColeta);
    setObservacoesDetalhadas(source.detalhadas);
    setPlantasEsquecidas(source.plantasEsquecidas);
    setObservacaoLivre(source.livre);
    setObservacoesDraftRuaId(ruaAtual.id);
    setObservacoesDraftDirty(Boolean(draft));
    setObservacaoDetalhadaTipo(null);
    setObservacaoDetalhadaLinha('');
    setObservacaoDetalhadaPlanta('');
  }, [id, registroExistente, ruaAtual?.id]);

  useEffect(() => {
    persistCurrentObservacoesDraft();
  }, [
    id,
    observacaoLivre,
    observacoesDetalhadas,
    observacoesDraftDirty,
    observacoesDraftRuaId,
    estadoColeta,
    plantasEsquecidas,
  ]);

  useEffect(() => {
    setContadorVolumeAtivo('cachos3');
  }, [ruaAtual?.id]);

  useEffect(() => {
    setRetoqueRegistrado(Boolean(data?.retoque));
  }, [data?.avaliacao?.id, data?.retoque]);

  useEffect(() => {
    setEditRuaLinhaIni(String(ruaAtual?.linhaInicial || ''));
    setEditRuaLinhaFim(String(ruaAtual?.linhaFinal || ''));
  }, [ruaAtual?.id, ruaAtual?.linhaFinal, ruaAtual?.linhaInicial]);

  useEffect(() => {
    setInvertParcelaSentido(sentidoParcelaAtual);
  }, [parcelaAtual?.id, sentidoParcelaAtual]);

  useEffect(() => {
    const handleHardwareVolume = (event: Event) => {
      if (
        showObs ||
        showAllRuas ||
        showEditRuas ||
        showInvertParcela ||
        showFinalizacaoModal
      ) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const tagName = activeElement?.tagName;
      const isOtherFormField =
        activeElement?.getAttribute('data-counter-input') !== 'true' &&
        (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          activeElement?.isContentEditable
        );

      if (isOtherFormField) return;

      const hardwareEvent = event as Event & { button?: 'up' | 'down' };
      const delta =
        hardwareEvent.button === 'up'
          ? 1
          : hardwareEvent.button === 'down'
            ? -1
            : 0;

      if (delta === 0) return;

      if (contadorVolumeAtivo === 'quantidade') {
        if (faltaTropearMarcada || faltaColherMarcada) return;
        setQuantidade((current) =>
          Math.max(COUNTER_MIN, Math.min(COUNTER_MAX, current + delta)),
        );
        return;
      }

      if (faltaColherMarcada) return;
      setCachos3((current) =>
        Math.max(COUNTER_MIN, Math.min(COUNTER_MAX, current + delta)),
      );
    };

    window.addEventListener(HARDWARE_VOLUME_EVENT, handleHardwareVolume as EventListener);
    return () => {
      window.removeEventListener(
        HARDWARE_VOLUME_EVENT,
        handleHardwareVolume as EventListener,
      );
    };
  }, [
    contadorVolumeAtivo,
    faltaColherMarcada,
    faltaTropearMarcada,
    showAllRuas,
    showEditRuas,
    showFinalizacaoModal,
    showInvertParcela,
    showObs,
  ]);

  const atualizarEstadoColeta = (nextEstado: EstadoColetaRua) => {
    setObservacoesDraftDirty(true);
    setEstadoColeta(nextEstado);

    if (id && ruaAtual?.id) {
      persistObservacoesRuaDraft(
        id,
        ruaAtual.id,
        buildObservacoesRuaDraftSnapshot({
          detalhadas: observacoesDetalhadas,
          plantasEsquecidas,
          livre: observacaoLivre,
          estadoColeta: nextEstado,
        }),
      );
      setObservacoesDraftRuaId(ruaAtual.id);
    }

    if (nextEstado === 'falta_colher') {
      setQuantidade(0);
      setCachos3(0);
      return;
    }

    if (nextEstado === 'falta_tropear') {
      setQuantidade(0);
    }
  };

  const abrirObservacaoDetalhada = (tipo: ObservacaoDetalhadaTipo) => {
    setObservacaoDetalhadaTipo(tipo);
    setObservacaoDetalhadaLinha(String(ruaAtual?.linhaInicial || ''));
    setObservacaoDetalhadaPlanta('');
  };

  const adicionarObservacaoDetalhada = () => {
    if (
      !observacaoDetalhadaTipo ||
      !observacaoDetalhadaLinha ||
      !observacaoDetalhadaPlanta
    ) {
      return;
    }

    const next: ObservacaoDetalhada = {
      tipo: observacaoDetalhadaTipo,
      linha: Number(observacaoDetalhadaLinha),
      planta: Number(observacaoDetalhadaPlanta),
    };

    setObservacoesDetalhadas((current) => {
      const exists = current.some(
        (item) =>
          item.tipo === next.tipo &&
          item.linha === next.linha &&
          item.planta === next.planta,
      );
      return exists ? current : [...current, next];
    });

    setObservacoesDraftDirty(true);
    setObservacaoDetalhadaTipo(null);
    setObservacaoDetalhadaLinha('');
    setObservacaoDetalhadaPlanta('');
  };

  const removerObservacaoDetalhada = (targetIndex: number) => {
    setObservacoesDraftDirty(true);
    setObservacoesDetalhadas((current) =>
      current.filter((_, index) => index !== targetIndex),
    );
  };

  const saveMutation = useMutation({
    mutationFn: async ({ next = true }: { next?: boolean } = {}) => {
      if (!ruaAtual) return { next };

      const completedIds = new Set(ruaIdsComRegistro);
      completedIds.add(ruaAtual.id);
      const failedIds = new Set(ruasComFalhaIds);
      failedIds.delete(ruaAtual.id);
      const coletaSerializada = serializarEstadoColetaRua({
        estado: estadoColeta,
        quantidade,
        quantidadeCachos3: cachos3,
      });

      await salvarRegistroColeta({
        avaliacaoId: id,
        parcelaId: ruaAtual.parcelaId,
        ruaId: ruaAtual.id,
        colaboradorId: usuarioAtual?.id || '',
        quantidade: coletaSerializada.quantidade,
        quantidadeCachos3: coletaSerializada.quantidadeCachos3,
        observacoes: observacoesResumo,
      });

      return {
        next,
        nextIndex: next ? obterProximaRuaPendente(ruaIndex, completedIds, failedIds) : null,
      };
    },
    onSuccess: async (result) => {
      clearCurrentObservacoesDraft(ruaAtual?.id || '');
      await queryClient.invalidateQueries({ queryKey: ['avaliacao', id] });
      if (result?.next && typeof result.nextIndex === 'number') {
        const nextRua = ruas[result.nextIndex];
        if (nextRua) {
          ruaSelecionadaIdRef.current = nextRua.id;
        }
        setRuaIndex(result.nextIndex);
        return;
      }

      if (result?.next) {
        setShowFinalizacaoModal(true);
      }
    },
  });

  const limparFalhaMutation = useMutation({
    mutationFn: async () => {
      if (!ruaAtual) return null;
      return limparFalhaRua({
        avaliacaoId: id,
        ruaId: ruaAtual.id,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['avaliacao', id] });
    },
  });

  const sincronizarParcelaAtiva = async (
    avaliacaoParcelaId: string,
    ruasAtivas: typeof ruas,
  ) => {
    const parcela = parcelasMap.get(avaliacaoParcelaId);
    if (!parcela) return;

    const ruasDaParcela = ruasAtivas.filter(
      (item) => item.avaliacaoParcelaId === avaliacaoParcelaId,
    );

    if (ruasDaParcela.length === 0) {
      return;
    }

    const linhaInicial = Math.min(...ruasDaParcela.map((item) => item.linhaInicial));
    const linhaFinal = Math.max(...ruasDaParcela.map((item) => item.linhaFinal));

    if (
      parcela.linhaInicial === linhaInicial &&
      parcela.linhaFinal === linhaFinal
    ) {
      return;
    }

    await saveEntity('avaliacaoParcelas', {
      ...parcela,
      linhaInicial,
      linhaFinal,
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: parcela.versao + 1,
    });
  };

  function montarResumoParcelaDraft(
    avaliacaoParcelaId: string,
  ): ResumoParcelaSiglaDraft | null {
    const parcela = parcelasMap.get(avaliacaoParcelaId);
    if (!parcela) {
      return null;
    }

    const equipes = Array.from(
      new Set(
        ruas
          .filter((item) => item.avaliacaoParcelaId === avaliacaoParcelaId)
          .map((item) => formatarEquipeResumoParcela(item.equipeNome))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

    if (equipes.length === 0) {
      return null;
    }

    const siglasExistentes = normalizarSiglasResumoParcela(parcela.siglasResumo);

    return {
      avaliacaoParcelaId,
      parcelaCodigo: parcela.parcelaCodigo,
      siglas: equipes.reduce<Record<string, SiglaResumoParcela | null>>(
        (acc, equipe) => {
          acc[equipe] = siglasExistentes[equipe] || null;
          return acc;
        },
        {},
      ),
    };
  }

  function abrirResumoParcelaModal(avaliacaoParcelaId: string) {
    const draft = montarResumoParcelaDraft(avaliacaoParcelaId);
    if (!draft) {
      return;
    }

    setResumoParcelaDraft(draft);
    setShowResumoParcelaModal(true);
  }

  function obterParcelaConcluidaComSiglaPendente() {
    for (const item of parcelasStatus) {
      if (item.status !== 'concluida') {
        continue;
      }

      const draft = montarResumoParcelaDraft(item.parcelaId);
      const temSiglaPendente =
        draft &&
        Object.values(draft.siglas).some((siglaAtual) => siglaAtual == null);

      if (temSiglaPendente) {
        return item;
      }
    }

    return null;
  }

  useEffect(() => {
    if (showResumoParcelaModal) {
      return;
    }

    const parcelaPendente = obterParcelaConcluidaComSiglaPendente();
    if (!parcelaPendente) {
      return;
    }

    setUltimaParcelaConcluida(parcelaPendente.parcelaCodigo);
    setShowFinalizacaoModal(false);
    abrirResumoParcelaModal(parcelaPendente.parcelaId);
  }, [parcelasStatus, showResumoParcelaModal]);

  const saveResumoParcelaMutation = useMutation({
    mutationFn: async () => {
      if (!resumoParcelaDraft) {
        return null;
      }

      const parcela = parcelasMap.get(resumoParcelaDraft.avaliacaoParcelaId);
      if (!parcela) {
        throw new Error('Parcela não encontrada para salvar a sigla final.');
      }

      const siglas = Object.entries(resumoParcelaDraft.siglas).reduce<
        Partial<Record<string, SiglaResumoParcela>>
      >((acc, [equipe, sigla]) => {
        if (sigla) {
          acc[equipe] = sigla;
        }
        return acc;
      }, {});

      await saveEntity('avaliacaoParcelas', {
        ...parcela,
        siglasResumo: siglas,
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync',
        versao: parcela.versao + 1,
      });

      return resumoParcelaDraft.avaliacaoParcelaId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['avaliacao', id] });
      setShowResumoParcelaModal(false);
      setResumoParcelaDraft(null);

      if (totalRuas > 0 && totalConcluidas >= totalRuas) {
        setShowFinalizacaoModal(true);
      }
    },
  });

  const applyRuaAtualMutation = useMutation({
    mutationFn: async () => {
      if (!ruaAtual) {
        return { cancelled: true };
      }

      const linhaInicial = Number(editRuaLinhaIni);
      const linhaFinal = Number(editRuaLinhaFim);

      if (
        !Number.isFinite(linhaInicial) ||
        !Number.isFinite(linhaFinal) ||
        linhaInicial < 1 ||
        linhaFinal > 136 ||
        linhaFinal <= linhaInicial
      ) {
        throw new Error('Informe uma faixa válida para a rua atual.');
      }

      const ruasDaParcelaAtual = ruas.filter(
        (item) => item.avaliacaoParcelaId === ruaAtual.avaliacaoParcelaId,
      );
      const conflitaComOutraRua = ruasDaParcelaAtual.some(
        (item) =>
          item.id !== ruaAtual.id &&
          linhaInicial <= item.linhaFinal &&
          linhaFinal >= item.linhaInicial,
      );
      if (conflitaComOutraRua) {
        throw new Error('A faixa informada conflita com outra rua desta parcela.');
      }

      const alinhamentoTipo = inferirAlinhamentoTipoPorLinha(
        linhaInicial,
        ruaAtual.alinhamentoTipo,
      );
      const faixaMudou =
        linhaInicial !== ruaAtual.linhaInicial ||
        linhaFinal !== ruaAtual.linhaFinal ||
        alinhamentoTipo !== ruaAtual.alinhamentoTipo;

      if (!faixaMudou) {
        return { cancelled: true };
      }

      if (
        faixaMudou &&
        registroExistente &&
        !confirm(
          'Esta rua já possui registro. Atualizar apenas a rua atual e manter os dados lançados?',
        )
      ) {
        return { cancelled: true };
      }

      const updates = new Map<string, (typeof ruas)[number]>();
      const ruaAtualizada = {
        ...ruaAtual,
        linhaInicial,
        linhaFinal,
        alinhamentoTipo,
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync' as const,
        versao: ruaAtual.versao + 1,
      };
      await saveEntity('avaliacaoRuas', ruaAtualizada);
      updates.set(ruaAtual.id, ruaAtualizada);

      await sincronizarParcelaAtiva(
        ruaAtual.avaliacaoParcelaId,
        ruas.map((item) => updates.get(item.id) || item),
      );

      return { cancelled: false };
    },
    onSuccess: async (result) => {
      if (!result || result.cancelled) return;

      ruaSelecionadaIdRef.current = ruaAtual?.id || null;
      setShowEditRuas(false);
      await queryClient.invalidateQueries({ queryKey: ['avaliacao', id] });
    },
    onError: (error) => {
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a rua atual.',
      );
    },
  });

  const inverterParcelaMutation = useMutation({
    mutationFn: async () => {
      if (!ruaAtual || !parcelaAtual || ruasParcelaAtual.length < 2) {
        return { cancelled: true };
      }

      if (invertParcelaSentido === sentidoParcelaAtual) {
        return { cancelled: true };
      }

      for (const rua of ruasParcelaAtual) {
        if (rua.sentidoRuas === invertParcelaSentido) continue;

        await saveEntity('avaliacaoRuas', {
          ...rua,
          sentidoRuas: invertParcelaSentido,
          atualizadoEm: nowIso(),
          syncStatus: 'pending_sync' as const,
          versao: rua.versao + 1,
        });
      }

      return { cancelled: false };
    },
    onSuccess: async (result) => {
      if (!result || result.cancelled) return;

      ruaSelecionadaIdRef.current = ruaAtual?.id || null;
      setShowInvertParcela(false);
      await queryClient.invalidateQueries({ queryKey: ['avaliacao', id] });
    },
    onError: (error) => {
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível inverter a ordem da parcela atual.',
      );
    },
  });

  const handleFinalizar = async () => {
    const parcelaPendente = obterParcelaConcluidaComSiglaPendente();
    if (parcelaPendente) {
      setUltimaParcelaConcluida(parcelaPendente.parcelaCodigo);
      setShowFinalizacaoModal(false);
      abrirResumoParcelaModal(parcelaPendente.parcelaId);
      alert(
        `Selecione a sigla final da parcela ${parcelaPendente.parcelaCodigo} antes de finalizar a avaliação.`,
      );
      return;
    }

    if (!confirm('Deseja finalizar esta avaliação?')) return;
    await saveMutation.mutateAsync({ next: false });
    setShowFinalizacaoModal(true);
  };

  const handleNextRua = async () => {
    await saveMutation.mutateAsync({ next: true });
  };

  const handlePrevRua = () => {
    const previousIndex = obterRuaAnteriorValida(ruaIndex);
    if (previousIndex != null) {
      navegarParaRua(previousIndex);
      return;
    }

    navegarParaRua(0);
  };

  const aplicarMediaVizinhas = () => {
    if (!mediaRuasVizinhas) return;
    setEstadoColeta('normal');
    setQuantidade(mediaRuasVizinhas.quantidade);
    setCachos3(mediaRuasVizinhas.cachos3);
  };

  const concluirColeta = async (destino: 'dashboard' | 'relatorio') => {
    const parcelaPendente = obterParcelaConcluidaComSiglaPendente();
    if (parcelaPendente) {
      setUltimaParcelaConcluida(parcelaPendente.parcelaCodigo);
      setShowFinalizacaoModal(false);
      abrirResumoParcelaModal(parcelaPendente.parcelaId);
      alert(
        `Selecione a sigla final da parcela ${parcelaPendente.parcelaCodigo} antes de encerrar a coleta.`,
      );
      return;
    }

    try {
      if (data?.avaliacao?.tipo === 'retoque' && !data?.retoque && !retoqueRegistrado) {
        setShowRetoqueModal(true);
        setFinalizandoDestino(destino);
        return;
      }
      setFinalizandoDestino(destino);
      await finalizarAvaliacao(id, usuarioAtual?.id);
      await queryClient.invalidateQueries();

      if (destino === 'relatorio') {
        navigate('/relatorios', {
          state: { dataFiltro: data?.avaliacao?.dataAvaliacao || undefined },
        });
        return;
      }

      navigate('/dashboard');
    } finally {
      setFinalizandoDestino(null);
      setShowFinalizacaoModal(false);
    }
  };

  const salvarRetoqueEFinalizar = async () => {
    const responsavelId =
      data?.participantes.find(
        (item) => normalizePapelAvaliacao(item.papel) === 'responsavel_principal',
      )?.colaboradorId || '';

    if (!responsavelId) {
      alert('Defina um responsável antes de finalizar o retoque.');
      return;
    }

    const bags = Number(retoqueBags || 0);
    const cargas = Number(retoqueCargas || 0);
    if (!Number.isFinite(bags)) {
      alert('Quantidade de bags inválida.');
      return;
    }
    if (!Number.isFinite(cargas)) {
      alert('Quantidade de cargas inválida.');
      return;
    }
    if (bags <= 0 && cargas <= 0) {
      alert('Informe a quantidade de bags ou cargas.');
      return;
    }
    if (!retoqueData) {
      alert('Informe a data do retoque.');
      return;
    }

    await registrarRetoque({
      avaliacaoId: id,
      quantidadeBags: Math.max(0, bags),
      quantidadeCargas: Math.max(0, cargas),
      dataRetoque: retoqueData,
      observacao: retoqueObs,
      responsavelId,
      finalizadoPorId: usuarioAtual?.id,
    });

    setRetoqueRegistrado(true);
    setShowRetoqueModal(false);
    await concluirColeta(finalizandoDestino || 'dashboard');
  };

  if (isFetched && data && !podeEditarFluxoAtual) {
    return (
      <LayoutMobile
        title="Registro"
        subtitle="Acesso restrito"
        onBack={() => navigate('/dashboard')}
      >
        <AccessDeniedCard description="A edição deste fluxo de avaliação foi bloqueada para o seu perfil. Se necessário, o administrador pode liberar essa função nas configurações." />
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title={parcelaAtual?.parcelaCodigo || data?.avaliacao?.parcelaCodigo || 'Registro'}
      subtitle={`Equipe ${equipeAtual}`}
      onBack={() => navigate('/dashboard')}
    >
      <div className="stack-lg">
        <Dialog open={showRetoqueModal} onOpenChange={setShowRetoqueModal}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Finalização do retoque</DialogTitle>
            </DialogHeader>
            <div className="stack-md">
              <p className="text-sm text-[var(--qc-text-muted)]">
                Informe os dados obrigatórios do retoque antes de finalizar.
              </p>
              <Input
                type="date"
                value={retoqueData}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setRetoqueData(event.target.value)
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Bags"
                  value={retoqueBags}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setRetoqueBags(event.target.value)
                  }
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Cargas"
                  value={retoqueCargas}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setRetoqueCargas(event.target.value)
                  }
                />
              </div>
              <Textarea
                rows={3}
                placeholder="Observação do retoque (opcional)"
                value={retoqueObs}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setRetoqueObs(event.target.value)
                }
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRetoqueModal(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarRetoqueEFinalizar}>Salvar e finalizar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Progresso
                </p>
                <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                  {totalConcluidas}/{totalRuas} ruas concluídas
                </p>
              </div>

              <Badge className="border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] px-3 py-1.5 text-xs font-black tracking-[0.14em] text-[var(--qc-primary)]">
                {totalConcluidas}/{totalRuas} ruas
              </Badge>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--qc-surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--qc-primary)] transition-all duration-500"
                style={{
                  width: `${
                    totalRuas > 0 ? (totalConcluidas / totalRuas) * 100 : 0
                  }%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        {ultimaParcelaConcluida ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Parcela concluída
                </p>
                <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                  A parcela {ultimaParcelaConcluida} foi finalizada e o fluxo seguiu para a próxima etapa válida.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl px-4 font-bold"
                onClick={() => setUltimaParcelaConcluida(null)}
              >
                Fechar
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                Status das Parcelas
              </p>
              <Badge variant="slate">{parcelasStatus.length} parcela(s)</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {parcelasStatus.map((item) => (
                <Badge
                  key={item.parcelaId}
                  variant={
                    item.status === 'concluida'
                      ? 'emerald'
                      : item.status === 'em_andamento'
                        ? 'amber'
                        : 'amber'
                  }
                >
                  {item.parcelaCodigo} •{' '}
                  {item.status === 'concluida'
                    ? 'concluída'
                    : item.status === 'em_andamento'
                      ? 'em andamento'
                      : 'pendente'}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card overflow-hidden border-none shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[1.65rem] font-black tracking-tight text-[var(--qc-text)]">
                  Rua Atual
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Linhas derivadas das ruas programadas.
                </p>
              </div>

              <Button
                variant="outline"
                className="h-11 rounded-[16px] px-4 font-bold"
                onClick={() => setShowAllRuas(true)}
              >
                <ListChecks className="h-4 w-4" />
                Ver todas
              </Button>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-12 w-full rounded-[18px] text-base font-bold"
                onClick={() => setShowEditRuas(true)}
              >
                <PencilLine className="h-5 w-5" />
                Editar rua atual
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full rounded-[18px] text-base font-bold"
                onClick={() => navigate(`/avaliacoes/${id}/editar`)}
              >
                Editar programação completa
              </Button>
            </div>

            <Button
              variant="outline"
              className="mt-2.5 h-11 w-full rounded-[18px] font-bold"
              disabled={!ruaAtual || ruasParcelaAtual.length < 2}
              onClick={() => setShowInvertParcela(true)}
            >
              Inverter ordem da parcela atual
            </Button>

            <div className="mt-4 overflow-hidden rounded-[22px] border border-[var(--qc-border-strong)] bg-[linear-gradient(135deg,rgba(210,231,211,0.92),rgba(255,255,255,0.98))] p-4 shadow-[0_18px_30px_-24px_rgba(0,107,68,0.16)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.26em] text-[var(--qc-secondary)]">
                    Rua Atual
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    Faixa ativa da coleta para esta etapa.
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {parcelaAtual ? (
                      <Badge variant="emerald">Parcela {parcelaAtual.parcelaCodigo}</Badge>
                    ) : null}
                    <Badge variant="slate">Equipe {equipeAtual}</Badge>
                    <Badge variant="slate">{formatarModoCalculo(modoCalculo)}</Badge>
                    {statusParcelaAtual ? (
                      <Badge
                        variant={
                          statusParcelaAtual.status === 'concluida'
                            ? 'emerald'
                            : statusParcelaAtual.status === 'em_andamento'
                              ? 'amber'
                              : 'amber'
                        }
                      >
                        {statusParcelaAtual.status === 'concluida'
                          ? 'Parcela concluída'
                          : statusParcelaAtual.status === 'em_andamento'
                            ? 'Parcela em andamento'
                            : 'Parcela pendente'}
                      </Badge>
                    ) : null}
                    {ruaAtual?.tipoFalha ? (
                      <Badge variant="red">{formatarTipoFalha(ruaAtual.tipoFalha)}</Badge>
                    ) : null}
                  </div>
                </div>

                <Badge className="border-[var(--qc-border-strong)] bg-white px-3 py-1 text-[11px] font-black tracking-[0.14em] text-[var(--qc-primary)]">
                  {Math.min(ruaIndex + 1, totalRuas || 1)}/{totalRuas || 0}
                </Badge>
              </div>

              <div className="mx-auto mt-4 grid w-full max-w-[22rem] grid-cols-[minmax(0,1fr),clamp(52px,16vw,64px),minmax(0,1fr)] items-center justify-items-center gap-3">
                <RuaNumeroCard label="Início" value={ruaAtual?.linhaInicial} />

                <div className="flex h-[clamp(52px,16vw,64px)] w-[clamp(52px,16vw,64px)] items-center justify-center rounded-[18px] border border-[var(--qc-border-strong)] bg-[var(--qc-primary)] text-[clamp(1.6rem,6vw,2rem)] font-black text-white shadow-[0_14px_24px_-20px_rgba(0,107,68,0.36)]">
                  →
                </div>

                <RuaNumeroCard label="Fim" value={ruaAtual?.linhaFinal} />
              </div>

              {ruasContexto.length > 0 ? (
                <div className="mx-auto mt-3 w-full max-w-[28rem] overflow-hidden">
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {ruasContexto.map(({ key, rua, index, label, offset }) => {
                    const ativa = offset === 0;
                    const vazia = !rua;

                    return (
                      <div
                        key={key}
                        className={cn(
                          'flex min-h-[58px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[16px] border px-1.5 py-2 text-center',
                          ativa
                            ? 'border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] text-[var(--qc-primary)]'
                            : vazia
                              ? 'border-dashed border-[var(--qc-border)] bg-white/55 text-[var(--qc-text-muted)] opacity-55'
                              : 'border-[var(--qc-border)] bg-white text-[var(--qc-secondary)]',
                        )}
                      >
                        <p className="text-[8px] font-extrabold uppercase leading-tight tracking-[0.06em] sm:text-[9px] sm:tracking-[0.08em]">
                          {label}
                        </p>
                        {rua ? (
                          <button
                            type="button"
                            className="mt-1 block w-full text-center text-[10px] font-black leading-tight tabular-nums sm:text-sm"
                            onClick={() => navegarParaRua(index)}
                          >
                            {rua.linhaInicial}→{rua.linhaFinal}
                          </button>
                        ) : (
                          <p className="mt-1 text-[10px] font-black leading-tight tabular-nums sm:text-sm">
                            --
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
              ) : null}
            </div>

            <Button
              variant="outline"
              className="mt-3 h-12 w-full rounded-[18px] text-base font-bold"
              onClick={handlePrevRua}
              disabled={ruaIndex === 0}
            >
              Rua anterior
            </Button>
          </CardContent>
        </Card>

        {modoCalculo === 'media_vizinhas' ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Média das ruas vizinhas
                </p>
                <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                  {mediaRuasVizinhas
                    ? `Sugestão atual: ${String(mediaRuasVizinhas.quantidade).padStart(2, '0')} cocos e ${String(mediaRuasVizinhas.cachos3).padStart(2, '0')} cachos.`
                    : 'Disponível quando a rua anterior e a posterior já possuem dados válidos.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl px-4 font-bold"
                disabled={!mediaRuasVizinhas}
                onClick={aplicarMediaVizinhas}
              >
                Aplicar média
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {ruaAtual?.tipoFalha ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Rua marcada como falha
                </p>
                <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                  {formatarTipoFalha(ruaAtual.tipoFalha)}. Esta rua não entra no cálculo nem no relatório.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl px-4 font-bold"
                disabled={limparFalhaMutation.isPending}
                onClick={() => limparFalhaMutation.mutate()}
              >
                Remover falha
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <CounterInput
            label="Cacho"
            value={cachos3}
            onChange={setCachos3}
            onInteract={() => setContadorVolumeAtivo('cachos3')}
            disabled={faltaColherMarcada}
            displayOverride={siglaCacho}
            color="emerald"
            compact
            centerLabel
            padWithZero
          />
          <CounterInput
            label="Cocos no Chão"
            value={quantidade}
            onChange={setQuantidade}
            onInteract={() => setContadorVolumeAtivo('quantidade')}
            disabled={faltaTropearMarcada || faltaColherMarcada}
            displayOverride={siglaCocos}
            color="amber"
            compact
            centerLabel
            padWithZero
          />
        </div>

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Status da coleta
                </p>
                <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                  Use apenas o estado que representa a rua atual. As observações ficam só para
                  detalhes reais.
                </p>
              </div>
              <Badge variant={estadoColeta === 'normal' ? 'emerald' : 'slate'}>
                {estadoColeta === 'falta_colher'
                  ? 'Sem colheita'
                  : estadoColeta === 'falta_tropear'
                    ? 'Falta tropear'
                    : 'Colhida'}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={estadoColeta === 'normal' ? 'default' : 'outline'}
                className="h-12 rounded-2xl font-bold"
                onClick={() => atualizarEstadoColeta('normal')}
              >
                Colhida
              </Button>
              <Button
                type="button"
                variant={estadoColeta === 'falta_colher' ? 'default' : 'outline'}
                className="h-12 rounded-2xl font-bold"
                onClick={() => atualizarEstadoColeta('falta_colher')}
              >
                Falta colher
              </Button>
              <Button
                type="button"
                variant={estadoColeta === 'falta_tropear' ? 'default' : 'outline'}
                className="h-12 rounded-2xl font-bold"
                onClick={() => atualizarEstadoColeta('falta_tropear')}
              >
                Falta tropear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card border-none shadow-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 p-4 text-left"
            onClick={() => setShowObs(true)}
          >
            <div className="min-w-0">
              <p className="text-xl font-black tracking-tight text-[var(--qc-text)]">
                Observações
              </p>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                {observacoesResumo || 'Toque para registrar observações desta rua.'}
              </p>
              {observacoesDetalhadas.length > 0 || plantasEsquecidas > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {observacoesDetalhadas.map((item, index) => (
                    <Badge key={`${item.tipo}-${item.linha}-${item.planta}-${index}`} variant="slate">
                      {item.tipo} L{item.linha} P{item.planta}
                    </Badge>
                  ))}
                  {plantasEsquecidas > 0 ? (
                    <Badge variant="emerald">
                      Plantas esquecidas: {plantasEsquecidas}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <span className="shrink-0 text-sm font-bold text-[var(--qc-text-muted)]">
              {observacoesResumo ? 'Editar' : 'Expandir'}
            </span>
          </button>
        </Card>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <Button
            variant="outline"
            size="lg"
            className="h-14 rounded-[18px] text-base font-bold"
            onClick={handleFinalizar}
          >
            Finalizar
          </Button>

          <Button
            size="lg"
            className="h-14 rounded-[18px] text-base font-bold"
            disabled={saveMutation.isPending || !ruaAtual}
            onClick={handleNextRua}
          >
            {obterProximaRuaPendente(ruaIndex) == null ? 'Salvar' : 'Salvar e Próxima'}
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Dialog open={showObs} onOpenChange={setShowObs}>
        <DialogContent className="flex max-h-[88dvh] flex-col p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b border-[var(--qc-border)] px-6 py-5">
            <DialogTitle className="text-xl font-black tracking-tight">
              Observações da Rua
            </DialogTitle>
          </DialogHeader>

          <div className="mobile-scroll flex-1 px-6 py-4">
            <div className="stack-md">
              <div className="stack-sm">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Linha e Planta
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {OBSERVACOES_DETALHADAS.map((tipo) => (
                    <Button
                      key={tipo}
                      type="button"
                      variant={
                        observacaoDetalhadaTipo === tipo ? 'default' : 'outline'
                      }
                      className="h-12 rounded-2xl font-bold"
                      onClick={() => abrirObservacaoDetalhada(tipo)}
                    >
                      {tipo}
                    </Button>
                  ))}
                </div>
              </div>

            {observacaoDetalhadaTipo ? (
              <div className="stack-sm rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {observacaoDetalhadaTipo}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 font-bold"
                    onClick={() => {
                      setObservacaoDetalhadaTipo(null);
                      setObservacaoDetalhadaLinha('');
                      setObservacaoDetalhadaPlanta('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[ruaAtual?.linhaInicial, ruaAtual?.linhaFinal]
                    .filter((linha): linha is number => typeof linha === 'number')
                    .map((linha) => (
                      <Button
                        key={linha}
                        type="button"
                        variant={
                          String(linha) === observacaoDetalhadaLinha
                            ? 'default'
                            : 'outline'
                        }
                        className="h-11 rounded-2xl font-bold"
                        onClick={() => setObservacaoDetalhadaLinha(String(linha))}
                      >
                        Linha {linha}
                      </Button>
                    ))}
                </div>

                <Input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder="Planta"
                  value={observacaoDetalhadaPlanta}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setObservacaoDetalhadaPlanta(event.target.value)
                  }
                />

                <Button
                  type="button"
                  className="h-12 rounded-2xl font-bold"
                  disabled={!observacaoDetalhadaLinha || !observacaoDetalhadaPlanta}
                  onClick={adicionarObservacaoDetalhada}
                >
                  Adicionar {observacaoDetalhadaTipo}
                </Button>
              </div>
            ) : null}

            <div className="stack-sm rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[var(--qc-text)]">
                  Plantas esquecidas
                </p>
                <Button
                  type="button"
                  variant={plantasEsquecidas > 0 ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 px-4 font-bold"
                  onClick={() => {
                    setObservacoesDraftDirty(true);
                    setPlantasEsquecidas((current) => (current > 0 ? 0 : 1));
                  }}
                >
                  {plantasEsquecidas > 0 ? 'Remover' : 'Adicionar'}
                </Button>
              </div>

              {plantasEsquecidas > 0 ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-2xl"
                    onClick={() => {
                      setObservacoesDraftDirty(true);
                      setPlantasEsquecidas((current) => Math.max(1, current - 1));
                    }}
                  >
                    -
                  </Button>
                  <div className="min-w-0 flex-1 text-center">
                    <p className="text-[2.2rem] font-black tracking-[-0.06em] text-[var(--qc-primary)]">
                      {plantasEsquecidas}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                      quantidade
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    className="h-12 w-12 rounded-2xl"
                    onClick={() => {
                      setObservacoesDraftDirty(true);
                      setPlantasEsquecidas((current) => current + 1);
                    }}
                  >
                    +
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="stack-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                Observação Livre
              </p>
              <Textarea
                placeholder="Outra observação"
                className="min-h-[120px] rounded-2xl p-4"
                value={observacaoLivre}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setObservacoesDraftDirty(true);
                  setObservacaoLivre(event.target.value);
                }}
              />
            </div>

            {observacoesResumo ? (
              <div className="stack-sm rounded-[24px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Resumo
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text)]">
                  {observacoesResumo}
                </p>
              </div>
            ) : null}

            {observacoesDetalhadas.length > 0 ? (
              <div className="stack-sm rounded-[24px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Abelha e Tapio registrados
                </p>
                <div className="flex flex-wrap gap-2">
                  {observacoesDetalhadas.map((item, index) => (
                    <button
                      key={`${item.tipo}-${item.linha}-${item.planta}-${index}`}
                      type="button"
                      className="rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--qc-secondary)]"
                      onClick={() => removerObservacaoDetalhada(index)}
                    >
                      {item.tipo} • Linha {item.linha} • Planta {item.planta}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-[var(--qc-border)] px-6 py-4">
            <Button
              className="h-14 w-full rounded-2xl font-bold"
              onClick={() => setShowObs(false)}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResumoParcelaModal}>
        <DialogContent
          className="p-0 sm:max-w-lg"
          showClose={false}
          onPointerDownOutside={(event: Event) => event.preventDefault()}
          onEscapeKeyDown={(event: Event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-[var(--qc-border)] px-6 py-5">
            <DialogTitle className="text-xl font-black tracking-tight text-[var(--qc-text)]">
              Fechamento da parcela
            </DialogTitle>
          </DialogHeader>

          <div className="mobile-scroll max-h-[70dvh] px-6 py-5">
            <div className="stack-md">
              <div className="stack-xs rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Parcela {resumoParcelaDraft?.parcelaCodigo || '--'}
                </p>
                <p className="text-sm text-[var(--qc-text-muted)]">
                  Escolha uma única sigla por equipe. Ela será exibida uma única vez no
                  fechamento da parcela no relatório.
                </p>
              </div>

              <div className="stack-xs rounded-[24px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                  Responsáveis
                </p>
                <p className="text-sm font-bold text-[var(--qc-text)]">
                  {data?.participantes.find(
                    (item) => normalizePapelAvaliacao(item.papel) === 'responsavel_principal',
                  )?.colaborador
                    ?.primeiroNome || 'Responsável não informado'}
                </p>
                {data?.participantes.some(
                  (item) => normalizePapelAvaliacao(item.papel) === 'ajudante',
                ) ? (
                  <p className="text-xs text-[var(--qc-text-muted)]">
                    Ajudantes:{' '}
                    {data.participantes
                      .filter((item) => normalizePapelAvaliacao(item.papel) === 'ajudante')
                      .map((item) => item.colaborador?.primeiroNome || '')
                      .filter(Boolean)
                      .join(', ') || 'Não informado'}
                  </p>
                ) : null}
              </div>

              {resumoParcelaDraft
                ? Object.entries(resumoParcelaDraft.siglas).map(([equipe, siglaAtual]) => (
                    <div
                      key={equipe}
                      className="stack-sm rounded-[24px] border border-[var(--qc-border)] bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                          Equipe {equipe}
                        </p>
                        <Badge variant={siglaAtual ? 'emerald' : 'amber'}>
                          {siglaAtual || 'Pendente'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {SIGLAS_RESUMO_PARCELA.map((opcao) => (
                          <button
                            key={`${equipe}-${opcao.value}`}
                            type="button"
                            className={cn(
                              'relative flex min-h-[94px] w-full flex-col items-center justify-center rounded-[22px] border px-3 py-3 text-center transition-transform',
                              siglaAtual === opcao.value
                                ? 'border-[rgba(0,107,68,0.22)] bg-[rgba(0,107,68,0.08)] shadow-[0_18px_28px_-24px_rgba(0,107,68,0.42)]'
                                : 'border-[var(--qc-border)] bg-[var(--qc-surface-muted)]',
                            )}
                            onClick={() =>
                              setResumoParcelaDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      siglas: {
                                        ...current.siglas,
                                        [equipe]: opcao.value,
                                      },
                                    }
                                  : current,
                              )
                            }
                          >
                            {siglaAtual === opcao.value ? (
                              <CheckCircle2 className="absolute right-3 top-3 h-4.5 w-4.5 text-[var(--qc-primary)]" />
                            ) : null}
                            <span className="block w-full text-lg font-black leading-none tracking-[-0.03em] text-[var(--qc-text)]">
                              {opcao.label}
                            </span>
                            <span className="mt-1.5 block w-full text-[11px] font-medium leading-snug text-[var(--qc-text-muted)]">
                              {opcao.descricao}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                : null}
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--qc-border)] px-6 py-4">
            <Button
              className="h-14 w-full rounded-2xl font-bold"
              disabled={
                saveResumoParcelaMutation.isPending ||
                !resumoParcelaDraft ||
                Object.values(resumoParcelaDraft.siglas).some((siglaAtual) => !siglaAtual)
              }
              onClick={() => saveResumoParcelaMutation.mutate()}
            >
              {saveResumoParcelaMutation.isPending
                ? 'Salvando sigla da parcela'
                : 'Salvar sigla da parcela'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAllRuas} onOpenChange={setShowAllRuas}>
        <DialogContent className="max-h-[86dvh] p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b border-[var(--qc-border)] px-6 py-5">
            <DialogTitle className="text-xl font-black tracking-tight text-[var(--qc-text)]">
              Todas as ruas
            </DialogTitle>
          </DialogHeader>

          <div className="mobile-scroll max-h-[calc(86dvh-92px)] px-6 py-4 pb-6">
            <div className="stack-sm">
              {ruas.map((rua, index) => {
                const isFeita =
                  ruaIdsComRegistro.has(rua.id) || ruasComFalhaIds.has(rua.id);
                const isAtual = index === ruaIndex;
                const resumoRegistro = resumoRegistrosPorRua.get(rua.id);
                const temRegistro = Boolean(resumoRegistro);
                const temExtras =
                  resumoRegistro != null &&
                  (resumoRegistro.plantasEsquecidas > 0 ||
                    resumoRegistro.abelhas > 0 ||
                    resumoRegistro.tapios > 0);

                return (
                  <button
                    key={rua.id}
                    type="button"
                    className={cn(
                      'w-full rounded-[24px] border p-4 text-left transition',
                      isAtual
                        ? 'border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)]'
                        : 'border-[var(--qc-border)] bg-[var(--qc-surface-muted)]',
                    )}
                    onClick={() => {
                      navegarParaRua(index);
                      setShowAllRuas(false);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[2.2rem] font-black tracking-[-0.06em] tabular-nums text-[var(--qc-text)]">
                          {rua.linhaInicial} → {rua.linhaFinal}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--qc-secondary)]">
                          Parcela {parcelasMap.get(rua.avaliacaoParcelaId)?.parcelaCodigo || '--'} •
                          {' '}Equipe {rua.equipeNome || '--'}
                        </p>
                        <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                          {rua.tipoFalha
                            ? `${formatarTipoFalha(rua.tipoFalha)}`
                            : temRegistro
                              ? temExtras
                                ? 'Rua feita com observações registradas'
                                : 'Rua já registrada'
                            : 'Toque para abrir esta rua'}
                        </p>
                      </div>

                      {rua.tipoFalha ? (
                        <Badge variant="red">{formatarTipoFalha(rua.tipoFalha)}</Badge>
                      ) : temRegistro ? (
                        <div className="w-[132px] shrink-0">
                          <div className="grid grid-cols-2 gap-2">
                            <RuaResumoMetric
                              label="Cacho"
                              value={
                                resumoRegistro?.faltaColher
                                  ? 'F.C'
                                  : resumoRegistro?.cachos3 || 0
                              }
                            />
                            <RuaResumoMetric
                              label="Coco"
                              value={
                                resumoRegistro?.faltaColher
                                  ? '--'
                                  : resumoRegistro?.faltaTropear
                                  ? 'F.T'
                                  : resumoRegistro?.quantidade || 0
                              }
                            />
                          </div>

                          {temExtras ? (
                            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                              {resumoRegistro && resumoRegistro.plantasEsquecidas > 0 ? (
                                <RuaResumoChip
                                  label="Plantas"
                                  value={resumoRegistro.plantasEsquecidas}
                                />
                              ) : null}
                              {resumoRegistro && resumoRegistro.abelhas > 0 ? (
                                <RuaResumoChip
                                  label="Abelhas"
                                  value={resumoRegistro.abelhas}
                                />
                              ) : null}
                              {resumoRegistro && resumoRegistro.tapios > 0 ? (
                                <RuaResumoChip
                                  label="Tapio"
                                  value={resumoRegistro.tapios}
                                />
                              ) : null}
                            </div>
                          ) : null}

                          <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--qc-primary)]">
                            <CheckCircle2 className="h-4 w-4" />
                            Feita
                          </div>
                        </div>
                      ) : isFeita ? (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(0,107,68,0.12)] bg-[rgba(0,107,68,0.08)]">
                          <CheckCircle2 className="h-5 w-5 text-[var(--qc-primary)]" />
                        </div>
                      ) : (
                        <Info className="mt-2 h-6 w-6 shrink-0 text-[rgba(93,98,78,0.42)]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRuas} onOpenChange={setShowEditRuas}>
        <DialogContent className="max-h-[88dvh] p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b border-[var(--qc-border)] px-6 py-5">
            <DialogTitle className="text-xl font-black tracking-tight text-[var(--qc-text)]">
              Editar rua atual
            </DialogTitle>
          </DialogHeader>

          <div className="mobile-scroll max-h-[calc(88dvh-172px)] px-6 py-4">
            <div className="stack-md">
              <div className="stack-md rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                      Rua atual
                    </p>
                    <p className="mt-2 text-lg font-black tracking-tight text-[var(--qc-text)]">
                      {ruaAtual ? `${ruaAtual.linhaInicial} → ${ruaAtual.linhaFinal}` : '--'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Ajuste rápido e pontual somente na rua em andamento.
                    </p>
                  </div>

                  <Badge variant={registroExistente ? 'slate' : 'emerald'}>
                    {registroExistente ? 'Com registro' : 'Sem registro'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Linha inicial"
                    type="number"
                    className="h-14"
                    value={editRuaLinhaIni}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setEditRuaLinhaIni(event.target.value)
                    }
                  />
                  <Input
                    placeholder="Linha final"
                    type="number"
                    className="h-14"
                    value={editRuaLinhaFim}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setEditRuaLinhaFim(event.target.value)
                    }
                  />
                </div>

                <div className="grid gap-3">
                  <Button
                    className="h-12 rounded-2xl font-bold"
                    disabled={
                      applyRuaAtualMutation.isPending ||
                      !editRuaLinhaIni ||
                      !editRuaLinhaFim ||
                      !ruaAtual
                    }
                    onClick={() => applyRuaAtualMutation.mutate()}
                  >
                    {applyRuaAtualMutation.isPending
                      ? 'Salvando ajuste'
                      : 'Salvar ajuste da rua atual'}
                  </Button>
                </div>
              </div>

              <div className="stack-xs rounded-[24px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Escopo desta edição rápida
                </p>
                <p className="text-sm text-[var(--qc-text-muted)]">
                  Ela altera somente o alinhamento atual. A programação completa e a
                  inversão da parcela ficam em ações separadas nesta tela.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 border-t border-[var(--qc-border)] px-6 py-4">
            <Button
              variant="outline"
              className="h-12 w-full font-bold"
              onClick={() => setShowEditRuas(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvertParcela} onOpenChange={setShowInvertParcela}>
        <DialogContent className="max-h-[88dvh] p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b border-[var(--qc-border)] px-6 py-5">
            <DialogTitle className="text-xl font-black tracking-tight text-[var(--qc-text)]">
              Inverter parcela atual
            </DialogTitle>
          </DialogHeader>

          <div className="mobile-scroll max-h-[calc(88dvh-172px)] px-6 py-4">
            <div className="stack-md">
              <div className="stack-md rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                      Parcela ativa
                    </p>
                    <p className="mt-2 text-lg font-black tracking-tight text-[var(--qc-text)]">
                      {parcelaAtual ? `Parcela ${parcelaAtual.parcelaCodigo}` : '--'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      A inversão muda somente a ordem de navegação desta parcela. Os registros
                      já salvos permanecem intactos.
                    </p>
                  </div>

                  <Badge variant="slate">
                    {ruasParcelaAtual.length} rua(s)
                  </Badge>
                </div>

                <div className="stack-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                    Sentido da navegação
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant={invertParcelaSentido === 'inicio' ? 'default' : 'outline'}
                      className="h-12 rounded-2xl font-bold"
                      onClick={() => setInvertParcelaSentido('inicio')}
                    >
                      Do início
                    </Button>
                    <Button
                      type="button"
                      variant={invertParcelaSentido === 'fim' ? 'default' : 'outline'}
                      className="h-12 rounded-2xl font-bold"
                      onClick={() => setInvertParcelaSentido('fim')}
                    >
                      Do final
                    </Button>
                  </div>
                </div>
              </div>

              <div className="stack-xs rounded-[24px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Escopo da inversão
                </p>
                <p className="text-sm text-[var(--qc-text-muted)]">
                  A ordem muda por parcela, não por equipe. Isso evita inverter outras
                  parcelas que estejam com a mesma equipe.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 border-t border-[var(--qc-border)] px-6 py-4">
            <Button
              className="h-14 w-full rounded-2xl font-bold"
              disabled={
                inverterParcelaMutation.isPending ||
                !ruaAtual ||
                ruasParcelaAtual.length < 2 ||
                invertParcelaSentido === sentidoParcelaAtual
              }
              onClick={() => inverterParcelaMutation.mutate()}
            >
              {inverterParcelaMutation.isPending
                ? 'Salvando inversão'
                : 'Salvar ordem da parcela'}
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full font-bold"
              onClick={() => setShowInvertParcela(false)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalizacaoModal}>
        <DialogContent
          className="p-0 sm:max-w-md"
          showClose={false}
          onPointerDownOutside={(event: Event) => event.preventDefault()}
          onEscapeKeyDown={(event: Event) => event.preventDefault()}
        >
          <DialogHeader className="border-b border-[var(--qc-border)] px-6 py-5">
            <DialogTitle className="text-xl font-black tracking-tight text-[var(--qc-text)]">
              Coleta concluída
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5">
            <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
              Não há mais ruas válidas pendentes nesta coleta. Escolha a ação final para encerrar o fluxo sem voltar manualmente.
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 border-t border-[var(--qc-border)] px-6 py-4">
            <Button
              className="h-14 w-full rounded-2xl font-bold"
              disabled={finalizandoDestino !== null}
              onClick={() => concluirColeta('dashboard')}
            >
              {finalizandoDestino === 'dashboard' ? 'Salvando saída' : 'Salvar e sair'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 w-full rounded-2xl font-bold"
              disabled={finalizandoDestino !== null}
              onClick={() => concluirColeta('relatorio')}
            >
              {finalizandoDestino === 'relatorio'
                ? 'Abrindo relatório'
                : 'Salvar e ver relatório'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutMobile>
  );
}
