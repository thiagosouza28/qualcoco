import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCampoApp } from '@/core/AppProvider';
import { getUltimoUsuario, listarColaboradoresAtivos } from '@/core/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WebUsersSyncDialog } from '@/components/WebUsersSyncDialog';
import sococoLogo from '@/assets/sococo-logo.png';

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
    String(params.get('usuario') || getUltimoUsuario() || ''),
  );
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
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
        caught instanceof Error ? caught.message : 'Falha ao entrar.';

      if (
        online &&
        fallbackMessage === 'Usu\u00e1rio n\u00e3o encontrado neste aparelho.'
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
        <div className="login-hero__brand">
          <span className="app-mark app-mark--sm">QC</span>
          <div>
            <span className="hero-badge">QualCoco Campo</span>
            <p>Controle de qualidade de colheita</p>
          </div>
        </div>
        <h1 className="hero-title">
          Acesso rápido para o campo.
        </h1>
        <p className="hero-text">
          Entre com sua matrícula e PIN. Os dados do aparelho continuam
          disponíveis mesmo sem internet.
        </p>
        <div className="login-hero__status">
          <span>{online ? 'Online' : 'Offline'}</span>
          <span>{hasUsers ? 'Acessos prontos' : 'Aguardando acessos'}</span>
        </div>
      </section>

      <div className="login-logo-showcase" aria-label="Sococo">
        <img src={sococoLogo} alt="Sococo" />
      </div>

      <Card className="login-card">
        <CardContent className="space-y-5 p-6">
          {!hasUsers ? (
            <div className="empty-state">
              <p className="text-sm font-semibold text-slate-800">
                Nenhum colaborador cadastrado neste aparelho.
              </p>
              <p className="text-sm text-slate-500">
                {online
                  ? 'Estamos buscando os logins cadastrados na web para liberar o acesso neste aparelho.'
                  : 'Conecte este aparelho à internet pelo menos uma vez para baixar os logins cadastrados na web.'}
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
                    ? 'Buscando logins da web'
                    : 'Buscar logins da web'}
                </Button>
              ) : null}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="input-block">
              <label>Matrícula</label>
              <div className="input-shell">
                <UserRound className="h-4 w-4 text-emerald-700" />
                <Input
                  value={identifier}
                  type="text"
                  autoComplete="username"
                  placeholder="Ex.: 10392 ou João"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setIdentifier(event.target.value)
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
                  type={showPin ? 'text' : 'password'}
                  placeholder="4 ou 6 dígitos"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="current-password"
                  maxLength={6}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setPin(event.target.value.replace(/\D/g, ''))
                  }
                />
                <button
                  type="button"
                  className="input-shell__action"
                  aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  aria-pressed={showPin}
                  onClick={() => setShowPin((current) => !current)}
                >
                  {showPin ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || !hasUsers}
            >
              {loading ? 'Entrando no app' : 'Entrar'}
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
