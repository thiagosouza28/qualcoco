import { useEffect, useRef, useState } from 'react';
import { Cloud, LoaderCircle, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCampoApp } from '@/core/AppProvider';
import { cn } from '@/utils';

const STARTUP_SYNC_MODAL_MIN_MS = 1200;
const STARTUP_SYNC_MODAL_MAX_MS = 4500;

let startupSyncModalHandled = false;

export function SyncStatusBar() {
  const location = useLocation();
  const { bootstrapped, online, pendenciasSync, sincronizando, syncProgress } = useCampoApp();
  const [open, setOpen] = useState(false);
  const openedAtRef = useRef(0);

  useEffect(() => {
    const isDashboardReady =
      bootstrapped && location.pathname === '/dashboard';

    if (!isDashboardReady || startupSyncModalHandled) {
      return;
    }

    startupSyncModalHandled = true;

    if (!online) {
      return;
    }

    openedAtRef.current = Date.now();
    setOpen(true);
  }, [bootstrapped, location.pathname, online]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!online || location.pathname !== '/dashboard') {
      setOpen(false);
      return;
    }

    const elapsed = Date.now() - openedAtRef.current;
    const timers: number[] = [];

    if (!sincronizando) {
      timers.push(
        window.setTimeout(
          () => setOpen(false),
          Math.max(STARTUP_SYNC_MODAL_MIN_MS - elapsed, 0),
        ),
      );
    }

    timers.push(
      window.setTimeout(
        () => setOpen(false),
        Math.max(STARTUP_SYNC_MODAL_MAX_MS - elapsed, 0),
      ),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [location.pathname, online, open, sincronizando]);

  if (!open) {
    return null;
  }

  const state = sincronizando
    ? {
        icon: LoaderCircle,
        iconClassName: 'animate-spin',
        title: 'Sincronizando com a nuvem',
        description:
          syncProgress?.label || 'Atualizando dados deste aparelho com a base web.',
        badge: `${syncProgress?.percent ?? 0}%`,
      }
    : pendenciasSync > 0
      ? {
          icon: RefreshCw,
          iconClassName: '',
          title: 'Sincronização iniciada',
          description: `${pendenciasSync} operação(ões) entraram na fila para envio automático.`,
          badge: 'Fila pronta',
        }
      : {
          icon: Cloud,
          iconClassName: '',
          title: 'Conexão online detectada',
          description: 'Verificando atualizações na nuvem para iniciar o dia.',
          badge: 'Online',
        };

  const Icon = state.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,24,17,0.18)] px-5 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] rounded-[30px] border border-[var(--qc-border-strong)] bg-[var(--qc-surface)] p-6 shadow-[0_30px_60px_-28px_rgba(17,33,23,0.38)]">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(210,231,211,0.62)] text-[var(--qc-primary)]">
            <Icon className={cn('h-7 w-7', state.iconClassName)} />
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
              {state.badge}
            </span>
            <h3 className="mt-3 text-[1.65rem] font-black leading-[0.95] tracking-[-0.05em] text-[var(--qc-text)]">
              {state.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--qc-text-muted)]">
              {state.description}
            </p>
            {sincronizando ? (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-[var(--qc-surface-muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--qc-primary)] transition-[width] duration-300"
                    style={{ width: `${syncProgress?.percent ?? 0}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
