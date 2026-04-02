import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils';
import { LucideIcon } from 'lucide-react';

const toneClasses = {
  emerald: 'bg-[var(--qc-tertiary)] text-[var(--qc-primary)] border-[var(--qc-border-strong)]',
  amber: 'bg-[#f8f1de] text-[#7f6b2b] border-[#eadfbe]',
  red: 'bg-[rgba(197,58,53,0.1)] text-[var(--qc-danger)] border-[rgba(197,58,53,0.12)]',
  blue: 'bg-[var(--qc-tertiary)] text-[var(--qc-primary)] border-[var(--qc-border-strong)]',
  slate: 'bg-[var(--qc-surface-muted)] text-[var(--qc-secondary)] border-[var(--qc-border)]',
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  color?: 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
  className?: string;
}

export function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color = 'slate', 
  className 
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'h-full overflow-hidden rounded-[28px] border border-[var(--qc-border)] bg-white/95 shadow-sm',
        className,
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
            toneClasses[color]
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="max-w-[5rem] text-right text-[9px] font-extrabold uppercase leading-tight tracking-[0.24em] text-[var(--qc-secondary)]">
            {label}
          </p>
        </div>
        <div className="mt-auto text-center text-[2rem] font-black tracking-[-0.04em] text-[var(--qc-text)]">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
