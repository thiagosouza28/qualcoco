import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef(function DialogOverlay(
  { className, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-[rgba(17,33,23,0.34)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
});

const DialogContent = React.forwardRef(function DialogContent(
  { className, children, showClose = true, ...props },
  ref,
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1.5rem-var(--safe-top)-var(--safe-bottom))] w-[min(calc(100vw-1.5rem),30rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[32px] border border-[var(--qc-border)] bg-[var(--qc-surface)] p-6 shadow-soft',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1 text-[var(--qc-text-muted)] active:bg-[var(--qc-surface-muted)] active:text-[var(--qc-secondary)]">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

function DialogHeader({ className, ...props }) {
  return <div className={cn('space-y-1.5 text-left', className)} {...props} />;
}

const DialogTitle = React.forwardRef(function DialogTitle(
  { className, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-bold text-[var(--qc-text)]', className)}
      {...props}
    />
  );
});

const DialogDescription = React.forwardRef(function DialogDescription(
  { className, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-[var(--qc-text-muted)]', className)}
      {...props}
    />
  );
});

function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
