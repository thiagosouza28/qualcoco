import { cn } from '@/utils';

function Input({ className, type, ...props }) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 text-sm text-[var(--qc-text)] shadow-sm outline-none transition placeholder:text-[rgba(102,114,102,0.72)] focus:border-[var(--qc-primary)] focus:bg-white focus:ring-4 focus:ring-[rgba(210,231,211,0.85)]',
        type === 'number' &&
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export { Input };
