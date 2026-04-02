import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  FileText,
  History,
  LogOut,
  Palmtree,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { useSync } from '@/components/SyncContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listAvaliacoesByJornada, queryKeys } from '@/lib/dataService';
import {
  clearJornada,
  createPageUrl,
  getJornadaId,
  getParcelaBase,
  getResponsavelNome,
  groupBy,
} from '@/utils';

const quickActions = [
  { label: 'Relatório', icon: FileText, color: 'bg-blue-50 text-blue-700', to: 'Relatorio' },
  { label: 'Histórico', icon: History, color: 'bg-violet-50 text-violet-700', to: 'Historico' },
  { label: 'Equipes', icon: Users, color: 'bg-amber-50 text-amber-700', to: 'Equipes' },
  { label: 'Configurações', icon: Settings, color: 'bg-slate-100 text-slate-700', to: 'Configuracoes' },
];

function Dashboard() {
  const navigate = useNavigate();
  const { isOnline } = useSync();
  const jornadaId = getJornadaId();
  const responsavel = getResponsavelNome();

  const { data: avaliacoes = [] } = useQuery({
    queryKey: queryKeys.avaliacoesJornada(jornadaId),
    queryFn: () => listAvaliacoesByJornada(jornadaId, isOnline),
  });

  const grouped = useMemo(() => {
    const byEquipe = groupBy(avaliacoes, (item) => item.equipe1_nome || 'Sem equipe');
    return Object.entries(byEquipe)
      .map(([equipe, items]) => ({
        equipe,
        items: [...items].sort(
          (a, b) =>
            new Date(b.created_date || b.updated_date || 0) -
            new Date(a.created_date || a.updated_date || 0),
        ),
      }))
      .sort(
        (a, b) =>
          new Date(b.items[0]?.created_date || b.items[0]?.updated_date || 0) -
          new Date(a.items[0]?.created_date || a.items[0]?.updated_date || 0),
      );
  }, [avaliacoes]);

  const stats = useMemo(
    () => ({
      total: avaliacoes.length,
      ok: avaliacoes.filter((item) => item.status === 'ok').length,
      refazer: avaliacoes.filter((item) => item.status === 'refazer').length,
    }),
    [avaliacoes],
  );

  const handleLogout = () => {
    clearJornada();
    navigate(createPageUrl('IniciarJornada'), { replace: true });
  };

  return (
    <main className="page-shell overflow-x-hidden">
      <header className="safe-page-header-lg sticky top-0 z-10 border-b border-emerald-800 bg-emerald-900 px-5 py-5 text-white">
        <div className="mx-auto max-w-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Palmtree className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-display text-xl font-bold">QualCoco</p>
                  <p className="text-xs text-emerald-100">{responsavel}</p>
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatCard icon={ClipboardList} label="Parcelas" value={stats.total} color="blue" className="bg-white/95" />
            <StatCard icon={ShieldCheck} label="OK" value={stats.ok} color="emerald" className="bg-white/95" />
            <StatCard icon={History} label="Retoque" value={stats.refazer} color="red" className="bg-white/95" />
          </div>
        </div>
      </header>

      <section className="page-content pt-5">
        <Button
          size="lg"
          className="w-full"
          onClick={() => navigate(createPageUrl('NovaAvaliacao'))}
        >
          Nova Avaliação
        </Button>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} to={createPageUrl(action.to)}>
                <Card className="h-full transition hover:-translate-y-0.5">
                  <CardContent className="flex h-full flex-col gap-4 p-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${action.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{action.label}</p>
                      <p className="text-xs text-slate-500">Acesso rápido</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-800">Avaliações de Hoje</h2>
            <p className="text-xs text-slate-500">{isOnline ? 'Online' : 'Offline'}</p>
          </div>

          {grouped.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-slate-500">
                Nenhuma avaliação iniciada nesta jornada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.equipe} className="space-y-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {group.equipe}
                  </p>
                  {group.items.map((item) => (
                    <Link
                      key={item.id}
                      to={`${createPageUrl('ResumoParcela')}?id=${item.id}`}
                    >
                      <Card className="transition hover:border-emerald-200">
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-bold text-slate-900">
                                {getParcelaBase(item.parcela)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.total_registros || 0}/{item.total_ruas || 0} ruas
                              </p>
                            </div>
                            <StatusBadge status={item.status} />
                          </div>
                          {item.equipe2_nome ? (
                            <p className="text-sm text-slate-600">Equipe 2: {item.equipe2_nome}</p>
                          ) : null}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default Dashboard;
