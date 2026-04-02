import { cva } from 'class-variance-authority';
import { cn } from '@/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]',
  {
    variants: {
      variant: {
        default:
          'border-[var(--qc-border)] bg-[var(--qc-surface-muted)] text-[var(--qc-secondary)]',
        secondary:
          'border-[rgba(93,98,78,0.12)] bg-[rgba(93,98,78,0.08)] text-[var(--qc-secondary)]',
        emerald:
          'border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] text-[var(--qc-primary)]',
        amber: 'border-[#eadfbe] bg-[#f8f1de] text-[#7f6b2b]',
        red: 'border-[rgba(197,58,53,0.12)] bg-[rgba(197,58,53,0.1)] text-[var(--qc-danger)]',
        destructive:
          'border-[rgba(197,58,53,0.12)] bg-[rgba(197,58,53,0.1)] text-[var(--qc-danger)]',
        blue: 'border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] text-[var(--qc-primary)]',
        slate:
          'border-[var(--qc-border)] bg-[var(--qc-surface-muted)] text-[var(--qc-secondary)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
