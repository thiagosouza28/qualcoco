import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { useSync } from '@/components/SyncContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  listConfiguracoes,
  queryKeys,
  upsertConfiguracaoRecord,
} from '@/lib/dataService';
import { clamp, createPageUrl } from '@/utils';

function LimitControl({ label, value, onChange, tone }) {
  const palette =
    tone === 'amber'
      ? 'border-amber-100 bg-amber-50/70'
      : 'border-emerald-100 bg-emerald-50/70';

  return (
    <Card className={`${palette}`}>
      <CardContent className="space-y-3 p-5">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => onChange(Math.max(0, value - 0.5))}
          >
            -
          </Button>
          <Input
            type="number"
            step="0.5"
            min="0"
            value={value}
            onChange={(event) =>
              onChange(clamp(Number(event.target.value || 0), 0, 20))
            }
            className="text-center"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => onChange(Math.min(20, value + 0.5))}
          >
            +
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Configuracoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline, queueOperation } = useSync();
  const [limiteCocos, setLimiteCocos] = useState(2);
  const [limiteCachos, setLimiteCachos] = useState(2);
  const [saved, setSaved] = useState(false);

  const { data: configs = [] } = useQuery({
    queryKey: queryKeys.configuracao,
    queryFn: () => listConfiguracoes(isOnline),
  });

  useEffect(() => {
    setLimiteCocos(configs[0]?.limite_cocos ?? 2);
    setLimiteCachos(configs[0]?.limite_cachos ?? 2);
  }, [configs]);

  useEffect(() => {
    if (!saved) return undefined;
    const timeout = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertConfiguracaoRecord(
        configs[0],
        {
          tipo: 'geral',
          limite_cocos: limiteCocos,
          limite_cachos: limiteCachos,
        },
        { isOnline, queueOperation },
      ),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.configuracao });
    },
  });

  return (
    <main className="page-shell">
      <PageHeader
        title="Configurações"
        subtitle="Limites usados para aprovação ou retoque da colheita"
        onBack={() => navigate(createPageUrl('Dashboard'))}
      />

      <section className="page-content space-y-4 pt-5">
        <LimitControl
          label="Limite — Cocos no Chão"
          value={limiteCocos}
          onChange={(value) => setLimiteCocos(value)}
          tone="amber"
        />
        <LimitControl
          label="Limite — Cachos com 5 Cocos"
          value={limiteCachos}
          onChange={(value) => setLimiteCachos(value)}
          tone="emerald"
        />
        <Card>
          <CardContent className="p-5 text-sm text-slate-600">
            Se a média for maior que X, a parcela será marcada como
            &quot;Retoque&quot;.
          </CardContent>
        </Card>
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => saveMutation.mutate()}
        >
          Salvar
        </Button>
        {saved ? (
          <p className="text-center text-sm font-semibold text-emerald-700">
            ✓ Salvo!
          </p>
        ) : null}
      </section>
    </main>
  );
}

export default Configuracoes;
