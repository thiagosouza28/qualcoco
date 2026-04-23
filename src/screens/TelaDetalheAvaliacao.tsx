import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, History, PencilLine, Wrench } from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { useCampoApp } from '@/core/AppProvider';
import { listarColaboradoresAtivos } from '@/core/auth';
import {
  criarRetoqueAvaliacao,
  marcarAvaliacaoParaRetoque,
  obterAvaliacaoDetalhada,
  registrarRetoque,
} from '@/core/evaluations';
import { todayIso } from '@/core/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getEvaluationStatusMeta } from '@/core/evaluationStatus';
import {
  canEditCompletedEvaluation,
  canOperateAssignedRetoque,
  canMarkRetoque,
  canStartRetoque,
  canViewHistory,
  filtrarEquipesVisiveis,
  normalizePapelAvaliacao,
  normalizePerfilUsuario,
} from '@/core/permissions';
import { obterApresentacaoEstadoColetaRua } from '@/core/registroRua';
import { useRolePermissions } from '@/core/useRolePermissions';
import {
  calcularProducaoPorCargas,
  formatarProducaoNumero,
} from '@/core/production';

const formatDateOnly = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const formatarNumeroResumoRua = (value?: number | string | null) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '--';
  return /^\d+$/.test(normalized) ? normalized.padStart(2, '0') : normalized;
};

const formatarFaixaRuaResumo = (
  linhaInicial?: number | string | null,
  linhaFinal?: number | string | null,
) => `${formatarNumeroResumoRua(linhaInicial)}-${formatarNumeroResumoRua(linhaFinal)}`;

const formatarTipoFalhaRua = (value?: string | null) => {
  if (value === 'linha_invalida') return 'Linha inválida';
  if (value === 'rua_com_falha') return 'Rua com falha';
  return 'Falha';
};

const HIDDEN_AUDIT_ACTIONS = new Set([
  'avaliacao_iniciada',
  'avaliacao_finalizada',
  'retoque_iniciado',
  'retoque_finalizado',
]);

type HistoricoRetoqueItem = {
  id: string;
  status: Parameters<typeof getEvaluationStatusMeta>[0];
  equipeNome: string;
  responsavelNome: string;
  fiscalResponsavel: string;
  executorNome: string;
  ajudantes: string[];
  dataRetoque?: string | null;
  quantidadeBags: number;
  quantidadeCargas: number;
  cocosEstimados: number;
  observacao: string;
  finalizadoPorNome: string;
};

type ResumoRuaEquipeItem = {
  id: string;
  faixa: string;
  parcelaCodigo: string;
  equipeNome: string;
  statusLabel: string;
  statusVariant: 'emerald' | 'amber' | 'red';
  tipoFalha: string | null;
  cachoDisplay: string;
  cocosDisplay: string;
};

export function TelaDetalheAvaliacao() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual, sincronizarAgora } = useCampoApp();
  const { config, permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);
  const [showMarcarModal, setShowMarcarModal] = useState(false);
  const [showRetoqueModal, setShowRetoqueModal] = useState(false);
  const [motivoRetoque, setMotivoRetoque] = useState('');
  const [retoqueExecutorIds, setRetoqueExecutorIds] = useState<string[]>([]);
  const [retoqueEquipeId, setRetoqueEquipeId] = useState('');
  const [retoqueCargas, setRetoqueCargas] = useState('');
  const retoqueExecutorId = retoqueExecutorIds[0] || '';
  const setRetoqueExecutorId = (value: string) =>
    setRetoqueExecutorIds(value ? [value] : []);
  const sincronizarRetoqueEmSegundoPlano = () => {
    void sincronizarAgora().catch((error) => {
      console.warn('[Retoque] Falha ao sincronizar em segundo plano.', error);
    });
  };

  const { data, isFetched } = useQuery({
    queryKey: ['avaliacao', id, 'detalhe', usuarioAtual?.id],
    queryFn: () => obterAvaliacaoDetalhada(id, usuarioAtual?.id),
    enabled: Boolean(id && usuarioAtual?.id),
  });

  const { data: colaboradoresAtivos = [] } = useQuery({
    queryKey: ['colaboradores', 'ativos', 'retoque'],
    queryFn: listarColaboradoresAtivos,
    enabled: Boolean(usuarioAtual),
  });
  const { data: equipesVisiveis = [] } = useQuery({
    queryKey: ['equipes', 'detalhe-retoque', usuarioAtual?.id],
    queryFn: () => filtrarEquipesVisiveis(usuarioAtual),
    enabled: Boolean(usuarioAtual?.id),
  });

  const participantes = data?.participantes || [];
  const responsavelPrincipal =
    participantes.find(
      (item) => normalizePapelAvaliacao(item.papel) === 'responsavel_principal',
    )?.colaborador || null;
  const ajudantes = participantes
    .filter((item) => normalizePapelAvaliacao(item.papel) === 'ajudante')
    .map((item) => item.colaborador?.primeiroNome || item.colaborador?.nome || '')
    .filter(Boolean);
  const statusMeta = getEvaluationStatusMeta(data?.avaliacao?.status);
  const retoquesRelacionados = data?.retoquesRelacionados || [];
  const fiscalResponsavelNome = data?.avaliacao?.marcadoRetoquePorNome || '';
  const colaboradoresExecutoresRetoque = colaboradoresAtivos.filter(
    (item) =>
      item.ativo &&
      !item.deletadoEm &&
      normalizePerfilUsuario(item.perfil) === 'colaborador',
  );
  const executoresDesignadosIds = (
    data?.avaliacao?.retoqueDesignadoParaIds ||
    [data?.avaliacao?.retoqueDesignadoParaId || '']
  ).filter(Boolean);
  const nomesExecutoresDesignados = executoresDesignadosIds
    .map(
      (usuarioId) =>
        colaboradoresExecutoresRetoque.find((item) => item.id === usuarioId)?.nome ||
        data?.avaliacao?.retoqueDesignadoParaNomes?.find(
          (_item, index) => executoresDesignadosIds[index] === usuarioId,
        ) ||
        '',
    )
    .filter(Boolean);
  const nomeExecutorDesignado =
    nomesExecutoresDesignados.join(' - ') ||
    data?.avaliacao?.retoqueDesignadoParaNome ||
    data?.retoque?.responsavelNome ||
    '';
  const producaoRetoque = useMemo(
    () => calcularProducaoPorCargas(retoqueCargas, config),
    [config, retoqueCargas],
  );
  const podeInformarRetoque = canOperateAssignedRetoque({
    perfil: usuarioAtual?.perfil,
    usuarioId: usuarioAtual?.id,
    responsavelId:
      data?.avaliacao?.retoqueDesignadoParaId ||
      data?.retoque?.responsavelId ||
      data?.avaliacao?.responsavelPrincipalId,
    designadoParaId: data?.avaliacao?.retoqueDesignadoParaId,
    designadoParaIds: data?.avaliacao?.retoqueDesignadoParaIds,
    matrix: permissionMatrix,
  });
  const podeEditarConcluida = canEditCompletedEvaluation(
    usuarioAtual?.perfil,
    permissionMatrix,
  );
  const statusAtual = String(data?.avaliacao?.status || '').trim().toLowerCase();
  const podeEditarAvaliacaoFinalizada =
    data?.avaliacao?.tipo !== 'retoque' &&
    ['completed', 'ok', 'refazer', 'revisado'].includes(statusAtual) &&
    podeEditarConcluida;
  const retoqueAtivo = useMemo(
    () =>
      retoquesRelacionados.find((item) => {
        const statusRetoque = String(item.avaliacao.status || '').trim().toLowerCase();
        return (
          statusRetoque === 'draft' ||
          statusRetoque === 'in_progress' ||
          item.detalheRetoque?.status === 'em_retoque'
        );
      }) || null,
    [retoquesRelacionados],
  );
  const podeExecutarFluxoRetoque =
    data?.avaliacao?.tipo !== 'retoque' &&
    statusAtual === 'em_retoque' &&
    podeInformarRetoque &&
    canStartRetoque(usuarioAtual?.perfil, permissionMatrix);
  const parcelasPorId = useMemo(
    () => new Map((data?.parcelas || []).map((item) => [item.id, item])),
    [data?.parcelas],
  );
  const registrosPorRua = useMemo(
    () => new Map((data?.registros || []).map((item) => [item.ruaId, item])),
    [data?.registros],
  );
  const ruasComFalhaIds = useMemo(
    () =>
      new Set(
        (data?.ruas || [])
          .filter(
            (item) =>
              item.tipoFalha === 'rua_com_falha' || item.tipoFalha === 'linha_invalida',
          )
          .map((item) => item.id),
      ),
    [data?.ruas],
  );
  const hasPendingStreets = useMemo(() => {
    const ruas = data?.ruas || [];
    if (ruas.length === 0) return false;

    return ruas.some(
      (rua) => !registrosPorRua.has(rua.id) && !ruasComFalhaIds.has(rua.id),
    );
  }, [data?.ruas, registrosPorRua, ruasComFalhaIds]);
  const resumoEquipeDisponivel = Boolean(data) && !hasPendingStreets;
  const ruasResumoEquipe = useMemo<ResumoRuaEquipeItem[]>(() => {
    return (data?.ruas || [])
      .map((rua) => {
        const registro = registrosPorRua.get(rua.id) || null;
        const tipoFalha = rua.tipoFalha || null;
        const isFalha =
          tipoFalha === 'rua_com_falha' || tipoFalha === 'linha_invalida';

        if (!registro && !isFalha) {
          return null;
        }

        const apresentacao = registro
          ? obterApresentacaoEstadoColetaRua({
              quantidade: registro.quantidade,
              quantidadeCachos3: registro.quantidadeCachos3,
              observacoes: registro.observacoes,
            })
          : null;
        const statusLabel = isFalha
          ? formatarTipoFalhaRua(tipoFalha)
          : apresentacao?.faltaColher
            ? 'Falta colher'
            : apresentacao?.faltaTropear
              ? 'Falta tropear'
              : 'Coletada';

        return {
          id: rua.id,
          faixa: formatarFaixaRuaResumo(rua.linhaInicial, rua.linhaFinal),
          parcelaCodigo:
            parcelasPorId.get(rua.avaliacaoParcelaId)?.parcelaCodigo || '--',
          equipeNome: rua.equipeNome || data?.avaliacao?.equipeNome || '--',
          statusLabel,
          statusVariant: isFalha
            ? 'red'
            : apresentacao?.faltaColher || apresentacao?.faltaTropear
              ? 'amber'
              : 'emerald',
          tipoFalha: isFalha ? formatarTipoFalhaRua(tipoFalha) : null,
          cachoDisplay: apresentacao?.siglaCacho
            ? apresentacao.siglaCacho
            : formatarNumeroResumoRua(apresentacao?.quantidadeCachos3 || 0),
          cocosDisplay: apresentacao?.siglaCocos
            ? apresentacao.siglaCocos
            : formatarNumeroResumoRua(apresentacao?.quantidade || 0),
        };
      })
      .filter((item): item is ResumoRuaEquipeItem => Boolean(item));
  }, [data?.avaliacao?.equipeNome, data?.ruas, parcelasPorId, registrosPorRua]);

  const historicoRetoques = useMemo<HistoricoRetoqueItem[]>(() => {
    const items: HistoricoRetoqueItem[] = [];

    if (data?.retoque && data?.avaliacao?.tipo !== 'retoque') {
      items.push({
        id: data.retoque.id,
        status: data.avaliacao?.status || 'revisado',
        equipeNome: data.retoque.equipeNome || data.avaliacao?.equipeNome || '',
        responsavelNome:
          data.retoque.responsavelNome ||
          data.avaliacao?.retoqueDesignadoParaNome ||
          '',
        fiscalResponsavel: fiscalResponsavelNome,
        executorNome:
          data.avaliacao?.retoqueDesignadoParaNome ||
          data.retoque.responsavelNome ||
          '',
        ajudantes: data.retoque.ajudanteNomes || [],
        dataRetoque: data.retoque.dataRetoque,
        quantidadeBags: Number(data.retoque.quantidadeBags || 0),
        quantidadeCargas: Number(data.retoque.quantidadeCargas || 0),
        cocosEstimados: Number(data.retoque.cocosEstimados || 0),
        observacao: data.retoque.observacao || '',
        finalizadoPorNome: data.retoque.finalizadoPorNome || '',
      });
    }

    retoquesRelacionados.forEach((item) => {
      const detalhe = item.detalheRetoque;
      const responsavel =
        item.participantes.find(
          (participante) =>
            normalizePapelAvaliacao(participante.papel) ===
            'responsavel_principal',
        )?.colaborador?.nome || item.avaliacao.responsavelPrincipalNome || '';

      items.push({
        id: item.avaliacao.id,
        status: item.avaliacao.status,
        equipeNome: detalhe?.equipeNome || item.avaliacao.equipeNome || '',
        responsavelNome: detalhe?.responsavelNome || responsavel,
        fiscalResponsavel:
          item.avaliacao.marcadoRetoquePorNome || fiscalResponsavelNome,
        executorNome:
          item.avaliacao.retoqueDesignadoParaNome ||
          detalhe?.responsavelNome ||
          responsavel,
        ajudantes: detalhe?.ajudanteNomes || [],
        dataRetoque: detalhe?.dataRetoque || item.avaliacao.dataAvaliacao,
        quantidadeBags: Number(detalhe?.quantidadeBags || 0),
        quantidadeCargas: Number(detalhe?.quantidadeCargas || 0),
        cocosEstimados: Number(detalhe?.cocosEstimados || 0),
        observacao: detalhe?.observacao || '',
        finalizadoPorNome: detalhe?.finalizadoPorNome || '',
      });
    });

    return items;
  }, [data, fiscalResponsavelNome, retoquesRelacionados]);
  const logsVisiveis = useMemo(
    () =>
      (data?.logs || []).filter((log) => !HIDDEN_AUDIT_ACTIONS.has(String(log.acao || ''))),
    [data?.logs],
  );

  useEffect(() => {
    if (!showMarcarModal) return;
    setRetoqueExecutorIds(
      (
        data?.avaliacao?.retoqueDesignadoParaIds ||
        [data?.avaliacao?.retoqueDesignadoParaId || '']
      ).filter(Boolean),
    );
    setRetoqueEquipeId(
      data?.avaliacao?.retoqueEquipeId || data?.avaliacao?.equipeId || '',
    );
  }, [
    data?.avaliacao?.equipeId,
    data?.avaliacao?.retoqueDesignadoParaId,
    data?.avaliacao?.retoqueDesignadoParaIds,
    data?.avaliacao?.retoqueEquipeId,
    showMarcarModal,
  ]);

  useEffect(() => {
    if (!showRetoqueModal) return;
    setRetoqueCargas(
      data?.retoque?.quantidadeCargas
        ? String(data.retoque.quantidadeCargas)
        : '',
    );
  }, [
    data?.retoque?.quantidadeCargas,
    showRetoqueModal,
  ]);

  const marcarMutation = useMutation({
    mutationFn: async () => {
      if (!retoqueExecutorId) {
        throw new Error('Selecione quem executará o retoque.');
      }

      return marcarAvaliacaoParaRetoque({
        avaliacaoId: id,
        usuarioId: usuarioAtual?.id || '',
        designadoParaIds: retoqueExecutorIds,
        equipeId: retoqueEquipeId || null,
        motivo: motivoRetoque,
      });
    },
    onSuccess: () => {
      setShowMarcarModal(false);
      setMotivoRetoque('');
      setRetoqueExecutorIds([]);
      setRetoqueEquipeId('');
      void queryClient.invalidateQueries();
      sincronizarRetoqueEmSegundoPlano();
    },
    onError: (error) => {
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível marcar a parcela para retoque.',
      );
    },
  });

  const informarRetoqueMutation = useMutation({
    mutationFn: async () => {
      const responsavelId =
        data?.avaliacao?.retoqueDesignadoParaId ||
        data?.retoque?.responsavelId ||
        usuarioAtual?.id ||
        '';

      if (!responsavelId) {
        throw new Error('Defina quem executou o retoque.');
      }

      const cargas = Number(retoqueCargas || 0);
      if (!Number.isFinite(cargas)) {
        throw new Error('Informe um valor válido para cargas.');
      }
      if (cargas <= 0) {
        throw new Error('Informe a quantidade de cargas.');
      }
      return registrarRetoque({
        avaliacaoId: id,
        quantidadeBags: producaoRetoque.bags,
        quantidadeCargas: producaoRetoque.cargas,
        cocosEstimados: producaoRetoque.cocosEstimados,
        dataRetoque: todayIso(),
        observacao: '',
        responsavelId,
        finalizadoPorId: usuarioAtual?.id || responsavelId,
      });
    },
    onSuccess: () => {
      setShowRetoqueModal(false);
      setRetoqueCargas('');
      void queryClient.invalidateQueries();
      sincronizarRetoqueEmSegundoPlano();
    },
    onError: (error) => {
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível informar o retoque.',
      );
    },
  });

  const iniciarRetoqueMutation = useMutation({
    mutationFn: async () => {
      if (!usuarioAtual?.id) {
        throw new Error('Usuário atual não encontrado.');
      }

      const designados = Array.from(
        new Set(
          (
            data?.avaliacao?.retoqueDesignadoParaIds ||
            [data?.avaliacao?.retoqueDesignadoParaId || '']
          )
            .map((item) => String(item || '').trim())
            .filter(Boolean),
        ),
      );
      if (designados.length === 0) {
        throw new Error('Selecione ao menos um colaborador para executar o retoque.');
      }

      return criarRetoqueAvaliacao({
        avaliacaoOriginalId: id,
        iniciadoPorId: usuarioAtual.id,
        responsavelId: designados[0],
        participanteIds: designados.slice(1),
        equipeId: data?.avaliacao?.retoqueEquipeId || data?.avaliacao?.equipeId || null,
        equipeNome: data?.avaliacao?.retoqueEquipeNome || data?.avaliacao?.equipeNome || '',
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      sincronizarRetoqueEmSegundoPlano();
      navigate(`/avaliacoes/${result.avaliacao.id}`);
    },
    onError: (error) => {
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o fluxo de retoque.',
      );
    },
  });

  if (!canViewHistory(usuarioAtual?.perfil, permissionMatrix)) {
    return (
      <LayoutMobile
        title="Detalhe da avaliação"
        subtitle="Acesso restrito"
        onBack={() => navigate(-1)}
      >
        <AccessDeniedCard description="A consulta detalhada da avaliação só aparece quando o administrador libera histórico para o seu perfil." />
      </LayoutMobile>
    );
  }

  if (isFetched && !data) {
    return (
      <LayoutMobile
        title="Detalhe da avaliação"
        subtitle="Registro não disponível"
        onBack={() => navigate(-1)}
      >
        <Card className="surface-card">
          <CardContent className="p-5">
            <p className="text-sm text-[var(--qc-text-muted)]">
              Esta avaliação não está disponível para o seu perfil ou não foi
              encontrada.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title="Detalhe da avaliação"
      subtitle={statusMeta.label}
      onBack={() => navigate(-1)}
    >
      <div className="stack-lg">
        <Dialog open={showMarcarModal} onOpenChange={setShowMarcarModal}>
          <DialogContent className="flex max-w-[420px] flex-col p-0">
            <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
              <DialogTitle>Marcar parcela para retoque</DialogTitle>
            </DialogHeader>

            <div className="shrink-0 space-y-3 px-6 pb-3">
              <div className="rounded-[18px] border border-[rgba(93,98,78,0.16)] bg-[rgba(244,245,240,0.92)] px-4 py-3">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Fiscal responsável
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {usuarioAtual?.nome || 'Não informado'}
                </p>
              </div>

              <Select value={retoqueExecutorId} onValueChange={setRetoqueExecutorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione quem executará o retoque" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradoresExecutoresRetoque.map((colaborador) => (
                    <SelectItem key={colaborador.id} value={colaborador.id}>
                      {colaborador.nome} • {colaborador.matricula}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={retoqueEquipeId} onValueChange={setRetoqueEquipeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a equipe do retoque" />
                </SelectTrigger>
                <SelectContent>
                  {equipesVisiveis.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <Textarea
                rows={4}
                placeholder="Motivo ou observação do envio para retoque"
                value={motivoRetoque}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setMotivoRetoque(event.target.value)
                }
              />
            </div>

            <DialogFooter className="mt-0 shrink-0 border-t border-[var(--qc-border)] bg-[var(--qc-surface)] px-6 pb-6 pt-4">
              <Button variant="outline" onClick={() => setShowMarcarModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => marcarMutation.mutate()}
                disabled={marcarMutation.isPending}
              >
                {marcarMutation.isPending ? 'Marcando' : 'Confirmar retoque'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showRetoqueModal} onOpenChange={setShowRetoqueModal}>
          <DialogContent className="max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Informar retoque</DialogTitle>
            </DialogHeader>
            <div className="stack-md">
              <div className="rounded-[18px] border border-[rgba(0,107,68,0.14)] bg-[rgba(0,107,68,0.07)] px-4 py-3">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Fluxo do retoque
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  O retoque é registrado diretamente na avaliação original.
                </p>
              </div>

              {fiscalResponsavelNome ? (
                <div className="rounded-[18px] border border-[rgba(93,98,78,0.16)] bg-[rgba(244,245,240,0.92)] px-4 py-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Fiscal responsável
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                    {fiscalResponsavelNome}
                  </p>
                </div>
              ) : null}

              <div className="rounded-[18px] border border-[rgba(0,107,68,0.14)] bg-[rgba(0,107,68,0.07)] px-4 py-3">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Colaborador executor do retoque
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {nomeExecutorDesignado || usuarioAtual?.nome || 'Não informado'}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Quantidade de cargas
                  </span>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={retoqueCargas}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRetoqueCargas(event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Cargas
                  </p>
                  <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                    {formatarProducaoNumero(producaoRetoque.cargas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Bags
                  </p>
                  <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                    {formatarProducaoNumero(producaoRetoque.bags)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Cocos
                  </p>
                  <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                    {formatarProducaoNumero(producaoRetoque.cocosEstimados, 0)}
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRetoqueModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => informarRetoqueMutation.mutate()}
                disabled={informarRetoqueMutation.isPending}
              >
                {informarRetoqueMutation.isPending ? 'Salvando' : 'Salvar retoque'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="surface-card">
          <CardContent className="stack-md p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Avaliação original
                </p>
                <h2 className="text-xl font-black tracking-tight text-[var(--qc-text)]">
                  {data?.parcelas?.map((item) => item.parcelaCodigo).join(', ') ||
                    'Parcela'}
                </h2>
              </div>
              <Badge variant="slate">{statusMeta.label}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Equipe
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {data?.avaliacao?.equipeNome || 'Não informada'}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Tipo
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {data?.avaliacao?.tipo === 'retoque' ? 'Retoque legado' : 'Normal'}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Responsável principal
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {responsavelPrincipal?.nome ||
                    data?.avaliacao?.responsavelPrincipalNome ||
                    '-'}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Ajudantes
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {ajudantes.length ? ajudantes.join(', ') : 'Sem ajudantes'}
                </p>
              </div>
              {fiscalResponsavelNome ? (
                <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Fiscal responsável
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                    {fiscalResponsavelNome}
                  </p>
                </div>
              ) : null}
              {nomeExecutorDesignado ? (
                <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Executor do retoque
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                    {nomeExecutorDesignado}
                  </p>
                </div>
              ) : null}
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Data da coleta
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {formatDateOnly(data?.avaliacao?.dataColheita)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Linhas
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {data?.ruas?.length || 0}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Média
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {Number(data?.avaliacao?.mediaParcela || 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Cachos
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {Number(data?.avaliacao?.mediaCachos3 || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {resumoEquipeDisponivel ? (
          <Card className="surface-card">
            <CardContent className="stack-md p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                    Ruas avaliadas
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Resumo somente leitura por rua, sem reabrir o fluxo de avaliação.
                  </p>
                </div>
                <Badge variant="emerald">{ruasResumoEquipe.length}</Badge>
              </div>

              {ruasResumoEquipe.length > 0 ? (
                <div className="stack-sm">
                  {ruasResumoEquipe.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[24px] border border-[var(--qc-border)] bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                            Parcela {item.parcelaCodigo} • Equipe {item.equipeNome}
                          </p>
                          <p className="mt-2 whitespace-nowrap text-[clamp(1.8rem,7vw,2.2rem)] font-black leading-none tracking-[-0.05em] tabular-nums text-[var(--qc-text)]">
                            {item.faixa}
                          </p>
                        </div>

                        <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
                      </div>

                      {item.tipoFalha ? (
                        <p className="mt-4 text-sm text-[var(--qc-text-muted)]">
                          Esta rua foi marcada como falha e não entrou no cálculo final.
                        </p>
                      ) : (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-[22px] border border-[rgba(0,107,68,0.14)] bg-[linear-gradient(135deg,rgba(210,231,211,0.92)_0%,rgba(255,255,255,0.98)_100%)] p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                              Cacho
                            </p>
                            <p className="mt-2 text-[1.9rem] font-black leading-none tracking-[-0.04em] tabular-nums text-[var(--qc-primary)]">
                              {item.cachoDisplay}
                            </p>
                          </div>
                          <div className="rounded-[22px] border border-[rgba(138,106,8,0.14)] bg-[linear-gradient(135deg,rgba(251,245,232,0.96)_0%,rgba(255,255,255,0.98)_100%)] p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                              Cocos no chão
                            </p>
                            <p className="mt-2 text-[1.9rem] font-black leading-none tracking-[-0.04em] tabular-nums text-[#7f6b2b]">
                              {item.cocosDisplay}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--qc-text-muted)]">
                  Nenhuma rua com dados finalizados foi encontrada nesta equipe.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {data?.avaliacao?.tipo !== 'retoque' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {data?.avaliacao?.status === 'in_progress' && hasPendingStreets ? (
              <Button onClick={() => navigate(`/avaliacoes/${id}`)}>
                <ClipboardList className="h-4 w-4" />
                Continuar avaliação
              </Button>
            ) : null}
            {podeEditarAvaliacaoFinalizada ? (
              <Button variant="outline" onClick={() => navigate(`/avaliacoes/${id}`)}>
                <ClipboardList className="h-4 w-4" />
                Editar coleta
              </Button>
            ) : null}
            {podeEditarAvaliacaoFinalizada ? (
              <Button
                variant="outline"
                onClick={() => navigate(`/avaliacoes/${id}/editar`)}
              >
                <PencilLine className="h-4 w-4" />
                Editar programação
              </Button>
            ) : null}
            {data?.avaliacao?.status === 'refazer' &&
            canMarkRetoque(usuarioAtual?.perfil, permissionMatrix) ? (
              <Button onClick={() => setShowMarcarModal(true)}>
                <Wrench className="h-4 w-4" />
                Marcar para retoque
              </Button>
            ) : null}
            {data?.avaliacao?.status === 'em_retoque' &&
            podeExecutarFluxoRetoque ? (
              <Button
                onClick={() => {
                  if (retoqueAtivo?.avaliacao?.id) {
                    navigate(`/avaliacoes/${retoqueAtivo.avaliacao.id}`);
                    return;
                  }

                  iniciarRetoqueMutation.mutate();
                }}
                disabled={iniciarRetoqueMutation.isPending}
              >
                <Wrench className="h-4 w-4" />
                {retoqueAtivo?.avaliacao?.id ? 'Abrir retoque' : 'Iniciar retoque'}
              </Button>
            ) : null}
            {data?.avaliacao?.status === 'em_retoque' &&
            !data?.retoque &&
            !podeExecutarFluxoRetoque &&
            podeInformarRetoque ? (
              <Button onClick={() => setShowRetoqueModal(true)}>
                <Wrench className="h-4 w-4" />
                Informar retoque
              </Button>
            ) : null}
          </div>
        ) : null}

        {data?.avaliacaoOriginal ? (
          <Card className="surface-card">
            <CardContent className="p-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                Avaliação original vinculada
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--qc-text)]">
                Equipe original:{' '}
                {data.avaliacaoOriginal.equipeNome || 'Não informada'}
              </p>
              <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                Status atual:{' '}
                {getEvaluationStatusMeta(data.avaliacaoOriginal.status).label}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {historicoRetoques.length > 0 ? (
          <Card className="surface-card">
            <CardContent className="stack-md p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Histórico de retoque
                </p>
                <Badge variant="amber">{historicoRetoques.length}</Badge>
              </div>

              {historicoRetoques.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[var(--qc-text)]">
                      {getEvaluationStatusMeta(item.status).label}
                    </p>
                    <Badge variant="slate">
                      {item.equipeNome || 'Equipe não informada'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                    Responsável:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {item.responsavelNome || '-'}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Fiscal responsável:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {item.fiscalResponsavel || '-'}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Executor registrado:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {item.executorNome || '-'}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Ajudantes:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {item.ajudantes.length
                        ? item.ajudantes.join(', ')
                        : 'Sem ajudantes'}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Data do retoque:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {formatDateOnly(item.dataRetoque)}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Bags / cargas:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {item.quantidadeBags} / {item.quantidadeCargas}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                    Cocos estimados:{' '}
                    <strong className="text-[var(--qc-text)]">
                      {formatarProducaoNumero(item.cocosEstimados, 0)}
                    </strong>
                  </p>
                  {item.observacao ? (
                    <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                      Observações:{' '}
                      <strong className="text-[var(--qc-text)]">
                        {item.observacao}
                      </strong>
                    </p>
                  ) : null}
                  {item.finalizadoPorNome ? (
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Fechamento informado por:{' '}
                      <strong className="text-[var(--qc-text)]">
                        {item.finalizadoPorNome}
                      </strong>
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="surface-card">
          <CardContent className="stack-md p-5">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--qc-secondary)]" />
              <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                Histórico / auditoria
              </p>
            </div>

            {logsVisiveis.map((log) => (
              <div
                key={log.id}
                className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4"
              >
                <p className="text-sm font-semibold text-[var(--qc-text)]">
                  {log.descricao}
                </p>
                {log.usuarioNome ? (
                  <p className="mt-1 text-xs text-[var(--qc-text-muted)]">
                    Usuário: {log.usuarioNome}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </LayoutMobile>
  );
}
