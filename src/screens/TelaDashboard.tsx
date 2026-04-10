import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CirclePlus,
  ClipboardList,
  Cloud,
  History,
  LogOut,
  Palmtree,
  PencilLine,
  Settings,
  Trees,
  Trash2,
  Users,
} from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  estatisticasDashboard,
  excluirAvaliacaoEmAndamento,
  listarAvaliacoesAtivas,
} from '@/core/evaluations';
import { useCampoApp } from '@/core/AppProvider';
import {
  canOperateAssignedRetoque,
  canManageTeams,
  canStartEvaluation,
  filtrarEquipesVisiveis,
  normalizePerfilUsuario,
} from '@/core/permissions';
import { contarNotificacoesNaoLidas } from '@/core/notifications';
import { listarParcelasPlanejadasVisiveis } from '@/core/plannedParcels';
import { useRolePermissions } from '@/core/useRolePermissions';

const quickActionCatalog = [
  {
    label: 'Relatórios',
    subtitle: 'Consolidado diário e métricas de campo.',
    icon: BarChart3,
    to: '/relatorios',
    permissionKey: 'verRelatorios',
  },
  {
    label: 'Histórico',
    subtitle: 'Registros recentes e auditorias passadas.',
    icon: History,
    to: '/historico',
    permissionKey: 'verHistorico',
  },
  {
    label: 'Equipes',
    subtitle: 'Gerenciamento e edicao das equipes de campo.',
    icon: Users,
    to: '/equipes',
    adminOnly: true,
  },
  {
    label: 'Parcelas',
    subtitle: 'Cadastro rapido e fila planejada para o dia.',
    icon: Trees,
    to: '/parcelas',
  },
  {
    label: 'Configurações',
    subtitle: 'Definição de limites e regras de negócio.',
    icon: Settings,
    to: '/configuracoes',
  },
  {
    label: 'Sincronização',
    subtitle: 'Conexão com a nuvem e envio dos dados.',
    icon: Cloud,
    to: '/sincronizacao',
    permissionKey: 'verSincronizacao',
  },
] as const;

function DashboardStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="metric-card flex min-h-[88px] flex-col items-center justify-center rounded-[18px] px-3 py-3 text-center text-white">
      <strong className="mt-0 text-[2rem] font-black tracking-[-0.05em]">
        {value}
      </strong>
      <span className="mt-1.5 text-[0.82rem] font-extrabold uppercase tracking-[0.08em] text-white/92">
        {label}
      </span>
    </div>
  );
}

export function TelaDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    usuarioAtual,
    session,
    online,
    pendenciasSync,
    sincronizando,
    logout,
    definirEquipeDoDia,
  } = useCampoApp();
  const { permissionMatrix, permissions } = useRolePermissions(usuarioAtual?.perfil);
  const perfilNormalizado = normalizePerfilUsuario(usuarioAtual?.perfil);

  const { data: stats } = useQuery({
    queryKey: ['dashboard', 'stats', usuarioAtual?.id],
    queryFn: () => estatisticasDashboard(usuarioAtual?.id),
    enabled: Boolean(usuarioAtual?.id),
    staleTime: 60_000,
  });

  const { data: avaliacoes = [] } = useQuery({
    queryKey: ['dashboard', 'avaliacoes', usuarioAtual?.id],
    queryFn: () => listarAvaliacoesAtivas(usuarioAtual?.id, { limit: 8 }),
    enabled: Boolean(usuarioAtual?.id),
    staleTime: 30_000,
  });
  const { data: equipesVisiveis = [] } = useQuery({
    queryKey: ['dashboard', 'equipes-visiveis', usuarioAtual?.id],
    queryFn: () => filtrarEquipesVisiveis(usuarioAtual),
    enabled: Boolean(usuarioAtual?.id),
    staleTime: 60_000,
  });
  const { data: notificacoesNaoLidas = 0 } = useQuery({
    queryKey: ['notificacoes', 'contador', usuarioAtual?.id],
    queryFn: () => contarNotificacoesNaoLidas(usuarioAtual?.id),
    enabled: Boolean(usuarioAtual?.id),
    staleTime: 15_000,
  });
  const { data: parcelasPlanejadas = [] } = useQuery({
    queryKey: ['dashboard', 'parcelas-planejadas', usuarioAtual?.id, session?.equipeDiaId],
    queryFn: () =>
      listarParcelasPlanejadasVisiveis({
        usuarioId: usuarioAtual?.id,
        equipeId: session?.equipeDiaId || null,
        incluirConcluidas: false,
      }),
    enabled: Boolean(usuarioAtual?.id),
    staleTime: 20_000,
  });

  const avaliacoesEmAndamento = useMemo(
    () =>
      avaliacoes.filter(
        (item) => item.status === 'draft' || item.status === 'in_progress',
      ),
    [avaliacoes],
  );
  const quickActions = useMemo(
    () =>
      quickActionCatalog.filter((item) => {
        if (item.adminOnly) {
          return canManageTeams(usuarioAtual?.perfil);
        }

        if (!item.permissionKey) {
          return true;
        }

        return permissions[item.permissionKey];
      }),
    [permissions, usuarioAtual?.perfil],
  );
  const parcelasDisponiveis = useMemo(
    () => parcelasPlanejadas.filter((item) => item.status === 'disponivel'),
    [parcelasPlanejadas],
  );
  const parcelasEmAndamentoPlanejadas = useMemo(
    () => parcelasPlanejadas.filter((item) => item.status === 'em_andamento'),
    [parcelasPlanejadas],
  );
  const parcelasEmRetoquePlanejadas = useMemo(
    () => parcelasPlanejadas.filter((item) => item.status === 'em_retoque'),
    [parcelasPlanejadas],
  );
  const equipeDiaLabel =
    session?.equipeDiaNome ||
    equipesVisiveis.find((item) => item.id === session?.equipeDiaId)?.nome ||
    '';
  const podeIniciarAvaliacao = canStartEvaluation(
    usuarioAtual?.perfil,
    permissionMatrix,
  );

  const deleteMutation = useMutation({
    mutationFn: async (avaliacaoId: string) =>
      excluirAvaliacaoEmAndamento(avaliacaoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'avaliacoes'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const statusOperacional = sincronizando
    ? 'Sincronizando dados do dispositivo.'
    : pendenciasSync > 0
      ? `${pendenciasSync} operação(ões) aguardando sincronização.`
      : online
        ? 'Operação online e pronta para uso.'
        : 'Modo offline ativo no dispositivo.';

  return (
    <LayoutMobile
      hideHeader
      title="QualCoco"
      contentClassName="pt-4"
      showBottomNav
    >
      <div className="stack-lg pb-28">
        <header className="flex items-center justify-between rounded-[22px] border border-[var(--qc-border)] bg-white px-4 py-3 shadow-[0_16px_30px_-24px_rgba(17,33,23,0.2)]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#f3ddcf] text-[var(--qc-primary)]">
              <Palmtree className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[2rem] font-black tracking-[-0.05em] text-[var(--qc-primary)]">
                QualCoco
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Abrir notificacoes"
              className="relative flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--qc-border)] bg-white text-[var(--qc-primary)] active:scale-[0.98]"
              onClick={() => navigate('/notificacoes')}
            >
              <Bell className="h-5 w-5" />
              {notificacoesNaoLidas > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--qc-primary)] px-1.5 py-0.5 text-[10px] font-black text-white">
                  {notificacoesNaoLidas > 99 ? '99+' : notificacoesNaoLidas}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label="Encerrar sessao"
              className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--qc-border)] bg-white text-[var(--qc-primary)] active:scale-[0.98]"
              onClick={handleLogout}
            >
              <LogOut className="h-6 w-6" />
            </button>
          </div>
        </header>

        <Card className="hero-card overflow-hidden border-none text-white">
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-5">
              <div className="stack-sm">
                <span className="text-[0.98rem] font-extrabold uppercase tracking-[0.12em] text-white/78">
                  Status Operacional
                </span>
                <div>
                  <h2 className="text-[clamp(1.8rem,8vw,2.2rem)] font-black tracking-[-0.06em] text-white">
                    Visão Geral
                  </h2>
                  <p className="mt-2 max-w-[17rem] text-[0.9rem] font-medium leading-relaxed text-white/76">
                    {statusOperacional}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white/84">
                    {usuarioAtual?.primeiroNome || 'Equipe de campo'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <DashboardStat label="Parcelas" value={stats?.parcelasHoje ?? 0} />
                <DashboardStat label="OK" value={stats?.avaliacoesOk ?? 0} />
                <DashboardStat label="Retoque" value={stats?.avaliacoesRefazer ?? 0} />
              </div>
            </div>
          </CardContent>
        </Card>

        {podeIniciarAvaliacao ? (
          <Link
            to="/avaliacoes/nova"
            className="flex items-center justify-between gap-4 rounded-[20px] bg-[var(--qc-primary)] px-4 py-4 text-white shadow-[0_20px_34px_-26px_rgba(0,107,68,0.62)] active:scale-[0.99] sm:px-5 sm:py-5"
          >
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(255,255,255,0.08)] sm:h-12 sm:w-12">
                <CirclePlus className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <span className="min-w-0 text-[clamp(1.45rem,7vw,2rem)] font-black tracking-[-0.05em] leading-none">
                Nova Avaliação
              </span>
            </div>

            <ArrowRight className="h-6 w-6 shrink-0 text-white sm:h-7 sm:w-7" />
          </Link>
        ) : (
          <AccessDeniedCard
            title="Coleta bloqueada para este perfil"
            description="A abertura de novas avaliações só aparece quando o administrador libera essa função para o seu perfil."
          />
        )}

        {perfilNormalizado === 'colaborador' ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="stack-md p-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                  Equipe do dia
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Escolha a equipe ativa da jornada para visualizar parcelas disponiveis, em andamento e de retoque.
                </p>
              </div>

              <Select
                value={session?.equipeDiaId || ''}
                onValueChange={(value) => {
                  const equipe = equipesVisiveis.find((item) => item.id === value) || null;
                  definirEquipeDoDia({
                    equipeId: value || null,
                    equipeNome: equipe?.nome || '',
                  });
                }}
              >
                <SelectTrigger className="h-12 rounded-[18px]">
                  <SelectValue placeholder="Selecione a equipe do dia" />
                </SelectTrigger>
                <SelectContent>
                  {equipesVisiveis.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {equipeDiaLabel ? (
                <p className="text-sm font-semibold text-[var(--qc-primary)]">
                  Equipe ativa: {equipeDiaLabel}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <section className="stack-md">
          <div className="flex items-center justify-between px-2">
            <p className="text-[1.05rem] font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
              Parcelas do dia
            </p>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => navigate('/parcelas')}
            >
              <Trees className="h-4 w-4" />
              Abrir fila
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <DashboardStat label="Disp." value={parcelasDisponiveis.length} />
            <DashboardStat label="Andam." value={parcelasEmAndamentoPlanejadas.length} />
            <DashboardStat label="Retoque" value={parcelasEmRetoquePlanejadas.length} />
          </div>

          {parcelasDisponiveis.length === 0 ? (
            <Card className="surface-card border-none shadow-sm">
              <CardContent className="p-4 text-sm text-[var(--qc-text-muted)]">
                Nenhuma parcela disponivel para a equipe atual.
              </CardContent>
            </Card>
          ) : (
            parcelasDisponiveis.slice(0, 4).map((parcela) => (
              <Card key={parcela.id} className="surface-card border-none shadow-sm">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                      {parcela.codigo}
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      Equipe {parcela.equipeNome || '--'} • Colheita {parcela.dataColheita}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() =>
                      navigate(`/avaliacoes/nova?parcelaPlanejadaId=${parcela.id}`)
                    }
                  >
                    Iniciar
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="stack-md">
          <div className="px-2">
            <p className="text-[1.05rem] font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
              Ações Rápidas
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link key={action.label} to={action.to}>
                  <Card className="surface-card h-full border-none bg-white shadow-sm active:scale-[0.985]">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(210,231,211,0.52)] text-[var(--qc-primary)]">
                        <Icon className="h-6 w-6" />
                      </div>

                      <div className="stack-xs min-w-0 flex-1">
                        <p className="text-[1.35rem] font-black tracking-[-0.05em] leading-tight text-[var(--qc-text)]">
                          {action.label}
                        </p>
                        <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                          {action.subtitle}
                        </p>
                      </div>

                      <ArrowRight className="h-5 w-5 shrink-0 text-[var(--qc-secondary)]" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="stack-md">
          <div className="px-2">
            <p className="text-[1.05rem] font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
              Avaliações em Andamento
            </p>
          </div>

          {avaliacoesEmAndamento.length === 0 ? (
            <Card className="rounded-[22px] border-2 border-dashed border-[var(--qc-border)] bg-[rgba(248,250,248,0.92)] shadow-none">
              <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-5 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[20px] border border-[var(--qc-border)] bg-white shadow-[0_18px_30px_-22px_rgba(17,33,23,0.18)]">
                  <ClipboardList className="h-9 w-9 text-[var(--qc-secondary)]" />
                </div>
                <p className="max-w-[18rem] text-[1.2rem] font-medium leading-relaxed text-[var(--qc-text)]">
                  Nenhuma avaliação iniciada nesta jornada
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="stack-md">
              {avaliacoesEmAndamento.map((avaliacao) => {
                const podeContinuar =
                  avaliacao.tipo === 'retoque'
                    ? canOperateAssignedRetoque({
                        perfil: usuarioAtual?.perfil,
                        usuarioId: usuarioAtual?.id,
                        responsavelId:
                          avaliacao.responsavelPrincipalId || avaliacao.usuarioId,
                        designadoParaId: avaliacao.retoqueDesignadoParaId,
                        designadoParaIds: avaliacao.retoqueDesignadoParaIds,
                        matrix: permissionMatrix,
                      })
                    : canStartEvaluation(usuarioAtual?.perfil, permissionMatrix);

                return (
                  <Card
                    key={avaliacao.id}
                    className="surface-card border-none bg-white shadow-sm"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[1.6rem] font-black tracking-[-0.05em] text-[var(--qc-text)]">
                            {avaliacao.parcelasResumo || avaliacao.parcelaCodigo}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--qc-secondary)]">
                            {avaliacao.totalParcelas > 0
                              ? `${avaliacao.totalParcelas} parcela${avaliacao.totalParcelas === 1 ? '' : 's'}`
                              : 'Parcela não definida'}
                          </p>
                          <p className="mt-1 text-sm font-medium text-[var(--qc-text-muted)]">
                            {avaliacao.totalRegistros} rua(s) registradas
                          </p>
                        </div>
                        <StatusBadge status={avaliacao.status} />
                      </div>

                      {podeContinuar ? (
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-2xl px-2 font-bold text-sm"
                            onClick={() => navigate(`/avaliacoes/${avaliacao.id}`)}
                          >
                            <ArrowRight className="h-4 w-4" />
                            Continuar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-2xl px-2 font-bold text-sm"
                            onClick={() => navigate(`/avaliacoes/${avaliacao.id}/editar`)}
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 rounded-2xl border-[rgba(197,58,53,0.28)] bg-[rgba(197,58,53,0.04)] px-2 font-bold text-[var(--qc-danger)] text-sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm('Excluir esta avaliação em andamento?')) {
                                deleteMutation.mutate(avaliacao.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm font-medium text-[var(--qc-text-muted)]">
                          Esta avaliação continua visível, mas a edição foi bloqueada para o seu perfil.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </LayoutMobile>
  );
}
