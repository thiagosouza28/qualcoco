import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { useSync } from '@/components/SyncContext';
import { listHistoricoAvaliacoes, queryKeys } from '@/lib/dataService';
import { createPageUrl, getParcelaBase, groupBy } from '@/utils';

function Historico() {
  const navigate = useNavigate();
  const { isOnline } = useSync();

  const { data: avaliacoes = [] } = useQuery({
    queryKey: queryKeys.historico,
    queryFn: () => listHistoricoAvaliacoes(isOnline),
  });

  const groups = useMemo(() => {
    const grouped = groupBy(avaliacoes, (item) => item.data || 'Sem data');
    return Object.entries(grouped).sort(([a], [b]) => new Date(b) - new Date(a));
  }, [avaliacoes]);

  return (
    <main className="page-shell">
      <PageHeader
        title="Histórico"
        subtitle="Últimas avaliações registradas"
        onBack={() => navigate(createPageUrl('Dashboard'))}
      />
      <section className="page-content space-y-5 pt-5">
        {groups.map(([date, items]) => (
          <div key={date} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {moment(date).format('DD [de] MMMM [de] YYYY')}
            </p>
            {items.map((item) => (
              <Link
                key={item.id}
                to={`${createPageUrl('ResumoParcela')}?id=${item.id}`}
              >
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-bold text-slate-900">
                        {getParcelaBase(item.parcela)}
                      </p>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-sm text-slate-600">
                      {item.responsavel} · {item.equipe1_nome} ·{' '}
                      {item.total_registros || 0} reg.
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}

export default Historico;
