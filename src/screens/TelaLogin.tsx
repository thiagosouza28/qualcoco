import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { KeyRound, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCampoApp } from '@/core/AppProvider';
import { getUltimoUsuario, listarColaboradoresAtivos } from '@/core/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WebUsersSyncDialog } from '@/components/WebUsersSyncDialog';

const sanitizeMatriculaInput = (value: string) => value.replace(/\D/g, '');

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
  const [webUsersSyncDialogOpen, setWebUsersSyncDialogOpen] = useState(false);
  const [webUsersSyncError, setWebUsersSyncError] = useState('');
  const attemptedWebAccessSyncRef = useRef(false);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['login', 'colaboradores'],
    queryFn: listarColaboradoresAtivos,
    enabled: bootstrapped,
  });

  const hasUsers = useMemo(() => colaboradores.length > 0, [colaboradores]);

  const triggerWebUsersSync = useCallback(async () => {
    setWebUsersSyncError('');
    setWebUsersSyncDialogOpen(true);
    setSyncingWebAccess(true);

    try {
      const result = await sincronizarAcessosWeb();
      if (result?.erro) {
        setWebUsersSyncError(result.erro);
        return;
      }

      setWebUsersSyncDialogOpen(false);
    } finally {
      setSyncingWebAccess(false);
    }
  }, [sincronizarAcessosWeb]);

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
    void triggerWebUsersSync();
  }, [bootstrapped, hasUsers, online, triggerWebUsersSync]);

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
        fallbackMessage === 'Usu\u00e1rio n\u00e3o encontrado no banco local.'
      ) {
        try {
          attemptedWebAccessSyncRef.current = true;
          await triggerWebUsersSync();
          await login(identifier, pin);
          return;
        } catch (retryError) {
          setError(
            retryError instanceof Error ? retryError.message : fallbackMessage,
          );
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
        <h1 className="hero-title">
          Coleta agr\u00edcola offline, segura e r\u00e1pida.
        </h1>
        <p className="hero-text">
          Login por matr\u00edcula e PIN num\u00e9rico, com opera\u00e7\u00e3o pronta para
          funcionar sem internet.
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
                  ? 'Buscando logins cadastrados na web para liberar o acesso neste aparelho.'
                  : 'Conecte o aparelho uma vez para baixar os logins cadastrados na web.'}
              </p>

              {online ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    attemptedWebAccessSyncRef.current = true;
                    void triggerWebUsersSync();
                  }}
                  disabled={syncingWebAccess || sincronizando}
                >
                  {syncingWebAccess || sincronizando
                    ? 'Buscando logins...'
                    : 'Buscar logins da web'}
                </Button>
              ) : null}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="input-block">
              <label>Matr\u00edcula</label>
              <div className="input-shell">
                <UserRound className="h-4 w-4 text-emerald-700" />
                <Input
                  value={identifier}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="username"
                  placeholder="Ex.: 10392"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
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
                  placeholder="4 ou 6 d\u00edgitos"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="current-password"
                  maxLength={6}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setPin(event.target.value.replace(/\D/g, ''))
                  }
                />
              </div>
            </div>

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

      <WebUsersSyncDialog
        open={webUsersSyncDialogOpen}
        syncing={syncingWebAccess || sincronizando}
        progress={syncProgress}
        errorMessage={webUsersSyncError}
        onRetry={() => {
          void triggerWebUsersSync();
        }}
        onClose={
          syncingWebAccess || sincronizando
            ? undefined
            : () => setWebUsersSyncDialogOpen(false)
        }
      />
    </main>
  );
}
