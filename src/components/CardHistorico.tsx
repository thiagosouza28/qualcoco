import { ChevronRight, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import type { Avaliacao } from '@/core/types';

export function CardHistorico({
  avaliacao,
  parcelas,
  participantes,
}: {
  avaliacao: Avaliacao;
  parcelas: string[];
  participantes: string[];
}) {
  const parcelasResumo =
    parcelas.length > 0
      ? [...parcelas]
          .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
          .join(' • ')
      : 'Parcela não definida';
  const participantesResumo =
    participantes.length > 0 ? participantes.join(' • ') : '--';

  return (
    <Link to={`/avaliacoes/${avaliacao.id}`}>
      <Card className="surface-card border-none shadow-sm transition-transform active:scale-[0.985]">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(210,231,211,0.52)] text-[var(--qc-primary)]">
            <ClipboardList className="h-5 w-5" />
          </div>

          <div className="stack-xs min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-base font-black leading-tight text-[var(--qc-text)]">
                {parcelasResumo}
              </h3>
              <StatusBadge status={avaliacao.status} />
            </div>

            <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
              {participantesResumo} • {avaliacao.totalRegistros || 0} reg.
            </p>
          </div>

          <ChevronRight className="h-5 w-5 shrink-0 text-[rgba(93,98,78,0.42)]" />
        </CardContent>
      </Card>
    </Link>
  );
}
