import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Plus, 
  ShieldCheck, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  CalendarDays,
  Palmtree, 
  Layout, 
  Users2,
  UserCheck,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { useCampoApp } from '@/core/AppProvider';
import { listarColaboradoresAtivos } from '@/core/auth';
import { planejarParcelasAvaliacao } from '@/core/evaluationPlanning';
import { criarAvaliacao } from '@/core/evaluations';
import {
  atualizarAvaliacaoConfiguracao,
  obterAvaliacaoDetalhada,
} from '@/core/evaluations';
import { clamp } from '@/core/plots';
import {
  canEditCompletedEvaluation,
  canStartEvaluation,
  filtrarEquipesVisiveis,
} from '@/core/permissions';
import {
  codigoParcelaCorrespondeBusca,
  formatarCodigoParcela,
} from '@/core/parcelCode';
import { repository } from '@/core/repositories';
import { ListaParcelas } from '@/components/ListaParcelas';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { todayIso } from '@/core/date';
import { listarParcelasPlanejadasVisiveis } from '@/core/plannedParcels';
import { useRolePermissions } from '@/core/useRolePermissions';
import { MAX_PARCELAS } from '@/core/constants';
import { cn } from '@/utils';
import type {
  FaixaFalhaParcela,
  ModoCalculo,
  ParcelaPlanejada,
  OrdemColeta,
  SentidoRuas,
} from '@/core/types';

type ConfigMap = Record<
  string,
  {
    linhaInicial: string;
    linhaFinal: string;
    alinhamentoTipo: 'inferior-impar' | 'inferior-par';
    alinhamentoFalha: 'inferior-impar' | 'inferior-par';
    falhasLinhas: string;
    sentidoRuas: SentidoRuas;
    ruasEquipe1: string;
    ruasEquipe2: string;
  }
>;

type Step = 'participantes' | 'parcelas' | 'equipes' | 'revisao';

const formatarAlinhamentoTipo = (value: 'inferior-impar' | 'inferior-par') =>
  value === 'inferior-impar' ? 'Ímpar' : 'Par';

const formatarSentidoRuas = (value: SentidoRuas) =>
  value === 'inicio' ? 'Do início' : 'Do final';

const descreverSentidoRuas = (value: SentidoRuas) =>
  value === 'inicio' ? 'Do início para o final' : 'Do final para o início';

const formatarQuantidadeRuas = (value: number) =>
  `${value} ${value === 1 ? 'rua' : 'ruas'}`;

const formatarFaixasFalhaTexto = (
  faixasFalha: FaixaFalhaParcela[] | null | undefined,
) =>
  Array.isArray(faixasFalha)
    ? faixasFalha.map((faixa) => `${faixa.linhaInicial}-${faixa.linhaFinal}`).join(', ')
    : '';

const descreverFaixasFalha = (
  faixasFalha: FaixaFalhaParcela[] | null | undefined,
) =>
  Array.isArray(faixasFalha)
    ? faixasFalha
        .map(
          (faixa) =>
            `${formatarAlinhamentoTipo(faixa.alinhamentoTipo)} L${faixa.linhaInicial}-${faixa.linhaFinal}`,
        )
        .join(' • ')
    : '';

const normalizarFaixasFalhaParcela = (
  value: string,
  alinhamentoTipo: 'inferior-impar' | 'inferior-par',
) => {
  const faixas = String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
      if (!match) {
        return null;
      }

      const linhaInicial = clamp(Number(match[1] || 0), 1, 136);
      const linhaFinal = clamp(Number(match[2] || match[1] || 0), 1, 136);
      if (linhaFinal < linhaInicial) {
        return null;
      }

      return {
        linhaInicial,
        linhaFinal,
        alinhamentoTipo,
      } satisfies FaixaFalhaParcela;
    })
    .filter(Boolean) as FaixaFalhaParcela[];

  return faixas
    .sort((a, b) => a.linhaInicial - b.linhaInicial || a.linhaFinal - b.linhaFinal)
    .reduce<FaixaFalhaParcela[]>((acc, faixa) => {
      const last = acc[acc.length - 1];
      if (
        last &&
        last.alinhamentoTipo === faixa.alinhamentoTipo &&
        faixa.linhaInicial <= last.linhaFinal + 1
      ) {
        last.linhaFinal = Math.max(last.linhaFinal, faixa.linhaFinal);
        return acc;
      }

      acc.push({ ...faixa });
      return acc;
    }, []);
};

const formatarEquipeNumero = (value: number | string | null | undefined) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '--';
  return /^\d+$/.test(normalized) ? normalized.padStart(2, '0') : normalized;
};

const getEquipePlanejamentoKey = ({
  equipeId,
  equipeNome,
}: {
  equipeId: string | null | undefined;
  equipeNome: string | null | undefined;
}) => String(equipeId || equipeNome || '').trim().toUpperCase();

const formatarModoCalculo = (value: ModoCalculo) =>
  value === 'media_vizinhas'
    ? 'Média das ruas vizinhas'
    : 'Manual';

const formatarDataColheita = (value: string) => {
  if (!value) return '-';

  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    weekday: 'long',
  }).format(date);
};

export function TelaNovaAvaliacao() {
  const { id: editingId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { usuarioAtual, dispositivo, session } = useCampoApp();
  const { permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);
  const isEditMode = Boolean(editingId);
  const initializedEditRef = useRef<string | null>(null);
  const plannedParcelInitRef = useRef<string | null>(null);
  
  const [step, setStep] = useState<Step>('participantes');
  const [temMaisPessoas, setTemMaisPessoas] = useState<boolean | null>(null);
  const [participanteIds, setParticipanteIds] = useState<string[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [configuracoes, setConfiguracoes] = useState<ConfigMap>({});
  const [buscaParcela, setBuscaParcela] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dataColheita, setDataColheita] = useState(todayIso());
  const [alinhamentoTipo, setAlinhamentoTipo] = useState<'inferior-impar' | 'inferior-par'>(
    'inferior-impar',
  );
  const [sentidoRuas, setSentidoRuas] = useState<SentidoRuas>('inicio');
  const ordemColeta: OrdemColeta = 'invertido';
  const [modoCalculo, setModoCalculo] = useState<ModoCalculo>('manual');
  const [equipe1Id, setEquipe1Id] = useState('');
  const [equipe2Id, setEquipe2Id] = useState('');
  const [duasEquipes, setDuasEquipes] = useState(false);
  const [totalRuasEq1, setTotalRuasEq1] = useState(14);
  const [totalRuasEq2, setTotalRuasEq2] = useState(14);
  const [linhaInicioEq1, setLinhaInicioEq1] = useState('');
  const [linhaFimEq1, setLinhaFimEq1] = useState('');
  const [linhaInicioEq2, setLinhaInicioEq2] = useState('');
  const [linhaFimEq2, setLinhaFimEq2] = useState('');
  const [parcelaPlanejadaIds, setParcelaPlanejadaIds] = useState<string[]>([]);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores', 'ativos'],
    queryFn: listarColaboradoresAtivos,
  });
  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes', 'visiveis', usuarioAtual?.id],
    queryFn: () => filtrarEquipesVisiveis(usuarioAtual),
  });
  const { data: parcelas = [] } = useQuery({
    queryKey: ['parcelas', 'catalogo'],
    queryFn: () => repository.list('parcelas'),
  });
  const { data: parcelasPlanejadas = [] } = useQuery({
    queryKey: ['parcelas-planejadas', 'nova-avaliacao', usuarioAtual?.id, session?.equipeDiaId],
    queryFn: () =>
      listarParcelasPlanejadasVisiveis({
        usuarioId: usuarioAtual?.id,
        equipeId: session?.equipeDiaId || null,
        incluirConcluidas: false,
      }),
    enabled: Boolean(usuarioAtual?.id),
  });
  const {
    data: editData,
    isFetched: editDataFetched,
    isLoading: editDataLoading,
  } = useQuery({
    queryKey: ['avaliacao', editingId, 'editar', usuarioAtual?.id],
    queryFn: () => obterAvaliacaoDetalhada(editingId, usuarioAtual?.id),
    enabled: Boolean(isEditMode && editingId && usuarioAtual?.id),
  });
  const dataAvaliacaoEdicao =
    editData?.avaliacao?.dataAvaliacao || todayIso();

  const parcelasCatalogo = useMemo(() => {
    const unicas = new Map<string, (typeof parcelas)[number]>();

    [...parcelas]
      .filter((item) => item.ativo && !item.deletadoEm)
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
      .forEach((item) => {
        const key = String(item.codigo || '').trim().toUpperCase();
        if (!key || unicas.has(key)) return;
        unicas.set(key, item);
      });

    return Array.from(unicas.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
    );
  }, [parcelas]);
  const parcelaCodigoPorId = useMemo(
    () =>
      new Map(
        parcelasCatalogo.map((item) => [
          item.id,
          String(item.codigo || '').trim().toUpperCase(),
        ]),
      ),
    [parcelasCatalogo],
  );
  const ordenarParcelasSelecionadas = (ids: string[]) =>
    Array.from(new Set(ids)).sort((a, b) => {
      const codigoA = parcelaCodigoPorId.get(a) || '';
      const codigoB = parcelaCodigoPorId.get(b) || '';
      return (
        codigoA.localeCompare(codigoB, 'pt-BR', { numeric: true }) ||
        a.localeCompare(b, 'pt-BR', { numeric: true })
      );
    });

  const parcelasFiltradas = useMemo(
    () =>
      parcelasCatalogo
        .filter((item) => codigoParcelaCorrespondeBusca(item.codigo, buscaParcela))
        .slice(0, 24),
    [buscaParcela, parcelasCatalogo],
  );
  const parcelaPlanejadaParams = useMemo(
    () =>
      Array.from(
        new Set(
          new URLSearchParams(location.search)
            .getAll('parcelaPlanejadaId')
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [location.search],
  );
  const parcelaPlanejadaParamsKey = useMemo(
    () => parcelaPlanejadaParams.join('|'),
    [parcelaPlanejadaParams],
  );
  const parcelasPlanejadasAtivas = useMemo(
    () =>
      parcelasPlanejadas.filter(
        (item) =>
          item.status === 'disponivel' || item.status === 'em_andamento',
      ),
    [parcelasPlanejadas],
  );
  const parcelaPlanejadaPorParcelaId = useMemo(
    () =>
      parcelasPlanejadasAtivas.reduce<Map<string, ParcelaPlanejada>>((acc, item) => {
        if (item.parcelaId && !acc.has(item.parcelaId)) {
          acc.set(item.parcelaId, item);
        }
        return acc;
      }, new Map()),
    [parcelasPlanejadasAtivas],
  );

  const equipe1 = equipes.find((item) => item.id === equipe1Id) || null;
  const equipe2 = equipes.find((item) => item.id === equipe2Id) || null;
  const responsavelId = editData?.avaliacao?.usuarioId || usuarioAtual?.id || '';
  const responsavelAtual =
    colaboradores.find((item) => item.id === responsavelId) || usuarioAtual || null;

  useEffect(() => {
    if (isEditMode && editDataFetched && !editData) {
      navigate('/dashboard', { replace: true });
    }
  }, [editData, editDataFetched, isEditMode, navigate]);

  useEffect(() => {
    if (!isEditMode || !editingId || !editData) return;
    if (initializedEditRef.current === editingId) return;

    initializedEditRef.current = editingId;

    const extrasIds = editData.participantes
      .map((item) => item.colaboradorId)
      .filter((colaboradorId) => colaboradorId !== responsavelId);

    const equipesResumo = Array.from(
      editData.ruas
        .reduce<
        Map<
          string,
          {
            id: string;
            nome: string;
            linhas: Array<[number, number]>;
            totalRuas: number;
          }
        >
      >((acc, rua) => {
        const key = getEquipePlanejamentoKey({
          equipeId: rua.equipeId,
          equipeNome: rua.equipeNome,
        });

        if (!key) return acc;
        const current = acc.get(key) || {
          id: rua.equipeId || '',
          nome: rua.equipeNome || '',
          linhas: [],
          totalRuas: 0,
        };
        current.linhas.push([rua.linhaInicial, rua.linhaFinal]);
        current.totalRuas += 1;
        acc.set(key, current);
        return acc;
      }, new Map())
        .values(),
    )
      .sort((a, b) =>
        formatarEquipeNumero(a.nome).localeCompare(
          formatarEquipeNumero(b.nome),
          'pt-BR',
          { numeric: true },
        ),
      );

    const equipePrimaria = equipesResumo[0] || null;
    const equipeSecundaria = equipesResumo[1] || null;
    const configuracoesIniciais = editData.parcelas.reduce<ConfigMap>(
      (acc, parcela) => {
        const ruasParcela = editData.ruas.filter(
          (rua) => rua.avaliacaoParcelaId === parcela.id,
        );
        const primeiraRua = ruasParcela[0] || null;
        const contarPorEquipe = (equipeKey: string) =>
          ruasParcela.filter(
            (rua) =>
              getEquipePlanejamentoKey({
                equipeId: rua.equipeId,
                equipeNome: rua.equipeNome,
              }) === equipeKey,
          ).length;

        acc[parcela.parcelaId] = {
          linhaInicial: String(parcela.linhaInicial || ''),
          linhaFinal: String(parcela.linhaFinal || ''),
          alinhamentoTipo:
            primeiraRua?.alinhamentoTipo ||
            (editData.avaliacao.alinhamentoTipo === 'inferior-par'
                ? 'inferior-par'
                : 'inferior-impar'),
          alinhamentoFalha:
            parcela.faixasFalha?.[0]?.alinhamentoTipo ||
            primeiraRua?.alinhamentoTipo ||
            (editData.avaliacao.alinhamentoTipo === 'inferior-par'
              ? 'inferior-par'
              : 'inferior-impar'),
          falhasLinhas: formatarFaixasFalhaTexto(parcela.faixasFalha),
          sentidoRuas: primeiraRua?.sentidoRuas === 'fim' ? 'fim' : 'inicio',
          ruasEquipe1: String(
            contarPorEquipe(
              getEquipePlanejamentoKey({
                equipeId: equipePrimaria?.id,
                equipeNome: equipePrimaria?.nome,
              }),
            ),
          ),
          ruasEquipe2: String(
            contarPorEquipe(
              getEquipePlanejamentoKey({
                equipeId: equipeSecundaria?.id,
                equipeNome: equipeSecundaria?.nome,
              }),
            ),
          ),
        };
        return acc;
      },
      {},
    );

    const primeiraParcelaConfig =
      configuracoesIniciais[editData.parcelas[0]?.parcelaId || ''] || null;
    const getFaixaEquipe = (
      equipe:
        | {
            linhas: Array<[number, number]>;
          }
        | null
        | undefined,
    ) => {
      if (!equipe || equipe.linhas.length === 0) {
        return { inicio: '', fim: '' };
      }

      return {
        inicio: String(Math.min(...equipe.linhas.map(([inicio]) => inicio))),
        fim: String(Math.max(...equipe.linhas.map(([, fim]) => fim))),
      };
    };
    const faixaEquipePrimaria = getFaixaEquipe(equipePrimaria);
    const faixaEquipeSecundaria = getFaixaEquipe(equipeSecundaria);

    setStep('participantes');
    setTemMaisPessoas(extrasIds.length > 0);
    setParticipanteIds(extrasIds);
    setSelecionadas(
      editData.parcelas
        .slice()
        .sort((a, b) =>
          String(a.parcelaCodigo || '').localeCompare(
            String(b.parcelaCodigo || ''),
            'pt-BR',
            { numeric: true },
          ),
        )
        .map((item) => item.parcelaId),
    );
    setConfiguracoes(configuracoesIniciais);
    setBuscaParcela('');
    setObservacoes(editData.avaliacao.observacoes || '');
    setDataColheita(
      editData.avaliacao.dataColheita ||
        editData.avaliacao.dataAvaliacao ||
        todayIso(),
    );
    setAlinhamentoTipo(
      primeiraParcelaConfig?.alinhamentoTipo ||
        (editData.avaliacao.alinhamentoTipo === 'inferior-par'
          ? 'inferior-par'
          : 'inferior-impar'),
    );
    setSentidoRuas(primeiraParcelaConfig?.sentidoRuas || 'inicio');
    setModoCalculo(editData.avaliacao.modoCalculo || 'manual');
    setEquipe1Id(equipePrimaria?.id || '');
    setEquipe2Id(equipeSecundaria?.id || '');
    setDuasEquipes(Boolean(equipeSecundaria));
    setTotalRuasEq1(Math.max(1, equipePrimaria?.totalRuas || 1));
    setTotalRuasEq2(Math.max(1, equipeSecundaria?.totalRuas || 1));
    setLinhaInicioEq1(Boolean(equipeSecundaria) ? faixaEquipePrimaria.inicio : '');
    setLinhaFimEq1(Boolean(equipeSecundaria) ? faixaEquipePrimaria.fim : '');
    setLinhaInicioEq2(faixaEquipeSecundaria.inicio);
    setLinhaFimEq2(faixaEquipeSecundaria.fim);
    setParcelaPlanejadaIds(editData.parcelasPlanejadas.map((item) => item.id));
  }, [editData, editingId, isEditMode, responsavelId]);

  useEffect(() => {
    if (isEditMode || equipe1Id || !session?.equipeDiaId) {
      return;
    }

    setEquipe1Id(session.equipeDiaId);
  }, [equipe1Id, isEditMode, session?.equipeDiaId]);

  useEffect(() => {
    if (
      isEditMode ||
      parcelaPlanejadaParams.length === 0 ||
      plannedParcelInitRef.current === parcelaPlanejadaParamsKey
    ) {
      return;
    }

    const parcelasPlanejadasSelecionadas = parcelaPlanejadaParams
      .map(
        (parcelaPlanejadaId) =>
          parcelasPlanejadasAtivas.find((item) => item.id === parcelaPlanejadaId) || null,
      )
      .filter(Boolean) as ParcelaPlanejada[];

    if (parcelasPlanejadasSelecionadas.length === 0) {
      return;
    }

    const combinacoes = parcelasPlanejadasSelecionadas
      .map((parcelaPlanejada) => {
        const parcelaCatalogo =
          parcelasCatalogo.find(
            (item) =>
              item.id === parcelaPlanejada.parcelaId ||
              item.codigo === parcelaPlanejada.codigo,
          ) || null;

        if (!parcelaCatalogo) {
          return null;
        }

        return {
          parcelaPlanejada,
          parcelaCatalogo,
        };
      })
      .filter(Boolean) as Array<{
      parcelaPlanejada: ParcelaPlanejada;
      parcelaCatalogo: (typeof parcelasCatalogo)[number];
    }>;

    if (combinacoes.length === 0) {
      return;
    }

    plannedParcelInitRef.current = parcelaPlanejadaParamsKey;
    const primeiraParcelaPlanejada = combinacoes[0].parcelaPlanejada;

    setDataColheita(primeiraParcelaPlanejada.dataColheita || todayIso());
    if (primeiraParcelaPlanejada.equipeId) {
      setEquipe1Id(primeiraParcelaPlanejada.equipeId);
    }
    setSelecionadas((current) =>
      ordenarParcelasSelecionadas([
        ...current,
        ...combinacoes.map(({ parcelaCatalogo }) => parcelaCatalogo.id),
      ]),
    );
    setParcelaPlanejadaIds(combinacoes.map(({ parcelaPlanejada }) => parcelaPlanejada.id));
    setConfiguracoes((current) => {
      const next = { ...current };

      for (const { parcelaPlanejada, parcelaCatalogo } of combinacoes) {
        next[parcelaCatalogo.id] = {
          linhaInicial: String(parcelaPlanejada.alinhamentoInicial || ''),
          linhaFinal: String(parcelaPlanejada.alinhamentoFinal || ''),
          alinhamentoFalha:
            current[parcelaCatalogo.id]?.alinhamentoFalha ||
            parcelaPlanejada.alinhamentoTipo ||
            alinhamentoTipo,
          falhasLinhas: current[parcelaCatalogo.id]?.falhasLinhas || '',
          sentidoRuas: current[parcelaCatalogo.id]?.sentidoRuas || sentidoRuas,
          ruasEquipe1:
            current[parcelaCatalogo.id]?.ruasEquipe1 ||
            String(Math.max(0, totalRuasEq1 || 0)),
          ruasEquipe2:
            current[parcelaCatalogo.id]?.ruasEquipe2 ||
            (duasEquipes ? String(Math.max(0, totalRuasEq2 || 0)) : '0'),
          alinhamentoTipo:
            parcelaPlanejada.alinhamentoTipo ||
            current[parcelaCatalogo.id]?.alinhamentoTipo ||
            alinhamentoTipo,
        };
      }

      return next;
    });
    if (!observacoes.trim()) {
      const observacoesPlanejadas = combinacoes
        .map(({ parcelaPlanejada }) => {
          const observacao = String(parcelaPlanejada.observacao || '').trim();
          return observacao ? `${parcelaPlanejada.codigo}: ${observacao}` : '';
        })
        .filter(Boolean)
        .join('\n');

      if (observacoesPlanejadas) {
        setObservacoes(observacoesPlanejadas);
      }
    }
  }, [
    alinhamentoTipo,
    duasEquipes,
    isEditMode,
    observacoes,
    parcelaPlanejadaParams,
    parcelaPlanejadaParamsKey,
    parcelasCatalogo,
    parcelasPlanejadasAtivas,
    sentidoRuas,
    totalRuasEq1,
    totalRuasEq2,
  ]);

  const criarConfigParcela = (
    currentConfig?: ConfigMap[string],
  ): ConfigMap[string] => ({
    linhaInicial: currentConfig?.linhaInicial || '',
    linhaFinal: currentConfig?.linhaFinal || '',
    alinhamentoTipo: currentConfig?.alinhamentoTipo || alinhamentoTipo,
    alinhamentoFalha: currentConfig?.alinhamentoFalha || currentConfig?.alinhamentoTipo || alinhamentoTipo,
    falhasLinhas: currentConfig?.falhasLinhas || '',
    sentidoRuas: currentConfig?.sentidoRuas || sentidoRuas,
    ruasEquipe1:
      currentConfig?.ruasEquipe1 || String(Math.max(0, totalRuasEq1 || 0)),
    ruasEquipe2:
      currentConfig?.ruasEquipe2 ||
      (duasEquipes ? String(Math.max(0, totalRuasEq2 || 0)) : '0'),
  });

  const getRuasConfiguradasPorParcela = (
    equipeKey: 'ruasEquipe1' | 'ruasEquipe2',
  ) =>
    selecionadas.reduce<Record<string, number>>((acc, parcelaId) => {
      const config = configuracoes[parcelaId];
      acc[parcelaId] = Math.max(0, Number(config?.[equipeKey] || 0));
      return acc;
    }, {});

  const totalRuasConfiguradasEq1 = useMemo(
    () =>
      selecionadas.length > 1
        ? Object.values(getRuasConfiguradasPorParcela('ruasEquipe1')).reduce(
            (acc, value) => acc + value,
            0,
          )
        : totalRuasEq1,
    [configuracoes, selecionadas, totalRuasEq1],
  );

  const totalRuasConfiguradasEq2 = useMemo(
    () =>
      selecionadas.length > 1
        ? Object.values(getRuasConfiguradasPorParcela('ruasEquipe2')).reduce(
            (acc, value) => acc + value,
            0,
          )
        : totalRuasEq2,
    [configuracoes, selecionadas, totalRuasEq2],
  );

  useEffect(() => {
    if (!duasEquipes) {
      setEquipe2Id('');
      setLinhaInicioEq2('');
      setLinhaFimEq2('');
      return;
    }

    if (equipe1Id && equipe1Id === equipe2Id) {
      setEquipe2Id('');
    }
  }, [duasEquipes, equipe1Id, equipe2Id]);

  useEffect(() => {
    if (selecionadas.length <= 1) return;

    setConfiguracoes((current) => {
      let changed = false;
      const next = { ...current };

      selecionadas.forEach((parcelaId) => {
        const existing = next[parcelaId];
        if (!existing) return;
        const proximoAlinhamento = existing.alinhamentoTipo || alinhamentoTipo;
        const proximoSentido = existing.sentidoRuas || sentidoRuas;
        if (
          existing.alinhamentoTipo === proximoAlinhamento &&
          existing.sentidoRuas === proximoSentido
        ) {
          return;
        }
        next[parcelaId] = {
          ...existing,
          alinhamentoTipo: proximoAlinhamento,
          sentidoRuas: proximoSentido,
        };
        changed = true;
      });

      return changed ? next : current;
    });
  }, [alinhamentoTipo, selecionadas, sentidoRuas]);

  const parcelasConfiguradas = useMemo(
    () =>
      selecionadas
        .map((parcelaId) => {
          const parcela = parcelasCatalogo.find((item) => item.id === parcelaId);
          const config = configuracoes[parcelaId];
          const linhaInicial = Number(config?.linhaInicial || 0);
          const linhaFinal = Number(config?.linhaFinal || 0);
          if (
            !parcela ||
            !config ||
            linhaInicial <= 0 ||
            linhaFinal <= 0 ||
            linhaFinal < linhaInicial
          ) {
            return null;
          }

          return {
            parcelaId: parcela.id,
            parcelaCodigo: parcela.codigo,
            linhaInicial,
            linhaFinal,
            alinhamentoTipo:
              selecionadas.length > 1
                ? config.alinhamentoTipo || alinhamentoTipo
                : alinhamentoTipo,
            sentidoRuas:
              selecionadas.length > 1
                ? config.sentidoRuas || sentidoRuas
                : sentidoRuas,
            faixasFalha: normalizarFaixasFalhaParcela(
              config.falhasLinhas || '',
              config.alinhamentoFalha || config.alinhamentoTipo || alinhamentoTipo,
            ),
          };
        })
        .filter(
          (
            item,
          ): item is {
            parcelaId: string;
            parcelaCodigo: string;
            linhaInicial: number;
            linhaFinal: number;
            alinhamentoTipo: 'inferior-impar' | 'inferior-par';
            sentidoRuas: SentidoRuas;
            faixasFalha: FaixaFalhaParcela[];
          } => Boolean(item),
        )
        .sort((a, b) =>
          String(a.parcelaCodigo || '').localeCompare(
            String(b.parcelaCodigo || ''),
            'pt-BR',
            { numeric: true },
          ),
        ),
    [alinhamentoTipo, configuracoes, parcelasCatalogo, selecionadas, sentidoRuas],
  );

  const todasConfiguradas =
    selecionadas.length > 0 &&
    selecionadas.every((parcelaId) => {
      const config = configuracoes[parcelaId];
      const linhaInicial = Number(config?.linhaInicial || 0);
      const linhaFinal = Number(config?.linhaFinal || 0);
      return Boolean(
        config &&
          linhaInicial > 0 &&
          linhaFinal > 0 &&
          linhaFinal >= linhaInicial,
      );
    });

  const ruasPorParcelaConfiguradas =
    selecionadas.length === 1 ||
    selecionadas.every((parcelaId) => {
      const config = configuracoes[parcelaId];
      const ruasEq1 = Math.max(0, Number(config?.ruasEquipe1 || 0));
      const ruasEq2 = Math.max(0, Number(config?.ruasEquipe2 || 0));
      return ruasEq1 + (duasEquipes ? ruasEq2 : 0) > 0;
    });

  const handleRemoveParcela = (parcelaId: string) => {
    setSelecionadas((current) => current.filter((item) => item !== parcelaId));
    setParcelaPlanejadaIds((current) =>
      current.filter((item) => parcelaPlanejadaPorParcelaId.get(parcelaId)?.id !== item),
    );
    setConfiguracoes((current) => {
      const next = { ...current };
      delete next[parcelaId];
      return next;
    });
  };

  const handleToggleParcela = (parcelaId: string) => {
    if (selecionadas.includes(parcelaId)) {
      handleRemoveParcela(parcelaId);
      return;
    }

    if (selecionadas.length >= MAX_PARCELAS) return;

    setSelecionadas((current) =>
      ordenarParcelasSelecionadas([...current, parcelaId]),
    );
    const parcelaPlanejada = parcelaPlanejadaPorParcelaId.get(parcelaId) || null;
    if (parcelaPlanejada) {
      setParcelaPlanejadaIds((current) =>
        current.includes(parcelaPlanejada.id) ? current : [...current, parcelaPlanejada.id],
      );
      setDataColheita(parcelaPlanejada.dataColheita || dataColheita);
      if (parcelaPlanejada.equipeId && !equipe1Id) {
        setEquipe1Id(parcelaPlanejada.equipeId);
      }
    }
    setConfiguracoes((current) => ({
      ...current,
      [parcelaId]: {
        ...criarConfigParcela(current[parcelaId]),
        linhaInicial: parcelaPlanejada
          ? String(parcelaPlanejada.alinhamentoInicial || '')
          : criarConfigParcela(current[parcelaId]).linhaInicial,
        linhaFinal: parcelaPlanejada
          ? String(parcelaPlanejada.alinhamentoFinal || '')
          : criarConfigParcela(current[parcelaId]).linhaFinal,
        alinhamentoTipo:
          parcelaPlanejada?.alinhamentoTipo ||
          criarConfigParcela(current[parcelaId]).alinhamentoTipo,
      },
    }));
  };

  const updateConfigParcela = (
    parcelaId: string,
    field: 'linhaInicial' | 'linhaFinal',
    value: string,
  ) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 3);
    setConfiguracoes((current) => ({
      ...current,
      [parcelaId]: {
        ...criarConfigParcela(current[parcelaId]),
        [field]: sanitized,
      },
    }));
  };

  const updateAlinhamentoParcela = (
    parcelaId: string,
    value: 'inferior-impar' | 'inferior-par',
  ) => {
    setConfiguracoes((current) => ({
      ...current,
      [parcelaId]: {
        ...criarConfigParcela(current[parcelaId]),
        alinhamentoTipo: value,
      },
    }));
  };

  const updateSentidoParcela = (parcelaId: string, value: SentidoRuas) => {
    setConfiguracoes((current) => ({
      ...current,
      [parcelaId]: {
        ...criarConfigParcela(current[parcelaId]),
        sentidoRuas: value,
      },
    }));
  };

  const updateRuasParcela = (
    parcelaId: string,
    field: 'ruasEquipe1' | 'ruasEquipe2',
    value: string,
  ) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 3);
    setConfiguracoes((current) => ({
      ...current,
      [parcelaId]: {
        ...criarConfigParcela(current[parcelaId]),
        [field]: sanitized,
      },
    }));
  };

  const updateFalhaParcela = (
    parcelaId: string,
    field: 'falhasLinhas' | 'alinhamentoFalha',
    value: string,
  ) => {
    const nextValue =
      field === 'falhasLinhas'
        ? value.replace(/[^\d,\-;–\s]/g, '')
        : value;

    setConfiguracoes((current) => ({
      ...current,
      [parcelaId]: {
        ...criarConfigParcela(current[parcelaId]),
        [field]: nextValue,
      },
    }));
  };

  const planejamentoEquipes = useMemo(() => {
    const planejamento = [];
    const ruasEq1PorParcela = getRuasConfiguradasPorParcela('ruasEquipe1');
    const ruasEq2PorParcela = getRuasConfiguradasPorParcela('ruasEquipe2');

    if (equipe1) {
      planejamento.push({
        equipeId: equipe1.id,
        equipeNome: String(equipe1.numero).padStart(2, '0'),
        ordem: 1,
        linhaInicio: duasEquipes && linhaInicioEq1 ? Number(linhaInicioEq1) : null,
        linhaFim: duasEquipes && linhaFimEq1 ? Number(linhaFimEq1) : null,
        totalRuas: totalRuasConfiguradasEq1,
        ruasPorParcela: selecionadas.length > 1 ? ruasEq1PorParcela : undefined,
      });
    }

    if (duasEquipes && equipe2) {
      planejamento.push({
        equipeId: equipe2.id,
        equipeNome: String(equipe2.numero).padStart(2, '0'),
        ordem: 2,
        linhaInicio: linhaInicioEq2 ? Number(linhaInicioEq2) : null,
        linhaFim: linhaFimEq2 ? Number(linhaFimEq2) : null,
        totalRuas: totalRuasConfiguradasEq2,
        ruasPorParcela: selecionadas.length > 1 ? ruasEq2PorParcela : undefined,
      });
    }

    return planejamento;
  }, [
    duasEquipes,
    equipe1,
    equipe2,
    linhaFimEq1,
    linhaFimEq2,
    linhaInicioEq1,
    linhaInicioEq2,
    totalRuasConfiguradasEq1,
    totalRuasConfiguradasEq2,
    configuracoes,
    selecionadas,
  ]);

  const preview = useMemo(() => {
    if (!todasConfiguradas || !ruasPorParcelaConfiguradas || !equipe1) return [];

    return planejarParcelasAvaliacao({
      parcelas: parcelasConfiguradas,
      planejamentoEquipes,
      alinhamentoTipo,
      sentidoRuas,
    });
  }, [
    alinhamentoTipo,
    parcelasConfiguradas,
    planejamentoEquipes,
    ruasPorParcelaConfiguradas,
    sentidoRuas,
    todasConfiguradas,
    equipe1,
  ]);

  const canGoNext = () => {
    if (isEditMode && (editDataLoading || !editData)) return false;
    if (step === 'participantes') {
      if (!dataColheita) return false;
      if (temMaisPessoas === null) return false;
      if (temMaisPessoas === true && participanteIds.length === 0) return false;
      return true;
    }
    if (step === 'parcelas') return selecionadas.length > 0;
    if (step === 'equipes') {
      return (
        todasConfiguradas &&
        ruasPorParcelaConfiguradas &&
        Boolean(equipe1Id) &&
        totalRuasConfiguradasEq1 > 0 &&
        (!duasEquipes || (Boolean(equipe2Id) && totalRuasConfiguradasEq2 > 0))
      );
    }
    return true;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dispositivo) {
        throw new Error('Usuário ou dispositivo indisponível.');
      }
      if (!dataColheita) {
        throw new Error('Selecione a data da colheita antes de iniciar.');
      }
      if (!responsavelId) {
        throw new Error('Defina um responsável principal antes de iniciar.');
      }
      if (temMaisPessoas === true && participanteIds.length === 0) {
        throw new Error('Selecione ao menos um ajudante para continuar.');
      }

      const payload = {
        usuarioId: responsavelId || usuarioAtual?.id || '',
        dispositivoId: dispositivo.id,
        dataColheita,
        observacoes,
        participanteIds: temMaisPessoas ? participanteIds : [],
        parcelaPlanejadaIds,
        acompanhado: temMaisPessoas === true,
        equipeId: equipe1Id || null,
        equipeNome: equipe1?.nome || '',
        alinhamentoTipo,
        sentidoRuas,
        ordemColeta,
        modoCalculo,
        planejamentoEquipes,
        parcelas: parcelasConfiguradas,
      };

      if (isEditMode) {
        if (!editingId || !editData) {
          throw new Error('Avaliação indisponível para edição.');
        }

        return atualizarAvaliacaoConfiguracao({
          ...payload,
          avaliacaoId: editingId,
          dataAvaliacao: dataAvaliacaoEdicao,
          responsavelId: responsavelId || editData.avaliacao.usuarioId,
        });
      }

      if (!usuarioAtual) {
        throw new Error('Usuário indisponível.');
      }

      return criarAvaliacao(payload);
    },
    onSuccess: async (result) => {
      if (!result) return;
      await queryClient.invalidateQueries();
      navigate(`/avaliacoes/${result.avaliacao.id}`);
    },
  });

  const handleSubmit = () => {
    if (
      isEditMode &&
      !confirm(
        'Salvar esta edição completa? O app vai atualizar parcelas, equipes e ruas preservando os registros atuais sempre que a mesma parcela e a mesma rua continuarem na avaliação.',
      )
    ) {
      return;
    }

    mutation.mutate();
  };

  const next = () => {
    if (step === 'participantes') setStep('parcelas');
    else if (step === 'parcelas') setStep('equipes');
    else if (step === 'equipes') setStep('revisao');
  };

  const back = () => {
    if (step === 'parcelas') setStep('participantes');
    else if (step === 'equipes') setStep('parcelas');
    else if (step === 'revisao') setStep('equipes');
  };

  const renderProgress = () => {
    const steps: { key: Step; label: string; icon: any }[] = [
      { key: 'participantes', label: 'Equipe', icon: Users2 },
      { key: 'parcelas', label: 'Parcelas', icon: Palmtree },
      { key: 'equipes', label: 'Linhas', icon: Layout },
      { key: 'revisao', label: 'Revisão', icon: ShieldCheck },
    ];
    const currentIdx = steps.findIndex(s => s.key === step);
    
    return (
      <div className="stack-md py-2">
        <div className="flex gap-1.5 px-1">
          {steps.map((s, idx) => (
            <div 
              key={s.key} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                idx <= currentIdx
                  ? 'bg-[var(--qc-primary)] shadow-[0_0_8px_rgba(0,107,68,0.28)]'
                  : 'bg-[var(--qc-border)]'
              }`} 
            />
          ))}
        </div>
        <div className="flex items-center justify-between px-1">
           {steps.map((s, idx) => {
             const Icon = s.icon;
             const isCurrent = idx === currentIdx;
             const isPast = idx < currentIdx;
             return (
               <div key={s.key} className="flex flex-col items-center gap-1 w-16">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all ${
                    isCurrent
                      ? 'bg-[var(--qc-primary)] text-white scale-110'
                      : isPast
                        ? 'bg-[var(--qc-tertiary)] text-[var(--qc-primary)]'
                        : 'bg-[var(--qc-surface-muted)] text-[rgba(93,98,78,0.42)]'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${
                    isCurrent ? 'text-[var(--qc-primary)]' : 'text-[var(--qc-secondary)]'
                  }`}>
                    {s.label}
                  </span>
               </div>
             );
           })}
        </div>
      </div>
    );
  };

  const podeConfigurarAvaliacao =
    canStartEvaluation(usuarioAtual?.perfil, permissionMatrix) ||
    (isEditMode &&
      canEditCompletedEvaluation(usuarioAtual?.perfil, permissionMatrix));

  if (!podeConfigurarAvaliacao) {
    return (
      <LayoutMobile
        title={isEditMode ? 'Editar avaliação' : 'Avaliação'}
        subtitle="Acesso restrito"
        onBack={() =>
          navigate(isEditMode ? `/detalhe/${editingId}` : '/dashboard')
        }
      >
        <AccessDeniedCard description="A abertura da avaliação e a edição da configuração só aparecem quando essa função está liberada para o seu perfil pelo administrador." />
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title={isEditMode ? 'Editar avaliação' : 'Avaliação'}
      subtitle={
        isEditMode
          ? 'Reconfigure parcelas, equipes e alinhamentos'
          : 'Fluxo guiado de coleta'
      }
      onBack={() =>
        step === 'participantes'
          ? navigate(isEditMode ? `/avaliacoes/${editingId}` : '/dashboard')
          : back()
      }
    >
      <div className="stack-lg">
        {isEditMode && editDataLoading ? (
          <Card className="surface-card rounded-[22px] border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                Carregando avaliação
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Buscando a configuração atual para liberar a edição completa das parcelas.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {renderProgress()}

        {step === 'participantes' && (
          <div className="stack-lg">
            <Card className="surface-card overflow-hidden rounded-[22px] border-none shadow-sm">
              <div className="flex items-center gap-3 bg-[var(--qc-primary-strong)] px-4 py-4">
                <Users2 className="h-6 w-6 text-white/82" />
                <h2 className="text-lg font-black text-white tracking-tight uppercase">Equipe de Coleta</h2>
              </div>
              <CardContent className="stack-md p-4">
                <div className="stack-sm rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[var(--qc-primary)]" />
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                      Data da Colheita
                    </p>
                  </div>
                  <p className="text-sm text-[var(--qc-text-muted)]">
                    {parcelaPlanejadaIds.length > 0
                      ? 'Campo carregado automaticamente a partir da parcela planejada selecionada.'
                      : 'Campo obrigatório para registrar a jornada e contextualizar o relatório.'}
                  </p>
                  <Input
                    type="date"
                    className="h-12 rounded-2xl bg-white font-bold"
                    value={dataColheita}
                    disabled={parcelaPlanejadaIds.length > 0}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDataColheita(event.target.value)}
                    required
                  />
                </div>

                <div className="stack-sm rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-[var(--qc-primary)]" />
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                        Responsável principal
                      </p>
                    </div>
                    <Badge className="border-none bg-[var(--qc-primary)] text-white">
                      Principal
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3 rounded-[16px] bg-[var(--qc-tertiary)] px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--qc-primary)] text-white">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-[var(--qc-primary)]">
                        {responsavelAtual?.primeiroNome || 'Responsável'}
                      </span>
                      <span className="text-xs font-semibold text-[var(--qc-text-muted)]">
                        {responsavelAtual?.matricula || 'Matrícula não informada'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="stack-sm">
                  <p className="text-sm font-bold uppercase tracking-widest text-[var(--qc-secondary)]">PERGUNTA</p>
                  <p className="text-lg font-bold leading-tight text-[var(--qc-text)]">
                    Você fará esta coleta sozinho ou acompanhado?
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <Button
                    type="button"
                    variant={temMaisPessoas === false ? 'default' : 'outline'}
                    className={cn(
                      "h-12 rounded-[18px] font-black text-sm transition-all active:scale-[0.98]",
                      temMaisPessoas === false 
                        ? "border-none bg-[var(--qc-primary)] text-white" 
                        : "border-2 border-[var(--qc-border-strong)] bg-white text-[var(--qc-secondary)]"
                    )}
                    onClick={() => {
                      setTemMaisPessoas(false);
                      setParticipanteIds([]);
                    }}
                  >
                    Sozinho
                  </Button>
                  <Button
                    type="button"
                    variant={temMaisPessoas === true ? 'default' : 'outline'}
                    className={cn(
                      "h-12 rounded-[18px] font-black text-sm transition-all active:scale-[0.98]",
                      temMaisPessoas === true 
                        ? "border-none bg-[var(--qc-primary)] text-white" 
                        : "border-2 border-[var(--qc-border-strong)] bg-white text-[var(--qc-secondary)]"
                    )}
                    onClick={() => setTemMaisPessoas(true)}
                  >
                    Acompanhado
                  </Button>
                </div>

                {temMaisPessoas && (
                  <div className="mt-6 stack-md animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--qc-secondary)]">SELECIONAR AJUDANTES</span>
                      <Link 
                        to={`/colaboradores/cadastro?quick=1&returnTo=${encodeURIComponent(isEditMode ? `/avaliacoes/${editingId}/editar` : '/avaliacoes/nova')}`}
                        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--qc-primary)]"
                      >
                        <Plus className="h-3 w-3" />
                        CADASTRAR NOVO
                      </Link>
                    </div>

                    {participanteIds.length === 0 ? (
                      <p className="text-xs font-semibold text-[var(--qc-danger)]">
                        Selecione pelo menos um ajudante para continuar.
                      </p>
                    ) : null}

                    {participanteIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {colaboradores
                          .filter((item) => participanteIds.includes(item.id))
                          .map((colaborador) => (
                            <Badge
                              key={colaborador.id}
                              className="border-none bg-[var(--qc-primary)] text-white"
                            >
                              {colaborador.primeiroNome}
                            </Badge>
                          ))}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      {colaboradores
                        .filter((item) => item.id !== responsavelId)
                        .map((colaborador) => {
                          const ativo = participanteIds.includes(colaborador.id);
                          return (
                            <Button
                              key={colaborador.id}
                              type="button"
                              className={cn(
                                "h-12 justify-start gap-3 rounded-[18px] transition-all border-2",
                                ativo 
                                  ? "border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] text-[var(--qc-primary)] shadow-sm" 
                                  : "border-[var(--qc-border)] bg-white text-[var(--qc-secondary)]"
                              )}
                              onClick={() =>
                                setParticipanteIds((current) =>
                                  ativo
                                    ? current.filter((item) => item !== colaborador.id)
                                    : [...current, colaborador.id],
                                )
                              }
                            >
                              <div className={cn(
                                "h-7 w-7 rounded-xl flex items-center justify-center transition-all",
                                ativo
                                  ? "bg-[var(--qc-primary)] text-white rotate-[360deg]"
                                  : "bg-[var(--qc-surface-muted)] text-[var(--qc-text-muted)]"
                              )}>
                                <UserPlus className="h-3.5 w-3.5" />
                              </div>
                              <span className="truncate text-xs font-black uppercase tracking-tight">
                                {colaborador.primeiroNome}
                              </span>
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'parcelas' && (
          <div className="stack-lg">
             <Card className="surface-card overflow-hidden rounded-[22px] border-none shadow-sm">
                <div className="flex items-center justify-between bg-[var(--qc-primary-strong)] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Palmtree className="h-6 w-6 text-white/82" />
                    <h2 className="text-lg font-black text-white tracking-tight uppercase">Seleção de Parcelas</h2>
                  </div>
                  <Badge className="border-none bg-white/16 px-3 py-1 font-black text-white">
                    {selecionadas.length} / {MAX_PARCELAS}
                  </Badge>
                </div>
                <CardContent className="stack-md p-4">
                  <div className="stack-sm">
                    <p className="text-sm font-bold uppercase tracking-widest text-[var(--qc-secondary)]">BUSCA</p>
                    <div className="relative">
                      <Input
                        value={buscaParcela}
                        className="h-12 rounded-[18px] pl-12 font-bold text-base"
                        placeholder="Código (Ex: G-111)"
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          setBuscaParcela(formatarCodigoParcela(event.target.value))
                        }
                      />
                      <div className="absolute left-4 top-4">
                        <Plus className="h-6 w-6 text-[rgba(93,98,78,0.42)]" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <ListaParcelas
                      parcelas={parcelasFiltradas}
                      configuradas={configuracoes}
                      selecionadas={selecionadas}
                      onSelect={handleToggleParcela}
                    />
                  </div>

                  {selecionadas.length > 0 ? (
                    <div className="stack-sm border-t border-[var(--qc-border)] pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-[var(--qc-secondary)]">
                          Parcelas Selecionadas
                        </p>
                        <Badge variant="slate">{selecionadas.length} ativa(s)</Badge>
                      </div>

                      <div className="stack-sm">
                        {selecionadas
                          .map((parcelaId) => ({
                            parcela:
                              parcelasCatalogo.find((item) => item.id === parcelaId) || null,
                            config: configuracoes[parcelaId] || null,
                          }))
                          .filter((item) => item.parcela)
                          .map(({ parcela, config }) => {
                            const linhaInicial = Number(config?.linhaInicial || 0);
                            const linhaFinal = Number(config?.linhaFinal || 0);
                            const pronta =
                              linhaInicial > 0 &&
                              linhaFinal > 0 &&
                              linhaFinal >= linhaInicial;

                            return (
                            <div
                              key={parcela!.id}
                              className="rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                                    {parcela!.codigo}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-[var(--qc-text-muted)]">
                                    {pronta
                                      ? `Linhas ${linhaInicial} a ${linhaFinal}`
                                      : 'As linhas serão definidas na próxima etapa.'}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Badge variant={pronta ? 'emerald' : 'slate'}>
                                    {pronta ? 'Pronta' : 'Pendente'}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="h-10 w-10 shrink-0 rounded-2xl"
                                    onClick={() => handleRemoveParcela(parcela!.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
             </Card>
          </div>
        )}

        {step === 'equipes' && (
          <div className="stack-lg">
             <Card className="surface-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] px-5 py-4">
                   <div className="flex items-center gap-3">
                    <Layout className="h-5 w-5 text-[var(--qc-primary)]" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--qc-primary)]">Configuração de Ruas</h2>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-8 font-bold text-[var(--qc-primary)]">
                    <Link to="/equipes">Equipes</Link>
                  </Button>
                </div>
                <CardContent className="stack-md p-5">
                  <div className="rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3">
                    <p className="text-sm text-[var(--qc-text-muted)]">
                      As equipes cadastradas são compartilhadas com todos os usuários
                      do app.
                    </p>
                  </div>

                  <div className="stack-md">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                        Parcelas Selecionadas
                      </label>
                      <Badge variant="slate">{selecionadas.length} parcela(s)</Badge>
                    </div>

                    <div className="stack-sm">
                      {selecionadas
                        .map((parcelaId) => ({
                          parcela:
                            parcelasCatalogo.find((item) => item.id === parcelaId) || null,
                          config: configuracoes[parcelaId] || {
                            linhaInicial: '',
                            linhaFinal: '',
                            alinhamentoTipo,
                            alinhamentoFalha: alinhamentoTipo,
                            falhasLinhas: '',
                            sentidoRuas,
                          },
                        }))
                        .filter((item) => item.parcela)
                        .map(({ parcela, config }) => {
                          const pronta =
                            Number(config.linhaInicial) > 0 &&
                            Number(config.linhaFinal) >= Number(config.linhaInicial);
                          const alinhamentoParcela =
                            config.alinhamentoTipo || alinhamentoTipo;
                          const sentidoParcela = config.sentidoRuas || sentidoRuas;
                          const parcelaPlanejadaSelecionada =
                            parcelaPlanejadaPorParcelaId.get(parcela!.id) || null;
                          const bloqueadaPorPlanejamento = Boolean(
                            parcelaPlanejadaSelecionada,
                          );

                          return (
                            <div
                              key={parcela!.id}
                              className="rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-base font-black tracking-tight text-[var(--qc-text)]">
                                    {parcela!.codigo}
                                  </p>
                                  <p className="mt-1 text-xs font-medium text-[var(--qc-text-muted)]">
                                    {bloqueadaPorPlanejamento
                                      ? 'Linhas carregadas do cadastro da parcela do dia.'
                                      : 'Defina início e fim apenas nesta etapa.'}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {bloqueadaPorPlanejamento ? (
                                    <Badge variant="default">Planejada</Badge>
                                  ) : null}
                                  <Badge variant={pronta ? 'emerald' : 'slate'}>
                                    {pronta ? 'Pronta' : 'Pendente'}
                                  </Badge>
                                </div>
                              </div>

                              <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="stack-sm">
                                  <span className="ml-1 text-[10px] font-bold text-[var(--qc-secondary)]">
                                    LINHA INÍCIO
                                  </span>
                                  <Input
                                    type="number"
                                    className="h-11 rounded-xl text-center font-bold"
                                    placeholder="01"
                                    value={config.linhaInicial}
                                    disabled={bloqueadaPorPlanejamento}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                      updateConfigParcela(
                                        parcela!.id,
                                        'linhaInicial',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                                <div className="stack-sm">
                                  <span className="ml-1 text-[10px] font-bold text-[var(--qc-secondary)]">
                                    LINHA FIM
                                  </span>
                                  <Input
                                    type="number"
                                    className="h-11 rounded-xl text-center font-bold"
                                    placeholder="80"
                                    value={config.linhaFinal}
                                    disabled={bloqueadaPorPlanejamento}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                      updateConfigParcela(
                                        parcela!.id,
                                        'linhaFinal',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                              </div>

                              <div className="mt-4 stack-sm">
                                <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                                  FALHA INTERNA DA PARCELA
                                </span>
                                <p className="text-xs text-[var(--qc-text-muted)]">
                                  Informe a faixa sem linhas ou ruas para não gerar ruas nesse trecho.
                                </p>

                                <div className="grid grid-cols-2 gap-2">
                                  <Button
                                    type="button"
                                    variant={
                                      config.alinhamentoFalha === 'inferior-impar'
                                        ? 'default'
                                        : 'outline'
                                    }
                                    className={`h-11 rounded-xl ${
                                      config.alinhamentoFalha === 'inferior-impar'
                                        ? 'bg-[var(--qc-primary)] text-white'
                                        : 'bg-white text-[var(--qc-secondary)]'
                                    }`}
                                    onClick={() =>
                                      updateFalhaParcela(
                                        parcela!.id,
                                        'alinhamentoFalha',
                                        'inferior-impar',
                                      )
                                    }
                                  >
                                    Falha Ímpar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={
                                      config.alinhamentoFalha === 'inferior-par'
                                        ? 'default'
                                        : 'outline'
                                    }
                                    className={`h-11 rounded-xl ${
                                      config.alinhamentoFalha === 'inferior-par'
                                        ? 'bg-[var(--qc-primary)] text-white'
                                        : 'bg-white text-[var(--qc-secondary)]'
                                    }`}
                                    onClick={() =>
                                      updateFalhaParcela(
                                        parcela!.id,
                                        'alinhamentoFalha',
                                        'inferior-par',
                                      )
                                    }
                                  >
                                    Falha Par
                                  </Button>
                                </div>

                                <Input
                                  type="tel"
                                  inputMode="tel"
                                  autoComplete="off"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  pattern="[0-9,\-;–\s]*"
                                  className="h-11 rounded-xl text-center font-bold"
                                  placeholder="Ex: 101-130, 141-150"
                                  value={config.falhasLinhas}
                                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                    updateFalhaParcela(
                                      parcela!.id,
                                      'falhasLinhas',
                                      event.target.value,
                                    )
                                  }
                                />

                                <p className="text-[11px] text-[var(--qc-text-muted)]">
                                  Use vírgula para mais de uma faixa. O alinhamento informado vale para
                                  todas as falhas desta parcela.
                                </p>
                              </div>

                              {selecionadas.length > 1 ? (
                                <div className="mt-4 stack-sm">
                                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                                    RUAS POR EQUIPE NESTA PARCELA
                                  </span>

                                  <div className={cn('grid gap-3', duasEquipes && 'sm:grid-cols-2')}>
                                    <div className="rounded-2xl border border-[var(--qc-border)] bg-white p-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                                            {equipe1
                                              ? `Equipe ${String(equipe1.numero).padStart(2, '0')}`
                                              : 'Equipe principal'}
                                          </p>
                                          <p className="mt-1 text-xs text-[var(--qc-text-muted)]">
                                            Defina quantas ruas esta equipe fará aqui.
                                          </p>
                                        </div>
                                        <Badge variant="emerald">
                                          {formatarQuantidadeRuas(
                                            Math.max(0, Number(config.ruasEquipe1 || 0)),
                                          )}
                                        </Badge>
                                      </div>

                                      <div className="mt-3 flex h-11 items-center overflow-hidden rounded-xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)]">
                                        <button
                                          type="button"
                                          className="h-full border-r border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                                          onClick={() =>
                                            updateRuasParcela(
                                              parcela!.id,
                                              'ruasEquipe1',
                                              String(
                                                clamp(
                                                  Number(config.ruasEquipe1 || 0) - 1,
                                                  0,
                                                  68,
                                                ),
                                              ),
                                            )
                                          }
                                        >
                                          -
                                        </button>
                                        <input
                                          type="number"
                                          min="0"
                                          className="w-full bg-transparent text-center font-bold text-[var(--qc-text)] focus:outline-none"
                                          value={config.ruasEquipe1}
                                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                            updateRuasParcela(
                                              parcela!.id,
                                              'ruasEquipe1',
                                              event.target.value,
                                            )
                                          }
                                        />
                                        <button
                                          type="button"
                                          className="h-full border-l border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                                          onClick={() =>
                                            updateRuasParcela(
                                              parcela!.id,
                                              'ruasEquipe1',
                                              String(
                                                clamp(
                                                  Number(config.ruasEquipe1 || 0) + 1,
                                                  0,
                                                  68,
                                                ),
                                              ),
                                            )
                                          }
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    {duasEquipes ? (
                                      <div className="rounded-2xl border border-[var(--qc-border)] bg-white p-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                                              {equipe2
                                                ? `Equipe ${String(equipe2.numero).padStart(2, '0')}`
                                                : 'Segunda equipe'}
                                            </p>
                                            <p className="mt-1 text-xs text-[var(--qc-text-muted)]">
                                              Opcional nesta parcela quando a segunda equipe participar.
                                            </p>
                                          </div>
                                          <Badge variant="emerald">
                                            {formatarQuantidadeRuas(
                                              Math.max(0, Number(config.ruasEquipe2 || 0)),
                                            )}
                                          </Badge>
                                        </div>

                                        <div className="mt-3 flex h-11 items-center overflow-hidden rounded-xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)]">
                                          <button
                                            type="button"
                                            className="h-full border-r border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                                            onClick={() =>
                                              updateRuasParcela(
                                                parcela!.id,
                                                'ruasEquipe2',
                                                String(
                                                  clamp(
                                                    Number(config.ruasEquipe2 || 0) - 1,
                                                    0,
                                                    68,
                                                  ),
                                                ),
                                              )
                                            }
                                          >
                                            -
                                          </button>
                                          <input
                                            type="number"
                                            min="0"
                                            className="w-full bg-transparent text-center font-bold text-[var(--qc-text)] focus:outline-none"
                                            value={config.ruasEquipe2}
                                            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                              updateRuasParcela(
                                                parcela!.id,
                                                'ruasEquipe2',
                                                event.target.value,
                                              )
                                            }
                                          />
                                          <button
                                            type="button"
                                            className="h-full border-l border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                                            onClick={() =>
                                              updateRuasParcela(
                                                parcela!.id,
                                                'ruasEquipe2',
                                                String(
                                                  clamp(
                                                    Number(config.ruasEquipe2 || 0) + 1,
                                                    0,
                                                    68,
                                                  ),
                                                ),
                                              )
                                            }
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}

                              {selecionadas.length > 1 ? (
                                <div className="mt-4 stack-sm">
                                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                                    TIPO DE INÍCIO DESTA PARCELA
                                  </span>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      type="button"
                                      variant={
                                        alinhamentoParcela === 'inferior-impar'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={`h-12 rounded-xl ${
                                        alinhamentoParcela === 'inferior-impar'
                                          ? 'bg-[var(--qc-primary)] text-white'
                                          : 'bg-white text-[var(--qc-secondary)]'
                                      }`}
                                      onClick={() =>
                                        updateAlinhamentoParcela(
                                          parcela!.id,
                                          'inferior-impar',
                                        )
                                      }
                                    >
                                      Ímpar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={
                                        alinhamentoParcela === 'inferior-par'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={`h-12 rounded-xl ${
                                        alinhamentoParcela === 'inferior-par'
                                          ? 'bg-[var(--qc-primary)] text-white'
                                          : 'bg-white text-[var(--qc-secondary)]'
                                      }`}
                                      onClick={() =>
                                        updateAlinhamentoParcela(
                                          parcela!.id,
                                          'inferior-par',
                                        )
                                      }
                                    >
                                      Par
                                    </Button>
                                  </div>
                                </div>
                              ) : null}

                              {selecionadas.length > 1 ? (
                                <div className="mt-4 stack-sm">
                                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                                    SENTIDO DA COLETA DESTA PARCELA
                                  </span>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button
                                      type="button"
                                      variant={
                                        sentidoParcela === 'inicio'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={`h-12 rounded-xl ${
                                        sentidoParcela === 'inicio'
                                          ? 'bg-[var(--qc-primary)] text-white'
                                          : 'bg-white text-[var(--qc-secondary)]'
                                      }`}
                                      onClick={() =>
                                        updateSentidoParcela(parcela!.id, 'inicio')
                                      }
                                    >
                                      Do início
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={
                                        sentidoParcela === 'fim'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={`h-12 rounded-xl ${
                                        sentidoParcela === 'fim'
                                          ? 'bg-[var(--qc-primary)] text-white'
                                          : 'bg-white text-[var(--qc-secondary)]'
                                      }`}
                                      onClick={() =>
                                        updateSentidoParcela(parcela!.id, 'fim')
                                      }
                                    >
                                      Do final
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {selecionadas.length === 1 ? (
                    <div className="stack-sm">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">Tipo de Início</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={alinhamentoTipo === 'inferior-impar' ? 'default' : 'outline'}
                          className={`h-12 rounded-xl ${alinhamentoTipo === 'inferior-impar' ? 'bg-[var(--qc-primary)] text-white' : 'bg-white text-[var(--qc-secondary)]'}`}
                          onClick={() => setAlinhamentoTipo('inferior-impar')}
                        >
                          Ímpar
                        </Button>
                        <Button
                          type="button"
                          variant={alinhamentoTipo === 'inferior-par' ? 'default' : 'outline'}
                          className={`h-12 rounded-xl ${alinhamentoTipo === 'inferior-par' ? 'bg-[var(--qc-primary)] text-white' : 'bg-white text-[var(--qc-secondary)]'}`}
                          onClick={() => setAlinhamentoTipo('inferior-par')}
                        >
                          Par
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3">
                      <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                        Com mais de uma parcela, o tipo de início é definido separadamente em cada parcela acima.
                      </p>
                    </div>
                  )}

                  {selecionadas.length === 1 ? (
                    <div className="stack-sm">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">Sentido da Coleta</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={sentidoRuas === 'inicio' ? 'default' : 'outline'}
                          className={`h-12 rounded-xl ${
                            sentidoRuas === 'inicio' ? 'bg-[var(--qc-primary)] text-white' : 'bg-white text-[var(--qc-secondary)]'
                          }`}
                          onClick={() => setSentidoRuas('inicio')}
                        >
                          Do início
                        </Button>
                        <Button
                          type="button"
                          variant={sentidoRuas === 'fim' ? 'default' : 'outline'}
                          className={`h-12 rounded-xl ${
                            sentidoRuas === 'fim' ? 'bg-[var(--qc-primary)] text-white' : 'bg-white text-[var(--qc-secondary)]'
                          }`}
                          onClick={() => setSentidoRuas('fim')}
                        >
                          Do final
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3">
                      <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                        Com mais de uma parcela, o sentido da coleta é definido separadamente em cada parcela acima.
                      </p>
                    </div>
                  )}

                  <div className="stack-sm rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                        Cálculo
                      </label>
                      <Badge variant="emerald">{formatarModoCalculo(modoCalculo)}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={modoCalculo === 'manual' ? 'default' : 'outline'}
                        className={`h-12 rounded-xl ${
                          modoCalculo === 'manual'
                            ? 'bg-[var(--qc-primary)] text-white'
                            : 'bg-white text-[var(--qc-secondary)]'
                        }`}
                        onClick={() => setModoCalculo('manual')}
                      >
                        Manual
                      </Button>
                      <Button
                        type="button"
                        variant={modoCalculo === 'media_vizinhas' ? 'default' : 'outline'}
                        className={`h-12 rounded-xl ${
                          modoCalculo === 'media_vizinhas'
                            ? 'bg-[var(--qc-primary)] text-white'
                            : 'bg-white text-[var(--qc-secondary)]'
                        }`}
                        onClick={() => setModoCalculo('media_vizinhas')}
                      >
                        Média vizinha
                      </Button>
                    </div>
                    <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                      Quando ativado, a rua pode ser estimada pela média entre a anterior e a posterior, com arredondamento automático.
                    </p>
                  </div>

                  <div className="stack-md border-t border-[var(--qc-border)] pt-2">
                    <div className="flex items-center justify-between">
                       <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">Equipe Principal</label>
                       {equipe1 && <Badge variant="emerald">EQ {equipe1.numero}</Badge>}
                    </div>
                    
                    <Select value={equipe1Id} onValueChange={setEquipe1Id}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="Selecione a equipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipes.map((equipe) => (
                          <SelectItem key={equipe.id} value={equipe.id}>
                            {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selecionadas.length === 1 ? (
                      <div className="flex items-center gap-3">
                        <span className="whitespace-nowrap text-sm font-bold text-[var(--qc-secondary)]">QTD RUAS:</span>
                        <div className="flex h-11 flex-1 items-center overflow-hidden rounded-xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)]">
                          <button 
                            type="button"
                            className="h-full border-r border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                            onClick={() => setTotalRuasEq1(p => clamp(p - 1, 1, 68))}
                          >-</button>
                          <input 
                            type="number" 
                            className="w-full text-center bg-transparent border-none font-bold"
                            value={totalRuasEq1}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTotalRuasEq1(Number(e.target.value))}
                          />
                           <button 
                            type="button"
                            className="h-full border-l border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                            onClick={() => setTotalRuasEq1(p => clamp(p + 1, 1, 68))}
                          >+</button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                            A quantidade desta equipe é definida parcela por parcela acima.
                          </p>
                          <Badge variant="emerald">
                            {formatarQuantidadeRuas(totalRuasConfiguradasEq1)}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {duasEquipes ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="stack-sm">
                          <span className="ml-1 text-[10px] font-bold text-[var(--qc-secondary)]">LINHA INÍCIO</span>
                          <Input 
                            type="number" 
                            className="h-11 rounded-xl text-center font-bold" 
                            placeholder="01"
                            value={linhaInicioEq1}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinhaInicioEq1(e.target.value)}
                          />
                        </div>
                        <div className="stack-sm">
                          <span className="ml-1 text-[10px] font-bold text-[var(--qc-secondary)]">LINHA FIM</span>
                          <Input 
                            type="number" 
                            className="h-11 rounded-xl text-center font-bold" 
                            placeholder="80"
                            value={linhaFimEq1}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinhaFimEq1(e.target.value)}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3">
                        <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                          Com uma equipe, a faixa segue automaticamente as linhas definidas nas parcelas acima.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--qc-border)] pt-2">
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                        duasEquipes
                          ? 'border border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)]'
                          : 'border border-[var(--qc-border)] bg-[var(--qc-surface-muted)]'
                      }`}
                      onClick={() => setDuasEquipes(!duasEquipes)}
                    >
                      <span className="text-sm font-bold text-[var(--qc-text)]">Duas equipes na avaliação?</span>
                      <Badge variant="default" className={duasEquipes ? 'border-none bg-[var(--qc-primary)] text-white' : ''}>{duasEquipes ? 'SIM' : 'NÃO'}</Badge>
                    </button>
                  </div>

                  {duasEquipes && (
                    <div className="mt-2 stack-md animate-in fade-in slide-in-from-top-2">
                       <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">Segunda Equipe</label>
                        {equipe2 && <Badge variant="emerald">EQ {equipe2.numero}</Badge>}
                      </div>
                      
                      <Select value={equipe2Id} onValueChange={setEquipe2Id}>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Selecione a equipe" />
                        </SelectTrigger>
                        <SelectContent>
                          {equipes.filter(e => e.id !== equipe1Id).map((equipe) => (
                            <SelectItem key={equipe.id} value={equipe.id}>
                              {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selecionadas.length === 1 ? (
                        <div className="flex items-center gap-3">
                          <span className="whitespace-nowrap text-sm font-bold text-[var(--qc-secondary)]">QTD RUAS:</span>
                          <div className="flex h-11 flex-1 items-center overflow-hidden rounded-xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)]">
                            <button 
                              type="button"
                              className="h-full border-r border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                              onClick={() => setTotalRuasEq2(p => clamp(p - 1, 1, 68))}
                            >-</button>
                            <input 
                              type="number" 
                              className="w-full text-center bg-transparent border-none font-bold"
                              value={totalRuasEq2}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTotalRuasEq2(Number(e.target.value))}
                            />
                            <button 
                              type="button"
                              className="h-full border-l border-[var(--qc-border)] px-4 font-bold text-[var(--qc-secondary)]"
                              onClick={() => setTotalRuasEq2(p => clamp(p + 1, 1, 68))}
                            >+</button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                              A quantidade desta equipe também é definida individualmente por parcela.
                            </p>
                            <Badge variant="emerald">
                              {formatarQuantidadeRuas(totalRuasConfiguradasEq2)}
                            </Badge>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="stack-sm">
                          <span className="ml-1 text-[10px] font-bold text-[var(--qc-secondary)]">LINHA INÍCIO</span>
                          <Input 
                            type="number" 
                            className="h-11 rounded-xl text-center font-bold" 
                            placeholder="01"
                            value={linhaInicioEq2}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinhaInicioEq2(e.target.value)}
                          />
                        </div>
                        <div className="stack-sm">
                          <span className="ml-1 text-[10px] font-bold text-[var(--qc-secondary)]">LINHA FIM</span>
                          <Input 
                            type="number" 
                            className="h-11 rounded-xl text-center font-bold" 
                            placeholder="80"
                            value={linhaFimEq2}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinhaFimEq2(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
             </Card>
          </div>
        )}

        {step === 'revisao' && (
          <div className="stack-lg">
             <Card className="surface-card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] px-5 py-4">
                   <ShieldCheck className="h-5 w-5 text-[var(--qc-primary)]" />
                   <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--qc-primary)]">Revisão do Planejamento</h2>
                </div>
                <CardContent className="stack-md p-5">
                   {isEditMode ? (
                   <div className="rounded-2xl border border-[rgba(197,58,53,0.18)] bg-[rgba(197,58,53,0.05)] px-4 py-3">
                       <p className="text-sm font-semibold text-[var(--qc-text)]">
                         Esta edição é completa.
                       </p>
                       <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                         Ao salvar, o planejamento será atualizado e os registros existentes serão mantidos sempre que a parcela e a rua correspondente continuarem nesta avaliação.
                       </p>
                     </div>
                   ) : null}

                   <div className="stack-sm">
                      <p className="text-xs font-bold uppercase tracking-widest text-[var(--qc-secondary)]">RESUMO DA OPERAÇÃO</p>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-[var(--qc-text-muted)]">Avaliado por:</span>
                           <span className="font-bold text-[var(--qc-text)]">
                             {responsavelAtual?.primeiroNome || usuarioAtual?.primeiroNome}
                           </span>
                        </div>
                        <div className="flex justify-between items-center gap-3 text-sm">
                           <span className="text-[var(--qc-text-muted)]">Data da colheita:</span>
                           <span className="text-right font-bold capitalize text-[var(--qc-text)]">
                             {formatarDataColheita(dataColheita)}
                           </span>
                        </div>
                        <div className="flex justify-between items-center gap-3 text-sm">
                           <span className="text-[var(--qc-text-muted)]">Data da avaliação:</span>
                           <span className="text-right font-bold capitalize text-[var(--qc-text)]">
                             {formatarDataColheita(
                               isEditMode
                                 ? dataAvaliacaoEdicao
                                 : editData?.avaliacao?.dataAvaliacao || todayIso(),
                             )}
                           </span>
                        </div>
                        {participanteIds.length > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-[var(--qc-text-muted)]">Ajudantes:</span>
                            <span className="text-right font-bold text-[var(--qc-text)]">
                              {colaboradores.filter(c => participanteIds.includes(c.id)).map(c => c.primeiroNome).join(', ')}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-[var(--qc-text-muted)]">Tipo Alinhamento:</span>
                           <span className="font-bold text-[var(--qc-text)]">
                             {selecionadas.length > 1
                               ? 'Definido por parcela'
                               : `Início ${formatarAlinhamentoTipo(alinhamentoTipo)}`}
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-[var(--qc-text-muted)]">Sentido:</span>
                           <span className="font-bold text-[var(--qc-text)]">
                             {selecionadas.length > 1
                               ? 'Definido por parcela'
                               : descreverSentidoRuas(sentidoRuas)}
                           </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-[var(--qc-text-muted)]">Cálculo:</span>
                           <span className="font-bold text-[var(--qc-text)]">
                             {formatarModoCalculo(modoCalculo)}
                           </span>
                        </div>
                      </div>
                   </div>

                   <div className="stack-md border-t border-[var(--qc-border)] pt-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-[var(--qc-secondary)]">PROGRAMAÇÃO POR PARCELA</p>
                      
                      <div className="stack-md">
                        {preview.map((item) => (
                           <div key={item.parcelaId} className="flex flex-col gap-3 rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                              <div className="flex items-center justify-between gap-3">
                                 <strong className="text-lg font-bold text-[var(--qc-text)]">{item.label}</strong>
                                 <div className="flex flex-wrap items-center justify-end gap-2">
                                   <Badge variant="emerald">{formatarQuantidadeRuas(item.ruasProgramadas.length)}</Badge>
                                   <Badge variant="slate">{formatarAlinhamentoTipo(item.alinhamentoTipo)}</Badge>
                                   <Badge variant="slate">{formatarSentidoRuas(item.sentidoRuas)}</Badge>
                                   <Badge variant="slate">L{item.linhaInicial}-{item.linhaFinal}</Badge>
                                 </div>
                              </div>
                              
                              <div className="stack-sm">
                                {item.faixasFalha.length > 0 ? (
                                  <div className="rounded-xl border border-[var(--qc-border)] bg-white p-3 shadow-sm">
                                    <div className="mb-1 flex items-start justify-between gap-3">
                                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">
                                        Falha do alinhamento
                                      </p>
                                      <Badge variant="amber">
                                        {item.faixasFalha.length} faixa(s)
                                      </Badge>
                                    </div>
                                    <p className="text-sm font-bold text-[var(--qc-secondary)]">
                                      {descreverFaixasFalha(item.faixasFalha)}
                                    </p>
                                  </div>
                                ) : null}

                                {item.previewRuasPorEquipe.map((faixa) => (
                                   <div key={faixa.id} className="rounded-xl border border-[var(--qc-border)] bg-white p-3 shadow-sm">
                                      <div className="mb-1 flex items-start justify-between gap-3">
                                         <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--qc-secondary)]">{faixa.label}</p>
                                         <div className="flex flex-wrap items-center justify-end gap-2">
                                           <Badge variant="emerald">{formatarQuantidadeRuas(faixa.ruas.length)}</Badge>
                                           <span className="text-[11px] font-bold text-[var(--qc-primary)]">L{faixa.inicio}-{faixa.fim}</span>
                                         </div>
                                      </div>
                                      <p className="text-sm font-bold text-[var(--qc-secondary)]">
                                        {faixa.ruas.map(([inicio, fim]) => `${inicio}-${fim}`).join(' • ')}
                                      </p>
                                   </div>
                                ))}
                              </div>
                           </div>
                        ))}
                      </div>
                   </div>

                   <div className="stack-sm border-t border-[var(--qc-border)] pt-4">
                     <p className="text-xs font-bold uppercase tracking-widest text-[var(--qc-secondary)]">OBSERVAÇÕES</p>
                     <Textarea
                        rows={2}
                        className="rounded-xl italic text-sm"
                        placeholder="Ex.: Área com relevo íngreme"
                        value={observacoes}
                        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setObservacoes(event.target.value)}
                      />
                   </div>
                </CardContent>
             </Card>
          </div>
        )}

        <div className="grid grid-cols-[1fr,2fr] gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-[18px] font-bold"
            disabled={step === 'participantes'}
            onClick={back}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {step === 'revisao' ? (
             <Button
                type="button"
                className="h-12 rounded-[18px] font-bold text-base"
                disabled={mutation.isPending || (isEditMode && (editDataLoading || !editData))}
                onClick={handleSubmit}
              >
                {mutation.isPending
                  ? isEditMode
                    ? 'Salvando avaliação'
                    : 'Iniciando avaliação'
                  : isEditMode
                    ? 'Salvar alterações'
                    : 'Iniciar Coleta'}
                <Check className="ml-2 h-5 w-5" />
             </Button>
          ) : (
            <Button
              type="button"
              className="h-12 rounded-[18px] font-bold text-base"
              disabled={!canGoNext()}
              onClick={next}
            >
              Próximo
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </LayoutMobile>
  );
}

