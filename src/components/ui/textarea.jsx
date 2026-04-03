import { cn } from '@/utils';

function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3 text-sm text-[var(--qc-text)] shadow-sm outline-none transition placeholder:text-[rgba(102,114,102,0.72)] focus:border-[var(--qc-primary)] focus:bg-[var(--qc-surface)] focus:ring-4 focus:ring-[rgba(210,231,211,0.85)]',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
