import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, History, Users, Wrench } from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { useCampoApp } from '@/core/AppProvider';
import { listarColaboradoresAtivos } from '@/core/auth';
import {
  criarRetoqueAvaliacao,
  marcarAvaliacaoParaRetoque,
  obterAvaliacaoDetalhada,
} from '@/core/evaluations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getEvaluationStatusMeta } from '@/core/evaluationStatus';
import {
  canOperateAssignedRetoque,
  canMarkRetoque,
  canViewHistory,
  filtrarEquipesVisiveis,
  normalizePapelAvaliacao,
  normalizePerfilUsuario,
} from '@/core/permissions';
import { useRolePermissions } from '@/core/useRolePermissions';

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

export function TelaDetalheAvaliacao() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const { permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);
  const [showMarcarModal, setShowMarcarModal] = useState(false);
  const [showRetoqueModal, setShowRetoqueModal] = useState(false);
  const [motivoRetoque, setMotivoRetoque] = useState('');
  const [retoqueExecutorId, setRetoqueExecutorId] = useState('');
  const [retoqueResponsavelId, setRetoqueResponsavelId] = useState('');
  const [retoqueEquipeId, setRetoqueEquipeId] = useState('');
  const [retoqueParticipantes, setRetoqueParticipantes] = useState<string[]>([]);
  const [retoqueAcompanhado, setRetoqueAcompanhado] = useState(false);

  const { data, isFetched } = useQuery({
    queryKey: ['avaliacao', id, 'detalhe', usuarioAtual?.id],
    queryFn: () => obterAvaliacaoDetalhada(id, usuarioAtual?.id),
    enabled: Boolean(id && usuarioAtual?.id),
  });

  const { data: equipesVisiveis = [] } = useQuery({
    queryKey: ['equipes', 'visiveis', usuarioAtual?.id],
    queryFn: () => filtrarEquipesVisiveis(usuarioAtual),
    enabled: Boolean(usuarioAtual),
  });

  const { data: colaboradoresAtivos = [] } = useQuery({
    queryKey: ['colaboradores', 'ativos', 'retoque'],
    queryFn: listarColaboradoresAtivos,
    enabled: Boolean(usuarioAtual),
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
  const retoqueEmAndamento =
    retoquesRelacionados.find((item) => item.avaliacao.status === 'in_progress') || null;
  const fiscalResponsavelNome = data?.avaliacao?.marcadoRetoquePorNome || '';
  const colaboradoresDisponiveisRetoque = colaboradoresAtivos.filter(
    (item) => item.ativo && !item.deletadoEm,
  );
  const colaboradoresExecutoresRetoque = colaboradoresDisponiveisRetoque.filter(
    (item) => normalizePerfilUsuario(item.perfil) === 'colaborador',
  );
  const executorDesignado =
    colaboradoresExecutoresRetoque.find(
      (item) => item.id === data?.avaliacao?.retoqueDesignadoParaId,
    ) || null;
  const podeIniciarRetoque = canOperateAssignedRetoque({
    perfil: usuarioAtual?.perfil,
    usuarioId: usuarioAtual?.id,
    responsavelId: data?.avaliacao?.responsavelPrincipalId,
    designadoParaId: data?.avaliacao?.retoqueDesignadoParaId,
    matrix: permissionMatrix,
  });
  const nomeExecutorDesignado =
    executorDesignado?.nome || data?.avaliacao?.retoqueDesignadoParaNome || '';

  useEffect(() => {
    if (!showMarcarModal) return;
    setRetoqueExecutorId(data?.avaliacao?.retoqueDesignadoParaId || '');
  }, [data?.avaliacao?.retoqueDesignadoParaId, showMarcarModal]);

  useEffect(() => {
    if (!showRetoqueModal) return;
    setRetoqueResponsavelId(
      data?.avaliacao?.retoqueDesignadoParaId || usuarioAtual?.id || '',
    );
    setRetoqueEquipeId(data?.avaliacao?.equipeId || '');
    setRetoqueParticipantes([]);
    setRetoqueAcompanhado(false);
  }, [
    data?.avaliacao?.equipeId,
    data?.avaliacao?.retoqueDesignadoParaId,
    showRetoqueModal,
    usuarioAtual?.id,
  ]);

  const marcarMutation = useMutation({
    mutationFn: async () => {
      if (!retoqueExecutorId) {
        throw new Error('Selecione quem executará o retoque.');
      }

      return marcarAvaliacaoParaRetoque({
        avaliacaoId: id,
        usuarioId: usuarioAtual?.id || '',
        designadoParaId: retoqueExecutorId,
        motivo: motivoRetoque,
      });
    },
    onSuccess: async () => {
      setShowMarcarModal(false);
      setMotivoRetoque('');
      setRetoqueExecutorId('');
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Não foi possível marcar a parcela para retoque.');
    },
  });

  const iniciarRetoqueMutation = useMutation({
    mutationFn: async () => {
      if (retoqueAcompanhado && retoqueParticipantes.length === 0) {
        throw new Error('Selecione ao menos um ajudante para o retoque.');
      }

      if (!retoqueEquipeId && !data?.avaliacao?.equipeId) {
        throw new Error('Defina a equipe responsável pelo retoque.');
      }

      const responsavelId =
        data?.avaliacao?.retoqueDesignadoParaId ||
        retoqueResponsavelId ||
        usuarioAtual?.id ||
        '';

      if (!responsavelId) {
        throw new Error('Defina quem executará o retoque.');
      }

      return criarRetoqueAvaliacao({
        avaliacaoOriginalId: id,
        iniciadoPorId: usuarioAtual?.id || '',
        responsavelId,
        participanteIds: retoqueAcompanhado ? retoqueParticipantes : [],
        equipeId: retoqueEquipeId || data?.avaliacao?.equipeId || null,
        equipeNome:
          equipesVisiveis.find((item) => item.id === retoqueEquipeId)?.nome ||
          data?.avaliacao?.equipeNome ||
          '',
      });
    },
    onSuccess: async (result) => {
      if (!result) return;
      setShowRetoqueModal(false);
      await queryClient.invalidateQueries();
      navigate(`/avaliacoes/${result.avaliacao.id}`);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Não foi possível iniciar o retoque.');
    },
  });

  if (!canViewHistory(usuarioAtual?.perfil, permissionMatrix)) {
    return (
      <LayoutMobile
        title="Detalhe da avaliação"
        subtitle="Acesso restrito"
        onBack={() => navigate('/dashboard')}
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
        onBack={() => navigate('/historico')}
      >
        <Card className="surface-card">
          <CardContent className="p-5">
            <p className="text-sm text-[var(--qc-text-muted)]">
              Esta avaliação não está disponível para o seu perfil ou não foi encontrada.
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
      onBack={() => navigate('/historico')}
    >
      <div className="stack-lg">
        <Dialog open={showMarcarModal} onOpenChange={setShowMarcarModal}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Marcar parcela para retoque</DialogTitle>
            </DialogHeader>
            <div className="mb-3 rounded-[18px] border border-[rgba(93,98,78,0.16)] bg-[rgba(244,245,240,0.92)] px-4 py-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                Fiscal responsável
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                {usuarioAtual?.nome || 'Não informado'}
              </p>
            </div>

            <Select value={retoqueExecutorId} onValueChange={setRetoqueExecutorId}>
              <SelectTrigger className="mb-3">
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

            <Textarea
              rows={4}
              placeholder="Motivo ou observação do envio para retoque"
              value={motivoRetoque}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setMotivoRetoque(event.target.value)
              }
            />
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowMarcarModal(false)}>
                Cancelar
              </Button>
              <Button onClick={() => marcarMutation.mutate()} disabled={marcarMutation.isPending}>
                {marcarMutation.isPending ? 'Marcando' : 'Confirmar retoque'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showRetoqueModal} onOpenChange={setShowRetoqueModal}>
          <DialogContent className="max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Iniciar retoque</DialogTitle>
            </DialogHeader>
            <div className="stack-md">
              <Select
                value={retoqueEquipeId || data?.avaliacao?.equipeId || ''}
                onValueChange={setRetoqueEquipeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Equipe responsável pelo retoque" />
                </SelectTrigger>
                <SelectContent>
                  {equipesVisiveis.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      Eq {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

              {nomeExecutorDesignado ? (
                <div className="rounded-[18px] border border-[rgba(0,107,68,0.14)] bg-[rgba(0,107,68,0.07)] px-4 py-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Colaborador designado para o retoque
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                    {nomeExecutorDesignado}
                  </p>
                </div>
              ) : (
                <Select
                  value={retoqueResponsavelId || usuarioAtual?.id || ''}
                  onValueChange={setRetoqueResponsavelId}
                >
                <SelectTrigger>
                  <SelectValue placeholder="Colaborador executor do retoque" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradoresExecutoresRetoque.map((colaborador) => (
                    <SelectItem key={colaborador.id} value={colaborador.id}>
                      {colaborador.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={retoqueAcompanhado ? 'default' : 'outline'}
                  onClick={() => setRetoqueAcompanhado(true)}
                >
                  Acompanhado
                </Button>
                <Button
                  type="button"
                  variant={!retoqueAcompanhado ? 'default' : 'outline'}
                  onClick={() => {
                    setRetoqueAcompanhado(false);
                    setRetoqueParticipantes([]);
                  }}
                >
                  Sozinho
                </Button>
              </div>

              {retoqueAcompanhado ? (
                <div className="grid grid-cols-2 gap-2">
                  {colaboradoresExecutoresRetoque
                    .filter(
                      (colaborador) =>
                        colaborador.id !==
                        (data?.avaliacao?.retoqueDesignadoParaId || retoqueResponsavelId),
                    )
                    .map((colaborador) => {
                      const selecionado = retoqueParticipantes.includes(colaborador.id);
                      return (
                        <Button
                          key={colaborador.id}
                          type="button"
                          variant={selecionado ? 'default' : 'outline'}
                          onClick={() =>
                            setRetoqueParticipantes((current) =>
                              selecionado
                                ? current.filter((item) => item !== colaborador.id)
                                : [...current, colaborador.id],
                            )
                          }
                        >
                          {colaborador.primeiroNome}
                        </Button>
                      );
                    })}
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRetoqueModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => iniciarRetoqueMutation.mutate()}
                disabled={iniciarRetoqueMutation.isPending}
              >
                {iniciarRetoqueMutation.isPending ? 'Iniciando' : 'Iniciar retoque'}
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
                  {data?.parcelas?.map((item) => item.parcelaCodigo).join(', ') || 'Parcela'}
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
                  {data?.avaliacao?.tipo === 'retoque' ? 'Retoque' : 'Normal'}
                </p>
              </div>
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Responsável principal
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {responsavelPrincipal?.nome || data?.avaliacao?.responsavelPrincipalNome || '-'}
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
                    Colaborador do retoque
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
              <div className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Início / fim
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--qc-text)]">
                  {formatDateTime(data?.avaliacao?.inicioEm)} • {formatDateTime(data?.avaliacao?.fimEm)}
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
                  Cachos 3
                </p>
                <p className="mt-1 text-lg font-black text-[var(--qc-text)]">
                  {Number(data?.avaliacao?.mediaCachos3 || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {data?.avaliacao?.tipo !== 'retoque' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {data?.avaliacao?.status === 'in_progress' ? (
              <Button onClick={() => navigate(`/avaliacoes/${id}`)}>
                <ClipboardList className="h-4 w-4" />
                Continuar avaliação
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
            !retoqueEmAndamento &&
            podeIniciarRetoque ? (
              <Button onClick={() => setShowRetoqueModal(true)}>
                <Users className="h-4 w-4" />
                Iniciar retoque
              </Button>
            ) : null}
            {retoqueEmAndamento ? (
              <Button variant="outline" onClick={() => navigate(`/avaliacoes/${retoqueEmAndamento.avaliacao.id}`)}>
                <ClipboardList className="h-4 w-4" />
                Abrir retoque em andamento
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
                Equipe original: {data.avaliacaoOriginal.equipeNome || 'Não informada'}
              </p>
              <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                Status atual: {getEvaluationStatusMeta(data.avaliacaoOriginal.status).label}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {retoquesRelacionados.length > 0 ? (
          <Card className="surface-card">
            <CardContent className="stack-md p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Retoques vinculados
                </p>
                <Badge variant="amber">{retoquesRelacionados.length}</Badge>
              </div>

              {retoquesRelacionados.map((item) => {
                const detalhe = item.detalheRetoque;
                const responsavel =
                  item.participantes.find(
                    (participante) =>
                      normalizePapelAvaliacao(participante.papel) === 'responsavel_principal',
                  )?.colaborador?.nome || item.avaliacao.responsavelPrincipalNome || '-';
                const ajudantesRetoque = item.participantes
                  .filter((participante) => normalizePapelAvaliacao(participante.papel) === 'ajudante')
                  .map((participante) => participante.colaborador?.primeiroNome || '')
                  .filter(Boolean);
                const executorRetoque =
                  item.avaliacao.retoqueDesignadoParaNome ||
                  detalhe?.responsavelNome ||
                  responsavel;
                const fiscalRetoque =
                  item.avaliacao.marcadoRetoquePorNome || fiscalResponsavelNome || '-';

                return (
                  <div key={item.avaliacao.id} className="rounded-[22px] border border-[var(--qc-border)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[var(--qc-text)]">
                        {getEvaluationStatusMeta(item.avaliacao.status).label}
                      </p>
                      <Badge variant="slate">
                        {detalhe?.equipeNome || item.avaliacao.equipeNome || 'Equipe não informada'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                      Responsável: <strong className="text-[var(--qc-text)]">{responsavel}</strong>
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Fiscal responsável: <strong className="text-[var(--qc-text)]">{fiscalRetoque}</strong>
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Executor designado: <strong className="text-[var(--qc-text)]">{executorRetoque}</strong>
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Ajudantes: <strong className="text-[var(--qc-text)]">{ajudantesRetoque.length ? ajudantesRetoque.join(', ') : 'Sem ajudantes'}</strong>
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Data do retoque: <strong className="text-[var(--qc-text)]">{formatDateOnly(detalhe?.dataRetoque || item.avaliacao.dataAvaliacao)}</strong>
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Bags / cargas: <strong className="text-[var(--qc-text)]">{Number(detalhe?.quantidadeBags || 0)} / {Number(detalhe?.quantidadeCargas || 0)}</strong>
                    </p>
                    {detalhe?.observacao ? (
                      <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                        Observações: <strong className="text-[var(--qc-text)]">{detalhe.observacao}</strong>
                      </p>
                    ) : null}
                  </div>
                );
              })}
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

            {(data?.logs || []).map((log) => (
              <div key={log.id} className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  {formatDateTime(log.criadoEm)}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--qc-text)]">
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
