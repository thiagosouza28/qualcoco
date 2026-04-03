import { Download, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppUpdate } from '@/core/AppUpdateProvider';

export function AppUpdateDialog() {
  const {
    availableUpdate,
    updateDialogOpen,
    updatingApp,
    updateProgressPercent,
    installReadyForAvailableUpdate,
    dismissUpdate,
    openUpdate,
  } = useAppUpdate();

  if (!availableUpdate || !updateDialogOpen) {
    return null;
  }

  const required = availableUpdate.required;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(12,24,17,0.34)] px-5 backdrop-blur-sm">
      <div className="w-full max-w-[380px] rounded-[30px] border border-[var(--qc-border-strong)] bg-white p-6 shadow-[0_30px_60px_-28px_rgba(17,33,23,0.42)]">
        <div className="flex items-start gap-4">
          <div
            className={
              required
                ? 'flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(239,68,68,0.12)] text-red-600'
                : 'flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(210,231,211,0.62)] text-[var(--qc-primary)]'
            }
          >
            {required ? (
              <ShieldAlert className="h-7 w-7" />
            ) : (
              <Download className="h-7 w-7" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
              {required ? 'Obrigat\u00f3ria' : 'Nova vers\u00e3o'}
            </span>

            <h3 className="mt-3 text-[1.65rem] font-black leading-[0.95] tracking-[-0.05em] text-[var(--qc-text)]">
              {required
                ? 'Atualiza\u00e7\u00e3o obrigat\u00f3ria'
                : 'Atualiza\u00e7\u00e3o dispon\u00edvel'}
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-[var(--qc-text-muted)]">
              Vers\u00e3o instalada: {availableUpdate.currentVersion}
              <br />
              Nova vers\u00e3o: {availableUpdate.latestVersion}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-[var(--qc-text-muted)]">
              {updatingApp
                ? `Baixando o APK internamente${updateProgressPercent != null ? ` (${updateProgressPercent}%)` : '...'}`
                : installReadyForAvailableUpdate
                  ? 'O APK j\u00e1 foi preparado. Toque abaixo para reabrir o instalador e concluir a atualiza\u00e7\u00e3o.'
                  : required
                    ? 'O app vai baixar o APK internamente e abrir o instalador do Android automaticamente.'
                    : 'Um APK mais recente foi encontrado. O download ser\u00e1 feito dentro do aplicativo, sem abrir link externo.'}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <Button
                size="lg"
                className="h-12 w-full rounded-[18px] text-base font-bold"
                onClick={() => {
                  void openUpdate();
                }}
                disabled={updatingApp}
              >
                {updatingApp
                  ? updateProgressPercent != null
                    ? `Baixando... ${updateProgressPercent}%`
                    : 'Preparando atualiza\u00e7\u00e3o...'
                  : installReadyForAvailableUpdate
                    ? required
                      ? 'Continuar atualiza\u00e7\u00e3o'
                      : 'Abrir instalador'
                    : required
                      ? 'Atualizar para continuar'
                      : 'Atualizar agora'}
              </Button>

              {!required && !updatingApp ? (
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-[18px] font-bold"
                  onClick={dismissUpdate}
                >
                  Depois
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
