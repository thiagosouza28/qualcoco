import { cn } from '@/utils';

function Label({ className, ...props }) {
  return (
    <label
      className={cn('text-sm font-semibold text-slate-800', className)}
      {...props}
    />
  );
}

export { Label };
