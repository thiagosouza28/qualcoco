import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: 'ok' | 'refazer' | 'in_progress' | 'draft' | 'completed' | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'ok' || status === 'completed') {
    return (
      <Badge
        variant="emerald"
        className="gap-1.5 border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] text-[var(--qc-primary)]"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        OK
      </Badge>
    );
  }

  if (status === 'refazer') {
    return (
      <Badge
        variant="destructive"
        className="gap-1.5 border-[rgba(197,58,53,0.12)] bg-[rgba(197,58,53,0.1)] text-[var(--qc-danger)]"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        RETOQUE
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="gap-1.5 border-[rgba(93,98,78,0.12)] bg-[rgba(93,98,78,0.08)] text-[var(--qc-secondary)]"
    >
      <Clock3 className="h-3.5 w-3.5" />
      EM ANDAMENTO
    </Badge>
  );
}
