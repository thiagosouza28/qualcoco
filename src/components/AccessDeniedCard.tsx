import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function AccessDeniedCard({
  title = 'Acesso restrito',
  description = 'Seu perfil não possui liberação para este módulo.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="surface-card border-none shadow-sm">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[rgba(197,58,53,0.08)] text-[var(--qc-danger)]">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-black tracking-tight text-[var(--qc-text)]">
            {title}
          </p>
          <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
