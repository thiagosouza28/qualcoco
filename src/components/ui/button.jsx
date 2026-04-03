import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition active:scale-[0.99] active:brightness-[0.97] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--qc-primary)] text-white shadow-[0_14px_24px_-18px_rgba(0,107,68,0.42)] rounded-[18px]',
        secondary:
          'bg-[var(--qc-secondary)] text-white shadow-[0_14px_24px_-18px_rgba(93,98,78,0.42)] rounded-[18px]',
        outline:
          'border border-[var(--qc-border-strong)] bg-[var(--qc-surface)] text-[var(--qc-primary)] rounded-[18px]',
        ghost: 'bg-transparent text-[var(--qc-secondary)] rounded-[14px]',
        destructive:
          'bg-red-600 text-white shadow-[0_14px_24px_-18px_rgba(220,38,38,0.42)] rounded-[18px]',
      },
      size: {
        default: 'h-11 px-4 text-sm',
        sm: 'h-9 rounded-[14px] px-3.5 text-sm',
        lg: 'h-[52px] px-5 text-base rounded-[18px]',
        icon: 'h-10 w-10 rounded-[14px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
