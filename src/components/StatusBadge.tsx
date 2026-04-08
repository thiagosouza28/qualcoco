import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  RefreshCcw,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getEvaluationStatusMeta } from '@/core/evaluationStatus';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = getEvaluationStatusMeta(status);

  if (meta.tone === 'success') {
    return (
      <Badge
        variant="emerald"
        className="gap-1.5 border-[rgba(0,107,68,0.18)] bg-[rgba(0,107,68,0.1)] text-[var(--qc-primary)]"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {meta.label}
      </Badge>
    );
  }

  if (meta.tone === 'reviewed') {
    return (
      <Badge
        variant="blue"
        className="gap-1.5 border-[rgba(31,97,164,0.2)] bg-[rgba(31,97,164,0.1)] text-[#1f61a4]"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        {meta.label}
      </Badge>
    );
  }

  if (meta.tone === 'active') {
    return (
      <Badge
        variant="default"
        className="gap-1.5 border-[rgba(221,124,41,0.22)] bg-[rgba(221,124,41,0.12)] text-[#b45c13]"
      >
        <Wrench className="h-3.5 w-3.5" />
        {meta.label}
      </Badge>
    );
  }

  if (meta.tone === 'warning') {
    return (
      <Badge
        variant="amber"
        className="gap-1.5 border-[#f1d483] bg-[#fff3c7] text-[#8c6a00]"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {meta.label}
      </Badge>
    );
  }

  return (
    <Badge
      variant="amber"
      className="gap-1.5 border-[#eadfbe] bg-[#f8f1de] text-[#7f6b2b]"
    >
      <CircleDashed className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}
