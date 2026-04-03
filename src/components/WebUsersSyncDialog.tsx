import { Cloud, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SyncProgressSnapshot } from '@/core/sync';

type WebUsersSyncDialogProps = {
  open: boolean;
  syncing: boolean;
  progress: SyncProgressSnapshot | null;
  errorMessage?: string;
  onRetry?: () => void;
  onClose?: () => void;
};

export function WebUsersSyncDialog({
  open,
  syncing,
  progress,
  errorMessage,
  onRetry,
  onClose,
}: WebUsersSyncDialogProps) {
  if (!open) {
    return null;
  }

  const percent = syncing ? progress?.percent ?? 0 : 100;
  const label = syncing
    ? progress?.label || 'Buscando logins cadastrados na web...'
    : errorMessage || 'N\u00e3o foi poss\u00edvel carregar os logins da web.';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(12,24,17,0.28)] px-5 backdrop-blur-[3px]">
      <div className="w-full max-w-[360px] rounded-[30px] border border-[rgba(0,107,68,0.12)] bg-white p-6 shadow-[0_30px_60px_-28px_rgba(17,33,23,0.38)]">
        <div className="flex items-start gap-4">
          <div
            className={
              syncing
                ? 'flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(210,231,211,0.62)] text-[var(--qc-primary)]'
                : 'flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(239,68,68,0.12)] text-red-600'
            }
          >
            {syncing ? (
              <LoaderCircle className="h-7 w-7 animate-spin" />
            ) : (
              <TriangleAlert className="h-7 w-7" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-[rgba(0,107,68,0.12)] bg-[rgba(210,231,211,0.28)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
              {syncing ? 'Buscando logins' : 'Falha na busca'}
            </span>

            <h3 className="mt-3 text-[1.65rem] font-black leading-[0.95] tracking-[-0.05em] text-[var(--qc-text)]">
              {syncing
                ? 'Carregando logins da web'
                : 'N\u00e3o foi poss\u00edvel carregar os logins'}
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-[var(--qc-text-muted)]">
              {label}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <Cloud className="ml-auto h-5 w-5 text-[var(--qc-primary)]" />
            <p className="mt-2 text-[1.7rem] font-black tracking-[-0.05em] text-[var(--qc-primary)]">
              {percent}%
            </p>
          </div>
        </div>

        <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--qc-surface-muted)]">
          <div
            className="h-full rounded-full bg-[var(--qc-primary)] transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {syncing ? null : (
          <div className="mt-5 flex flex-col gap-2">
            {onRetry ? (
              <Button
                className="h-11 w-full rounded-[18px] font-bold"
                onClick={onRetry}
              >
                Tentar novamente
              </Button>
            ) : null}

            {onClose ? (
              <Button
                variant="outline"
                className="h-11 w-full rounded-[18px] font-bold"
                onClick={onClose}
              >
                Fechar
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
