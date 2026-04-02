import { cn } from '@/utils';

function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-[22px] border border-[var(--qc-border)] bg-white/98 shadow-[0_18px_36px_-28px_rgba(17,33,23,0.18)]',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return <div className={cn('space-y-1.5 p-4', className)} {...props} />;
}

function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn('text-base font-bold text-[var(--qc-text)]', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-[var(--qc-text-muted)]', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn('p-4 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
