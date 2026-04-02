import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AppUpdateDialog } from '@/components/AppUpdateDialog';
import { AppProvider, useCampoApp } from '@/core/AppProvider';
import { AppUpdateProvider, useAppUpdate } from '@/core/AppUpdateProvider';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { TelaLogin } from '@/screens/TelaLogin';
import type { StoreName } from '@/core/types';

const TelaSelecaoUsuario = lazy(async () => ({
  default: (await import('@/screens/TelaSelecaoUsuario')).TelaSelecaoUsuario,
}));
const TelaDashboard = lazy(async () => ({
  default: (await import('@/screens/TelaDashboard')).TelaDashboard,
}));
const TelaNovaAvaliacao = lazy(async () => ({
  default: (await import('@/screens/TelaNovaAvaliacao')).TelaNovaAvaliacao,
}));
const TelaHistorico = lazy(async () => ({
  default: (await import('@/screens/TelaHistorico')).TelaHistorico,
}));
const TelaDetalheAvaliacao = lazy(async () => ({
  default: (await import('@/screens/TelaDetalheAvaliacao')).TelaDetalheAvaliacao,
}));
const TelaSincronizacao = lazy(async () => ({
  default: (await import('@/screens/TelaSincronizacao')).TelaSincronizacao,
}));
const TelaRegistroLinhas = lazy(async () => ({
  default: (await import('@/screens/TelaRegistroLinhas')).TelaRegistroLinhas,
}));
const TelaRelatorio = lazy(async () => ({
  default: (await import('@/screens/TelaRelatorio')).TelaRelatorio,
}));
const TelaConfiguracoes = lazy(async () => ({
  default: (await import('@/screens/TelaConfiguracoes')).TelaConfiguracoes,
}));
const CadastroColaborador = lazy(async () => ({
  default: (await import('@/screens/CadastroColaborador')).CadastroColaborador,
}));
const TelaColaboradores = lazy(async () => ({
  default: (await import('@/screens/TelaColaboradores')).TelaColaboradores,
}));
const TelaEquipes = lazy(async () => ({
  default: (await import('@/screens/TelaEquipes')).TelaEquipes,
}));

const publicPaths = new Set([
  '/login',
  '/usuarios',
  '/colaboradores/cadastro',
]);

const ROUTE_PULL_STALE_MS = 45_000;

type RealtimeRouteConfig = {
  pullStores: StoreName[];
};

const uniqueStores = (stores: StoreName[]) => Array.from(new Set(stores));
const ONLINE_SHARED_PULL_STORES = uniqueStores([
  'configuracoes',
  'equipes',
  'colaboradores',
  'parcelas',
  'avaliacoes',
  'avaliacaoColaboradores',
  'avaliacaoParcelas',
  'avaliacaoRuas',
  'registrosColeta',
]);

const createRealtimeRouteConfig = (pathname: string): RealtimeRouteConfig | null => {
  if (publicPaths.has(pathname)) {
    return null;
  }

  return {
    pullStores: ONLINE_SHARED_PULL_STORES,
  };
};

function RouteCloudSync() {
  const location = useLocation();
  const {
    bootstrapped,
    session,
    online,
    cloudSessionReady,
    sincronizarPullRemoto,
  } = useCampoApp();
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const lastRoutePullAtRef = useRef<Record<string, number>>({});

  const config = useMemo(
    () => createRealtimeRouteConfig(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    const handleVisibility = () => {
      setVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (
      !visible ||
      !bootstrapped ||
      !session ||
      !cloudSessionReady ||
      !online ||
      !config ||
      config.pullStores.length === 0
    ) {
      return;
    }

    const routeKey = `${session.colaboradorId}:${location.pathname}`;
    const lastPulledAt = lastRoutePullAtRef.current[routeKey] || 0;
    if (Date.now() - lastPulledAt < ROUTE_PULL_STALE_MS) {
      return;
    }

    lastRoutePullAtRef.current[routeKey] = Date.now();
    void sincronizarPullRemoto(uniqueStores(config.pullStores)).catch(() => {
      lastRoutePullAtRef.current[routeKey] = 0;
    });
  }, [
    bootstrapped,
    config,
    cloudSessionReady,
    location.pathname,
    online,
    session,
    sincronizarPullRemoto,
    visible,
  ]);

  return null;
}

function ShellRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { bootstrapped, session } = useCampoApp();
  const { blockingRequiredUpdate } = useAppUpdate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let disposed = false;
    let removeListener: (() => void) | null = null;

    void CapacitorApp.addListener('backButton', () => {
      if (blockingRequiredUpdate) {
        return;
      }

      const historyIndex =
        typeof window.history.state?.idx === 'number'
          ? window.history.state.idx
          : 0;

      if (historyIndex > 0) {
        navigate(-1);
        return;
      }

      if (session && location.pathname !== '/dashboard') {
        navigate('/dashboard', { replace: true });
        return;
      }

      if (!session && location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
        return;
      }

      removeListener = () => {
        void listener.remove();
      };
    });

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [blockingRequiredUpdate, location.pathname, navigate, session]);

  if (!bootstrapped) {
    return (
      <div className="boot-screen">
        <div className="boot-screen__card">
          <span className="hero-badge">QualCoco Campo</span>
          <p>Preparando operação offline...</p>
        </div>
      </div>
    );
  }

  const isPublic = publicPaths.has(location.pathname);
  if (!session && !isPublic) {
    return <Navigate to="/login" replace />;
  }

  if (session && location.pathname === '/login') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="app-container">
      <RouteCloudSync />
      <SyncStatusBar />
      <Suspense
        fallback={
          <div className="route-loader">
            <div className="route-loader__card">
              <span className="hero-badge">Carregando</span>
              <p>Abrindo módulo de campo...</p>
            </div>
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={<Navigate to={session ? '/dashboard' : '/login'} replace />}
          />
          <Route path="/login" element={<TelaLogin />} />
          <Route path="/usuarios" element={<TelaSelecaoUsuario />} />
          <Route path="/dashboard" element={<TelaDashboard />} />
          <Route path="/avaliacoes/nova" element={<TelaNovaAvaliacao />} />
          <Route path="/avaliacoes/:id/editar" element={<TelaNovaAvaliacao />} />
          <Route path="/avaliacoes/:id" element={<TelaRegistroLinhas />} />
          <Route path="/detalhe/:id" element={<TelaDetalheAvaliacao />} />
          <Route path="/historico" element={<TelaHistorico />} />
          <Route path="/relatorios" element={<TelaRelatorio />} />
          <Route path="/sincronizacao" element={<TelaSincronizacao />} />
          <Route path="/configuracoes" element={<TelaConfiguracoes />} />
          <Route path="/colaboradores" element={<TelaColaboradores />} />
          <Route path="/equipes" element={<TelaEquipes />} />
          <Route path="/colaboradores/cadastro" element={<CadastroColaborador />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppUpdateProvider>
        <ShellRoutes />
        <AppUpdateDialog />
      </AppUpdateProvider>
    </AppProvider>
  );
}

export default App;
