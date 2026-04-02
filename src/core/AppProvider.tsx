import { useQueryClient } from '@tanstack/react-query';
import { Network } from '@capacitor/network';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  autenticarColaborador,
  encerrarSessaoCloud,
  garantirSessaoCloudColaborador,
  getSessaoAtiva,
  logoutSessao,
  touchSessao,
} from '@/core/auth';
import { getById, initLocalDb } from '@/core/localDb';
import { getOrCreateDevice } from '@/core/device';
import {
  contarPendenciasSync,
  sincronizarAcessosWeb,
  sincronizarNuvem,
  type SyncProgressSnapshot,
  type SyncExecutionResult,
} from '@/core/sync';
import {
  ensureCloudDeviceSession,
  getCloudSessionSafe,
  isCloudConfigured,
  onCloudAuthStateChange,
} from '@/core/firebaseCloud';
import type { Colaborador, Dispositivo, SessaoCampo, StoreName } from '@/core/types';

const SYNC_QUEUE_CHANGED_EVENT = 'qualcoco:sync-queue-changed';
const AUTO_SYNC_PENDING_DEBOUNCE_MS = 1200;
const AUTO_SYNC_PENDING_INTERVAL_MS = 15_000;
const AUTO_SYNC_REMOTE_REFRESH_MS = 60_000;

type AppContextShape = {
  bootstrapped: boolean;
  session: SessaoCampo | null;
  usuarioAtual: Colaborador | null;
  dispositivo: Dispositivo | null;
  online: boolean;
  cloudSessionReady: boolean;
  pendenciasSync: number;
  sincronizando: boolean;
  syncProgress: SyncProgressSnapshot | null;
  login: (identifier: string, pin: string) => Promise<void>;
  logout: () => void;
  refreshApp: () => Promise<void>;
  sincronizarAgora: () => Promise<SyncExecutionResult | null>;
  sincronizarAcessosWeb: () => Promise<SyncExecutionResult | null>;
  sincronizarPullRemoto: (stores?: StoreName[]) => Promise<SyncExecutionResult | null>;
};

const AppContext = createContext<AppContextShape | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [session, setSession] = useState<SessaoCampo | null>(null);
  const [usuarioAtual, setUsuarioAtual] = useState<Colaborador | null>(null);
  const [dispositivo, setDispositivo] = useState<Dispositivo | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [cloudSessionReady, setCloudSessionReady] = useState(false);
  const [pendenciasSync, setPendenciasSync] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressSnapshot | null>(null);
  const onlineRef = useRef(navigator.onLine);
  const syncPromiseRef = useRef<Promise<SyncExecutionResult | null> | null>(null);
  const autoSyncTimerRef = useRef<number | null>(null);
  const lastSyncAtRef = useRef(0);

  const hydrate = useCallback(async () => {
    await initLocalDb();

    const currentSession = getSessaoAtiva();
    const devicePromise = getOrCreateDevice();
    const currentUserPromise = currentSession
      ? getById<Colaborador>('colaboradores', currentSession.colaboradorId)
      : Promise.resolve(null);
    const pendenciasPromise = contarPendenciasSync({ repair: false })
      .then((total) => setPendenciasSync(total))
      .catch(() => setPendenciasSync(0));
    const currentCloudSessionPromise = isCloudConfigured
      ? getCloudSessionSafe('any').catch(() => null)
      : Promise.resolve(null);

    const [device, currentUser, currentCloudSession] = await Promise.all([
      devicePromise,
      currentUserPromise,
      currentCloudSessionPromise,
    ]);

    setDispositivo(device);
    setSession(currentSession);
    setUsuarioAtual(currentUser || null);
    setCloudSessionReady(Boolean(currentCloudSession));
    setBootstrapped(true);

    void pendenciasPromise;
  }, []);

  const refreshApp = useCallback(async () => {
    await hydrate();
    await queryClient.invalidateQueries();
  }, [hydrate, queryClient]);

  const atualizarEstadoOnline = useCallback((nextOnline: boolean) => {
    onlineRef.current = nextOnline;
    setOnline(nextOnline);
  }, []);

  const detectarEstadoRede = useCallback(async () => {
    try {
      const status = await Network.getStatus();
      atualizarEstadoOnline(status.connected);
      return status.connected;
    } catch {
      const fallbackOnline = navigator.onLine;
      atualizarEstadoOnline(fallbackOnline);
      return fallbackOnline;
    }
  }, [atualizarEstadoOnline]);

  const atualizarPendencias = useCallback(async () => {
    setPendenciasSync(await contarPendenciasSync({ repair: false }));
  }, []);

  const garantirSessaoCloudDispositivo = useCallback(
    async (deviceSnapshot?: Dispositivo | null) => {
      if (!isCloudConfigured || !onlineRef.current) {
        return null;
      }

      try {
        return await ensureCloudDeviceSession(deviceSnapshot || dispositivo || undefined);
      } catch (error) {
        console.warn('[Cloud] Falha ao preparar sessão anônima do dispositivo.', error);
        return null;
      }
    },
    [dispositivo],
  );

  const iniciarSincronizacao = useCallback(
    async (
      runner: (
        onProgress: (progress: SyncProgressSnapshot) => void,
      ) => Promise<SyncExecutionResult | null>,
    ) => {
      if (!isCloudConfigured || !onlineRef.current) {
        atualizarEstadoOnline(onlineRef.current);
        return null;
      }

      if (syncPromiseRef.current) {
        return await syncPromiseRef.current;
      }

      const runSync = (async () => {
        setSincronizando(true);
        setSyncProgress({
          phase: 'preparing',
          label: 'Preparando sincronização...',
          percent: 0,
          currentStore: null,
          currentStoreLabel: '',
          currentPage: 0,
          pushCompleted: 0,
          pushTotal: 0,
          pullCompleted: 0,
          pullTotal: 0,
          storeRowsCompleted: 0,
          storeRowsTotal: 0,
          elapsedMs: 0,
          estimatedRemainingMs: null,
        });

        try {
          return await runner(setSyncProgress);
        } finally {
          await refreshApp();
          syncPromiseRef.current = null;
          setSincronizando(false);
        }
      })();

      syncPromiseRef.current = runSync;
      return await runSync;
    },
    [atualizarEstadoOnline, refreshApp],
  );

  const executarSincronizacao = useCallback(
    async ({
      force = false,
      allowPullOnly = true,
      stores,
    }: {
      force?: boolean;
      allowPullOnly?: boolean;
      stores?: StoreName[];
    } = {}) => {
      if (!isCloudConfigured || !onlineRef.current) {
        atualizarEstadoOnline(onlineRef.current);
        return null;
      }

      if (syncPromiseRef.current) {
        return await syncPromiseRef.current;
      }

      if (!force && !cloudSessionReady) {
        return null;
      }

      const pendencias = await contarPendenciasSync({ repair: false });
      setPendenciasSync(pendencias);

      if (!force && Date.now() - lastSyncAtRef.current < AUTO_SYNC_PENDING_INTERVAL_MS) {
        return null;
      }

      return await iniciarSincronizacao(async (onProgress) => {
        const result = await sincronizarNuvem({
          onProgress,
          mode: allowPullOnly && pendencias === 0 ? 'pull_only' : 'full',
          stores,
        });
        lastSyncAtRef.current = Date.now();
        return result;
      });
    },
    [atualizarEstadoOnline, cloudSessionReady, iniciarSincronizacao],
  );

  const sincronizarAcessosWebAgora = useCallback(async () => {
    return await iniciarSincronizacao(async (onProgress) => {
      const result = await sincronizarAcessosWeb({
        onProgress,
      });
      lastSyncAtRef.current = Date.now();
      return result;
    });
  }, [iniciarSincronizacao]);

  const agendarAutoSync = useCallback(
    (delay = AUTO_SYNC_PENDING_DEBOUNCE_MS) => {
      if (
        !bootstrapped ||
        !session ||
        !cloudSessionReady ||
        !isCloudConfigured ||
        !onlineRef.current
      ) {
        return;
      }

      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
      }

      autoSyncTimerRef.current = window.setTimeout(() => {
        autoSyncTimerRef.current = null;
        void executarSincronizacao({ force: false, allowPullOnly: true });
      }, delay);
    },
    [bootstrapped, cloudSessionReady, executarSincronizacao, session],
  );

  const sincronizarAgora = useCallback(async () => {
    return await executarSincronizacao({ force: true, allowPullOnly: true });
  }, [executarSincronizacao]);

  const sincronizarPullRemoto = useCallback(
    async (stores?: StoreName[]) => {
      if (!cloudSessionReady) {
        return null;
      }

      return await executarSincronizacao({
        force: true,
        allowPullOnly: true,
        stores,
      });
    },
    [cloudSessionReady, executarSincronizacao],
  );

  const login = useCallback(
    async (identifier: string, pin: string) => {
      const result = await autenticarColaborador(identifier, pin);
      let currentUser = result.colaborador;
      const persistedCloudSession = isCloudConfigured
        ? await getCloudSessionSafe('any')
        : null;

      setCloudSessionReady(Boolean(persistedCloudSession));
      setSession(result.session);
      setUsuarioAtual(currentUser);
      void atualizarPendencias();

      if (!dispositivo) {
        void getOrCreateDevice().then((device) => setDispositivo(device));
      }

      if (isCloudConfigured && onlineRef.current) {
        void (async () => {
          try {
            await garantirSessaoCloudColaborador(currentUser, pin);
            setCloudSessionReady(true);
            await executarSincronizacao({ force: true, allowPullOnly: true });
            const refreshedUser = await getById<Colaborador>(
              'colaboradores',
              result.colaborador.id,
            );
            if (refreshedUser && !refreshedUser.deletadoEm) {
              setUsuarioAtual(refreshedUser);
            }
            await atualizarPendencias();
          } catch (error) {
            console.warn(
              '[Login] A autenticação cloud falhou, mas o login local foi mantido.',
              error,
            );
            const fallbackSession = await garantirSessaoCloudDispositivo(
              dispositivo || (await getOrCreateDevice()),
            );
            setCloudSessionReady(Boolean(fallbackSession));
          }
        })();
      }
    },
    [atualizarPendencias, dispositivo, executarSincronizacao, garantirSessaoCloudDispositivo],
  );

  const logout = useCallback(() => {
    logoutSessao();
    void encerrarSessaoCloud();
    void garantirSessaoCloudDispositivo(dispositivo);
    setCloudSessionReady(false);
    setSession(null);
    setUsuarioAtual(null);
  }, [dispositivo, garantirSessaoCloudDispositivo]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void detectarEstadoRede();
  }, [detectarEstadoRede]);

  useEffect(() => {
    if (!bootstrapped || !online || !isCloudConfigured) {
      return;
    }

    void garantirSessaoCloudDispositivo(dispositivo);
  }, [bootstrapped, dispositivo, garantirSessaoCloudDispositivo, online]);

  useEffect(() => {
    if (!isCloudConfigured) {
      setCloudSessionReady(false);
      return;
    }

    const subscription = onCloudAuthStateChange((nextSession) => {
      setCloudSessionReady(Boolean(nextSession));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncIfPossible = async () => {
      if (!session || !cloudSessionReady) return;
      const conectado = await detectarEstadoRede();
      if (conectado) {
        await executarSincronizacao({ force: false, allowPullOnly: true });
      }
    };

    const markActivity = () => {
      const nextSession = touchSessao();
      if (!nextSession && session) {
        setSession(null);
        setUsuarioAtual(null);
      }
    };

    const handleOnline = () => {
      void syncIfPossible();
    };
    const handleOffline = () => atualizarEstadoOnline(false);
    const handleQueueChanged = () => {
      void atualizarPendencias();
      agendarAutoSync();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (cloudSessionReady) {
          void syncIfPossible();
        }
        markActivity();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, handleQueueChanged);
    window.addEventListener('pointerdown', markActivity);
    window.addEventListener('keydown', markActivity);
    document.addEventListener('visibilitychange', handleVisibility);

    let disposed = false;
    let removeNetworkListener: (() => void) | null = null;

    void Network.addListener('networkStatusChange', ({ connected }) => {
      atualizarEstadoOnline(connected);
      if (connected) {
        void garantirSessaoCloudDispositivo(dispositivo);
      }
      if (connected && session && cloudSessionReady) {
        void executarSincronizacao({ force: false, allowPullOnly: true });
      }
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
        return;
      }
      removeNetworkListener = () => {
        void listener.remove();
      };
    });

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, handleQueueChanged);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      disposed = true;
      removeNetworkListener?.();
    };
  }, [
    agendarAutoSync,
    atualizarEstadoOnline,
    atualizarPendencias,
    cloudSessionReady,
    detectarEstadoRede,
    executarSincronizacao,
    garantirSessaoCloudDispositivo,
    session,
    dispositivo,
  ]);

  useEffect(() => {
    if (bootstrapped && online && session && cloudSessionReady) {
      agendarAutoSync(pendenciasSync > 0 ? 1800 : 2500);
    }
  }, [agendarAutoSync, bootstrapped, cloudSessionReady, online, pendenciasSync, session]);

  useEffect(() => {
    if (!bootstrapped || !online || !session || !cloudSessionReady || !isCloudConfigured) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void executarSincronizacao({ force: false, allowPullOnly: true });
    }, AUTO_SYNC_REMOTE_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [bootstrapped, cloudSessionReady, executarSincronizacao, online, session]);

  const value = useMemo(
    () => ({
      bootstrapped,
      session,
      usuarioAtual,
      dispositivo,
      online,
      cloudSessionReady,
      pendenciasSync,
      sincronizando,
      syncProgress,
      login,
      logout,
      refreshApp,
      sincronizarAgora,
      sincronizarAcessosWeb: sincronizarAcessosWebAgora,
      sincronizarPullRemoto,
    }),
    [
      bootstrapped,
      cloudSessionReady,
      dispositivo,
      login,
      logout,
      online,
      pendenciasSync,
      refreshApp,
      session,
      sincronizando,
      syncProgress,
      sincronizarAgora,
      sincronizarAcessosWebAgora,
      sincronizarPullRemoto,
      usuarioAtual,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useCampoApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useCampoApp deve ser usado dentro de AppProvider.');
  }
  return context;
};
