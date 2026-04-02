import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Cloud, KeyRound, LoaderCircle, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCampoApp } from '@/core/AppProvider';
import { getUltimoUsuario, listarColaboradoresAtivos } from '@/core/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const sanitizeMatriculaInput = (value: string) => value.replace(/\D/g, '');
const formatDurationLabel = (durationMs?: number | null) => {
  if (!durationMs || durationMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
};

export function TelaLogin() {
  const {
    session,
    login,
    bootstrapped,
    online,
    sincronizando,
    sincronizarAcessosWeb,
    syncProgress,
  } = useCampoApp();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState(
    sanitizeMatriculaInput(params.get('usuario') || getUltimoUsuario()),
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncingWebAccess, setSyncingWebAccess] = useState(false);
  const attemptedWebAccessSyncRef = useRef(false);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['login', 'colaboradores'],
    queryFn: listarColaboradoresAtivos,
    enabled: bootstrapped,
  });

  const hasUsers = useMemo(() => colaboradores.length > 0, [colaboradores]);
  const showLoginProgress = sincronizando && Boolean(syncProgress) && (syncingWebAccess || loading);

  useEffect(() => {
    if (!bootstrapped) return;

    void import('@/screens/TelaDashboard');
    void import('@/screens/TelaSelecaoUsuario');
  }, [bootstrapped]);

  useEffect(() => {
    if (!online) {
      attemptedWebAccessSyncRef.current = false;
    }
  }, [online]);

  useEffect(() => {
    if (!bootstrapped || !online || hasUsers || attemptedWebAccessSyncRef.current) {
      return;
    }

    attemptedWebAccessSyncRef.current = true;
    setSyncingWebAccess(true);

    void sincronizarAcessosWeb().finally(() => {
      setSyncingWebAccess(false);
    });
  }, [bootstrapped, hasUsers, online, sincronizarAcessosWeb]);

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(identifier, pin);
    } catch (caught) {
      const fallbackMessage =
        caught instanceof Error ? caught.message : 'Falha no login.';

      if (
        online &&
        fallbackMessage === 'Usuário não encontrado no banco local.'
      ) {
        try {
          setSyncingWebAccess(true);
          await sincronizarAcessosWeb();
          await login(identifier, pin);
          return;
        } catch (retryError) {
          setError(
            retryError instanceof Error ? retryError.message : fallbackMessage,
          );
        } finally {
          setSyncingWebAccess(false);
        }
      } else {
        setError(fallbackMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-hero">
        <span className="hero-badge">QualCoco Campo</span>
        <h1 className="hero-title">Coleta agrícola offline, segura e rápida.</h1>
        <p className="hero-text">
          Login por matrícula e PIN numérico, com operação pronta
          para funcionar sem internet.
        </p>
      </section>

      <Card className="login-card">
        <CardContent className="space-y-5 p-6">
          {!hasUsers ? (
            <div className="empty-state">
              <p className="text-sm font-semibold text-slate-800">
                Nenhum colaborador cadastrado neste aparelho.
              </p>
              <p className="text-sm text-slate-500">
                {online
                  ? 'Buscando acessos cadastrados na web para liberar o login offline neste aparelho.'
                  : 'Conecte o aparelho uma vez para baixar os acessos da web e manter o login disponível offline.'}
              </p>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="input-block">
              <label>Matrícula</label>
              <div className="input-shell">
                <UserRound className="h-4 w-4 text-emerald-700" />
                <Input
                  value={identifier}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="username"
                  placeholder="Ex.: 10392"
                  onChange={(event: any) =>
                    setIdentifier(sanitizeMatriculaInput(event.target.value))
                  }
                />
              </div>
            </div>

            <div className="input-block">
              <label>PIN</label>
              <div className="input-shell">
                <KeyRound className="h-4 w-4 text-emerald-700" />
                <Input
                  value={pin}
                  type="tel"
                  placeholder="4 ou 6 dígitos"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="current-password"
                  maxLength={6}
                  onChange={(event: any) =>
                    setPin(event.target.value.replace(/\D/g, ''))
                  }
                />
              </div>
            </div>

            {syncingWebAccess ? (
              <p className="text-sm text-slate-500">
                Sincronizando acessos da web...
              </p>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || !hasUsers}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>

            <Button type="button" variant="outline" size="lg" asChild className="w-full">
              <Link to="/usuarios">Trocar colaborador</Link>
            </Button>

          </form>
        </CardContent>
      </Card>

      {showLoginProgress && syncProgress ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,24,17,0.2)] px-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[360px] rounded-[30px] border border-[rgba(0,107,68,0.12)] bg-white p-6 shadow-[0_30px_60px_-28px_rgba(17,33,23,0.38)]">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(210,231,211,0.62)] text-[var(--qc-primary)]">
                <LoaderCircle className="h-7 w-7 animate-spin" />
              </div>

              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-full border border-[rgba(0,107,68,0.12)] bg-[rgba(210,231,211,0.28)] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  {syncingWebAccess ? 'Primeiro acesso' : 'Restaurando conta'}
                </span>
                <h3 className="mt-3 text-[1.65rem] font-black leading-[0.95] tracking-[-0.05em] text-[var(--qc-text)]">
                  {syncingWebAccess
                    ? 'Carregando usuários da web'
                    : 'Restaurando dados do usuário'}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  {syncProgress.label}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <Cloud className="ml-auto h-5 w-5 text-[var(--qc-primary)]" />
                <p className="mt-2 text-[1.7rem] font-black tracking-[-0.05em] text-[var(--qc-primary)]">
                  {syncProgress.percent}%
                </p>
              </div>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--qc-surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--qc-primary)] transition-[width] duration-300"
                style={{ width: `${syncProgress.percent}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-[rgba(210,231,211,0.18)] p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Etapa
                </p>
                <p className="mt-2 text-sm font-bold text-[var(--qc-text)]">
                  {syncProgress.currentStoreLabel || 'preparando'}
                </p>
              </div>

              <div className="rounded-[20px] bg-[rgba(210,231,211,0.18)] p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                  Tempo
                </p>
                <p className="mt-2 text-sm font-bold text-[var(--qc-text)]">
                  {formatDurationLabel(syncProgress.elapsedMs)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-[var(--qc-text-muted)]">
              <span>
                {syncingWebAccess ? 'Usuários lidos' : 'Registros da etapa'}:{' '}
                {syncProgress.storeRowsTotal > 0
                  ? `${syncProgress.storeRowsCompleted}/${syncProgress.storeRowsTotal}`
                  : 'aguardando'}
              </span>
              <span>
                Restante:{' '}
                {syncProgress.estimatedRemainingMs
                  ? formatDurationLabel(syncProgress.estimatedRemainingMs)
                  : 'calculando'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
