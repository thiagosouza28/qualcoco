import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ShieldAlert,
  Sprout,
} from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { useSync } from '@/components/SyncContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getAvaliacaoById,
  listConfiguracoes,
  listRegistrosByAvaliacao,
  queryKeys,
  updateAvaliacaoRecord,
} from '@/lib/dataService';
import {
  createPageUrl,
  getParcelaBase,
  resolveSearchParam,
  round2,
} from '@/utils';

function ResumoParcela() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline, queueOperation } = useSync();
  const avaliacaoId = resolveSearchParam(location.search, 'id');

  const { data: avaliacao } = useQuery({
    queryKey: queryKeys.avaliacao(avaliacaoId),
    queryFn: () => getAvaliacaoById(avaliacaoId, isOnline),
    enabled: Boolean(avaliacaoId),
  });
  const { data: registros = [] } = useQuery({
    queryKey: queryKeys.registros(avaliacaoId),
    queryFn: () => listRegistrosByAvaliacao(avaliacaoId, isOnline),
    enabled: Boolean(avaliacaoId),
  });
  const { data: configs = [] } = useQuery({
    queryKey: queryKeys.configuracao,
    queryFn: () => listConfiguracoes(isOnline),
  });

  const limiteCocos = configs[0]?.limite_cocos ?? 2;
  const limiteCachos = configs[0]?.limite_cachos ?? 2;
  const divisor = Math.max(avaliacao?.total_registros || 0, 1);
  const mediaCocos = round2((avaliacao?.total_cocos_chao || 0) / divisor);
  const mediaCachos = round2((avaliacao?.total_cachos_3 || 0) / divisor);
  const mediaTotal = round2(
    ((avaliacao?.total_cocos_chao || 0) + (avaliacao?.total_cachos_3 || 0)) /
      divisor,
  );
  const isAboveLimit = mediaCocos > limiteCocos || mediaCachos > limiteCachos;

  const detailMessages = useMemo(() => {
    const messages = [];
    if (mediaCocos > limiteCocos) {
      messages.push(`Média de cocos no chão acima de ${limiteCocos}`);
    }
    if (mediaCachos > limiteCachos) {
      messages.push(`Média de cachos acima de ${limiteCachos}`);
    }
    return messages;
  }, [limiteCachos, limiteCocos, mediaCachos, mediaCocos]);

  const finalizeMutation = useMutation({
    mutationFn: () =>
      updateAvaliacaoRecord(
        avaliacao.id,
        {
          status: isAboveLimit ? 'refazer' : 'ok',
          finalizada: true,
        },
        { isOnline, queueOperation },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacao(avaliacao.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacoesJornada(avaliacao.jornada_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.historico });
    },
  });

  return (
    <main className="page-shell">
      <PageHeader
        title={getParcelaBase(avaliacao?.parcela) || 'Resumo da Parcela'}
        subtitle="Consolidação dos registros da avaliação"
        onBack={() => navigate(createPageUrl('Dashboard'))}
      />

      <section className="page-content space-y-4 pt-5">
        <Card
          className={
            isAboveLimit
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }
        >
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-3">
              {isAboveLimit ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              <p className="text-sm font-bold">
                {isAboveLimit
                  ? '⚠️ PARCELA ACIMA DO LIMITE — Equipe deve retornar para o retoque da colheita'
                  : 'PARCELA DENTRO DO LIMITE — Colheita aprovada'}
              </p>
            </div>
            {isAboveLimit && detailMessages.length > 0 ? (
              <p className="text-xs">{detailMessages.join(' • ')}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={Sprout}
            label="Total Cocos"
            value={avaliacao?.total_cocos_chao || 0}
            color="amber"
          />
          <StatCard
            icon={ShieldAlert}
            label="Total Cachos 3"
            value={avaliacao?.total_cachos_3 || 0}
            color="emerald"
          />
          <StatCard
            icon={BarChart3}
            label="Média Cocos"
            value={mediaCocos}
            color={mediaCocos > limiteCocos ? 'red' : 'blue'}
          />
          <StatCard
            icon={BarChart3}
            label="Média Cachos"
            value={mediaCachos}
            color={mediaCachos > limiteCachos ? 'red' : 'blue'}
          />
        </div>

        <StatCard
          icon={BarChart3}
          label="Média Total"
          value={mediaTotal}
          color={isAboveLimit ? 'red' : 'slate'}
        />

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-900">
                {getParcelaBase(avaliacao?.parcela)}
              </p>
              <StatusBadge status={avaliacao?.status} />
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              <p>Equipe 1: {avaliacao?.equipe1_nome}</p>
              {avaliacao?.equipe2_nome ? <p>Equipe 2: {avaliacao.equipe2_nome}</p> : null}
              <p>Responsável: {avaliacao?.responsavel}</p>
              <p>Total registros: {avaliacao?.total_registros || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1.2fr,0.8fr,0.8fr] border-b border-slate-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>Rua</span>
              <span>🥥 Cocos</span>
              <span>🌴 Cachos</span>
            </div>
            {registros.map((registro) => (
              <div
                key={registro.id}
                className="grid grid-cols-[1.2fr,0.8fr,0.8fr] items-center border-b border-slate-100 px-5 py-3 text-sm last:border-b-0"
              >
                <span className="font-semibold text-slate-800">
                  {registro.linha_inicial} → {registro.linha_final}
                </span>
                <span className="text-slate-600">{registro.cocos_chao || 0}</span>
                <span className="text-slate-600">{registro.cachos_3_cocos || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate(`${createPageUrl('RegistroLinhas')}?id=${avaliacao?.id}`)
            }
          >
            Mais Registros
          </Button>
          {avaliacao?.status === 'em_andamento' ? (
            <Button
              type="button"
              className={isAboveLimit ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
            >
              Finalizar
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default ResumoParcela;
