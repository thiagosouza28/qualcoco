import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils';

const Select = SelectPrimitive.Root;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef(function SelectTrigger(
  { className, children, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-12 w-full items-center justify-between rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 text-sm text-[var(--qc-text)] shadow-sm outline-none transition focus:border-[var(--qc-primary)] focus:bg-[var(--qc-surface)] focus:ring-4 focus:ring-[rgba(210,231,211,0.85)]',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 text-[var(--qc-text-muted)]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

const SelectContent = React.forwardRef(function SelectContent(
  { className, children, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          'z-50 max-h-80 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface)] shadow-soft',
          className,
        )}
        position="popper"
        {...props}
      >
        <SelectPrimitive.Viewport className="p-2">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

const SelectItem = React.forwardRef(function SelectItem(
  { className, children, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-xl py-2.5 pl-9 pr-3 text-sm text-[var(--qc-secondary)] outline-none data-[highlighted]:bg-[var(--qc-tertiary)] data-[highlighted]:text-[var(--qc-primary)]',
        className,
      )}
      {...props}
    >
      <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
