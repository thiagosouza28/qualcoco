import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon } from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { CardHistorico } from '@/components/CardHistorico';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listarColaboradoresAtivos } from '@/core/auth';
import { useCampoApp } from '@/core/AppProvider';
import { normalizeDateKey, todayIso } from '@/core/date';
import { isEvaluationFinalStatus } from '@/core/evaluationStatus';
import { excluirAvaliacaoCompleta, listarHistorico } from '@/core/evaluations';
import { canManageUsers, canViewHistory } from '@/core/permissions';
import { repository } from '@/core/repositories';
import { useRolePermissions } from '@/core/useRolePermissions';

const HISTORY_PAGE_SIZE = 20;
const RUA_FALHA_TIPOS = new Set(['rua_com_falha', 'linha_invalida']);

const formatarResumoHistoricoEquipe = (equipes: string[]) => {
  if (equipes.length === 0) return '';
  if (equipes.length === 1) return `Equipe ${equipes[0]}`;
  if (equipes.length === 2) return `Equipes ${equipes[0]} e ${equipes[1]}`;
  return `Equipe ${equipes[0]} +${equipes.length - 1}`;
};

export function TelaHistorico() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const { permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);
  const [dataFilter, setDataFilter] = useState(todayIso());
  const [colaboradorId, setColaboradorId] = useState('all');
  const [parcelaId, setParcelaId] = useState('all');
  const [syncStatus, setSyncStatus] = useState('all');
  const [page, setPage] = useState(1);
  const visibleLimit = page * HISTORY_PAGE_SIZE;

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['historico', 'colaboradores'],
    queryFn: listarColaboradoresAtivos,
    staleTime: 60_000,
  });

  const { data: parcelas = [] } = useQuery({
    queryKey: ['historico', 'parcelas'],
    queryFn: () => repository.list('parcelas'),
    staleTime: 60_000,
  });

  const { data: historico = [] } = useQuery({
    queryKey: [
      'historico',
      usuarioAtual?.id,
      dataFilter,
      colaboradorId,
      parcelaId,
      syncStatus,
      visibleLimit,
    ],
    queryFn: () =>
      listarHistorico(
        {
          data: dataFilter || undefined,
          colaboradorId: colaboradorId !== 'all' ? colaboradorId : undefined,
          parcelaId: parcelaId !== 'all' ? parcelaId : undefined,
          syncStatus: syncStatus as never,
        },
        usuarioAtual?.id,
        { limit: visibleLimit + 1 },
      ),
    enabled: Boolean(usuarioAtual?.id),
  });

  const { data: participantes = [] } = useQuery({
    queryKey: ['historico', 'participantes'],
    queryFn: () => repository.list('avaliacaoColaboradores'),
    staleTime: 30_000,
  });

  const { data: avaliacaoParcelas = [] } = useQuery({
    queryKey: ['historico', 'avaliacaoParcelas'],
    queryFn: () => repository.list('avaliacaoParcelas'),
    staleTime: 30_000,
  });

  const { data: avaliacaoRuas = [] } = useQuery({
    queryKey: ['historico', 'avaliacaoRuas'],
    queryFn: () => repository.list('avaliacaoRuas'),
    staleTime: 30_000,
  });

  const { data: registrosColeta = [] } = useQuery({
    queryKey: ['historico', 'registrosColeta'],
    queryFn: () => repository.list('registrosColeta'),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (avaliacaoId: string) => excluirAvaliacaoCompleta(avaliacaoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['historico'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'avaliacoes'] });
    },
  });

  const handleDelete = (avaliacaoId: string) => {
    if (deleteMutation.isPending) return;
    if (confirm('Excluir esta avaliação do histórico? Esta ação não pode ser desfeita.')) {
      deleteMutation.mutate(avaliacaoId);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [colaboradorId, dataFilter, parcelaId, syncStatus, usuarioAtual?.id]);

  const historicoVisivel = useMemo(
    () => historico.slice(0, visibleLimit),
    [historico, visibleLimit],
  );
  const hasMore = historico.length > visibleLimit;

  const participanteMap = useMemo(() => {
    return participantes.reduce<Record<string, string[]>>((acc, item) => {
      if (item.deletadoEm) return acc;
      const colaborador = colaboradores.find((row) => row.id === item.colaboradorId);
      const nome = item.colaboradorPrimeiroNome || colaborador?.primeiroNome || '';
      if (!nome) return acc;
      acc[item.avaliacaoId] = acc[item.avaliacaoId] || [];
      if (!acc[item.avaliacaoId].includes(nome)) {
        acc[item.avaliacaoId].push(nome);
      }
      return acc;
    }, {});
  }, [colaboradores, participantes]);

  const parcelaMap = useMemo(
    () =>
      avaliacaoParcelas.reduce<Record<string, string[]>>((acc, item) => {
        if (item.deletadoEm) return acc;
        acc[item.avaliacaoId] = acc[item.avaliacaoId] || [];
        if (!acc[item.avaliacaoId].includes(item.parcelaCodigo)) {
          acc[item.avaliacaoId].push(item.parcelaCodigo);
        }
        return acc;
      }, {}),
    [avaliacaoParcelas],
  );

  const equipeMap = useMemo(() => {
    const equipesPorAvaliacao = avaliacaoRuas.reduce<Record<string, string[]>>(
      (acc, item) => {
        if (item.deletadoEm || !item.equipeNome) return acc;
        acc[item.avaliacaoId] = acc[item.avaliacaoId] || [];
        if (!acc[item.avaliacaoId].includes(item.equipeNome)) {
          acc[item.avaliacaoId].push(item.equipeNome);
        }
        return acc;
      },
      {},
    );

    return Object.entries(equipesPorAvaliacao).reduce<Record<string, string>>(
      (acc, [avaliacaoId, equipes]) => {
        const equipesOrdenadas = [...equipes].sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true }),
        );
        acc[avaliacaoId] = formatarResumoHistoricoEquipe(equipesOrdenadas);
        return acc;
      },
      {},
    );
  }, [avaliacaoRuas]);

  const parcelasAtivas = useMemo(
    () =>
      parcelas
        .filter((item) => item.ativo && !item.deletadoEm)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })),
    [parcelas],
  );

  const groupedHistorico = useMemo(() => {
    const groups = historicoVisivel.reduce<
      Record<string, { label: string; items: typeof historicoVisivel }>
    >((acc, item) => {
      const dateKey = normalizeDateKey(item.dataAvaliacao);
      if (!dateKey) return acc;

      if (!acc[dateKey]) {
        acc[dateKey] = {
          label: new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }).format(new Date(`${dateKey}T12:00:00`)),
          items: [],
        };
      }

      acc[dateKey].items.push(item);
      return acc;
    }, {});

    return Object.entries(groups).sort(([left], [right]) =>
      right.localeCompare(left),
    );
  }, [historicoVisivel]);

  const hasPendingStreetsMap = useMemo(() => {
    const grouped = new Map<
      string,
      {
        total: number;
        completedRuaIds: Set<string>;
      }
    >();

    avaliacaoRuas.forEach((item) => {
      if (item.deletadoEm) return;

      const current = grouped.get(item.avaliacaoId) || {
        total: 0,
        completedRuaIds: new Set<string>(),
      };
      current.total += 1;

      if (RUA_FALHA_TIPOS.has(String(item.tipoFalha || ''))) {
        current.completedRuaIds.add(item.id);
      }

      grouped.set(item.avaliacaoId, current);
    });

    registrosColeta.forEach((item) => {
      if (item.deletadoEm) return;

      const current = grouped.get(item.avaliacaoId) || {
        total: 0,
        completedRuaIds: new Set<string>(),
      };
      current.completedRuaIds.add(item.ruaId);
      grouped.set(item.avaliacaoId, current);
    });

    return Array.from(grouped.entries()).reduce<Record<string, boolean>>(
      (acc, [avaliacaoId, value]) => {
        acc[avaliacaoId] = value.total > value.completedRuaIds.size;
        return acc;
      },
      {},
    );
  }, [avaliacaoRuas, registrosColeta]);

  const resolveHistoryTarget = (avaliacaoId: string, status: string) => {
    const hasPendingStreets =
      hasPendingStreetsMap[avaliacaoId] ?? !isEvaluationFinalStatus(status);

    return hasPendingStreets
      ? {
          path: `/avaliacoes/${avaliacaoId}`,
          label: 'Continuar avaliação',
        }
      : {
          path: `/detalhe/${avaliacaoId}`,
          label: 'Abrir resumo da equipe',
        };
  };

  if (!canViewHistory(usuarioAtual?.perfil, permissionMatrix)) {
    return (
      <LayoutMobile
        title="Histórico"
        subtitle="Acesso restrito"
        onBack={() => navigate(-1)}
      >
        <AccessDeniedCard description="O histórico só aparece quando essa consulta está liberada para o seu perfil pelo administrador." />
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title="Histórico"
      subtitle="Últimas avaliações registradas"
      onBack={() => navigate(-1)}
    >
      <div className="stack-lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Input
              type="date"
              className="h-11 rounded-[16px] pl-11"
              value={dataFilter}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDataFilter(event.target.value)
              }
            />
            <CalendarIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--qc-text-muted)]" />
          </div>

          <Select value={syncStatus} onValueChange={setSyncStatus}>
            <SelectTrigger className="h-11 rounded-[16px]">
              <SelectValue placeholder="Status da sincronização" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending_sync">Pendente</SelectItem>
              <SelectItem value="synced">Sincronizado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={colaboradorId} onValueChange={setColaboradorId}>
            <SelectTrigger className="h-11 rounded-[16px]">
              <SelectValue placeholder="Colaborador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {colaboradores.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.primeiroNome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={parcelaId} onValueChange={setParcelaId}>
            <SelectTrigger className="h-11 rounded-[16px]">
              <SelectValue placeholder="Parcela" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as parcelas</SelectItem>
              {parcelasAtivas.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.codigo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {groupedHistorico.length === 0 ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                Nenhuma avaliação encontrada para os filtros selecionados.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="stack-md">
            {groupedHistorico.map(([dateKey, group]) => (
              <div key={dateKey} className="stack-sm">
                <h2 className="px-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--qc-secondary)]">
                  {group.label}
                </h2>
                {group.items.map((item) => {
                  const target = resolveHistoryTarget(item.id, item.status);

                  return (
                    <CardHistorico
                      key={item.id}
                      avaliacao={item}
                      parcelas={parcelaMap[item.id] || []}
                      equipeResumo={
                        equipeMap[item.id] ||
                        (item.equipeNome ? `Equipe ${item.equipeNome}` : '')
                      }
                      participantes={participanteMap[item.id] || []}
                      targetPath={target.path}
                      targetLabel={target.label}
                      onDelete={
                        canManageUsers(usuarioAtual?.perfil)
                          ? handleDelete
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))}

            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-[18px] font-bold"
                onClick={() => setPage((current) => current + 1)}
              >
                Carregar mais
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </LayoutMobile>
  );
}
