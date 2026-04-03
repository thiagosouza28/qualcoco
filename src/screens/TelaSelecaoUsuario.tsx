import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listarColaboradoresAtivos } from '@/core/auth';
import { useCampoApp } from '@/core/AppProvider';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WebUsersSyncDialog } from '@/components/WebUsersSyncDialog';

export function TelaSelecaoUsuario() {
  const navigate = useNavigate();
  const {
    bootstrapped,
    online,
    sincronizarAcessosWeb,
    sincronizando,
    syncProgress,
  } = useCampoApp();
  const [syncingWebAccess, setSyncingWebAccess] = useState(false);
  const [webUsersSyncDialogOpen, setWebUsersSyncDialogOpen] = useState(false);
  const [webUsersSyncError, setWebUsersSyncError] = useState('');
  const attemptedWebAccessSyncRef = useRef(false);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['usuarios', 'ativos'],
    queryFn: listarColaboradoresAtivos,
    enabled: bootstrapped,
  });

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
    if (!online) {
      attemptedWebAccessSyncRef.current = false;
    }
  }, [online]);

  useEffect(() => {
    if (!bootstrapped || !online || colaboradores.length > 0 || attemptedWebAccessSyncRef.current) {
      return;
    }

    attemptedWebAccessSyncRef.current = true;
    void triggerWebUsersSync();
  }, [bootstrapped, colaboradores.length, online, triggerWebUsersSync]);

  return (
    <LayoutMobile
      title="Trocar colaborador"
      subtitle="Troca rápida em campo"
      onBack={() => navigate('/login')}
    >
      <div className="stack-lg">
        {colaboradores.length === 0 ? (
          <Card className="surface-card">
            <CardContent className="space-y-3 p-4">
              <p className="font-semibold text-slate-900">
                Nenhum colaborador cadastrado.
              </p>
              <p className="text-sm text-slate-500">
                {syncingWebAccess || sincronizando
                  ? 'Buscando usuários cadastrados na web para liberar o login neste aparelho.'
                  : online
                    ? 'Este aparelho ainda não carregou os usuários cadastrados na web.'
                    : 'Conecte este aparelho à internet para baixar os usuários cadastrados na web.'}
              </p>

              {online ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    attemptedWebAccessSyncRef.current = true;
                    void triggerWebUsersSync();
                  }}
                  disabled={syncingWebAccess || sincronizando}
                >
                  {syncingWebAccess || sincronizando
                    ? 'Buscando usuários'
                    : 'Buscar usuários da web'}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {colaboradores.map((colaborador) => (
          <Card key={colaborador.id} className="surface-card">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-slate-900">{colaborador.nome}</p>
                <p className="text-sm text-slate-500">
                  {colaborador.primeiroNome} {'\u2022'} {colaborador.matricula}
                </p>
              </div>
              <Button asChild>
                <Link to={`/login?usuario=${encodeURIComponent(colaborador.matricula)}`}>
                  Usar
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" size="lg" asChild className="w-full">
          <Link to="/colaboradores/cadastro">Cadastrar novo colaborador</Link>
        </Button>
      </div>

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
    </LayoutMobile>
  );
}
