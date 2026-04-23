import { App as CapacitorApp } from '@capacitor/app';
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
  atualizarSessaoAtiva,
  encerrarSessaoCloud,
  garantirSessaoCloudColaborador,
  getSessaoAtiva,
  logoutSessao,
  sincronizarEquipeDiaSessao,
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
import { prepararNotificacoesNativas, publicarNotificacoesNativasPendentes } from '@/core/nativeNotifications';
import { listarNotificacoesDoUsuario } from '@/core/notifications';
import type { Colaborador, Dispositivo, SessaoCampo, StoreName } from '@/core/types';

const SYNC_QUEUE_CHANGED_EVENT = 'qualcoco:sync-queue-changed';
const AUTO_SYNC_PENDING_DEBOUNCE_MS = 1200;
const AUTO_SYNC_PENDING_INTERVAL_MS = 15_000;
const AUTO_SYNC_REMOTE_REFRESH_MS = 60_000;
const AUTO_SYNC_WEB_ACCESS_REFRESH_MS = 5 * 60_000;
const AUTO_SYNC_BACKGROUND_REFRESH_MS = 90_000;

const criarResultadoSemPendencias = (): SyncExecutionResult => ({
  enviado: 0,
  recebido: 0,
  conflitos: 0,
  erro: '',
  avisos: ['Nenhuma pendencia para sincronizar.'],
  duracaoMs: 0,
});

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
  definirEquipeDoDia: (input: {
    equipeId: string | null;
    equipeNome?: string | null;
  }) => void;
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
  const lastWebAccessSyncAtRef = useRef(0);
  const appActiveRef = useRef(document.visibilityState === 'visible');

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

    let hydratedUser = currentUser || null;

    if (
      currentSession &&
      hydratedUser &&
      !hydratedUser.deletadoEm &&
      !String(hydratedUser.perfil || '').trim() &&
      isCloudConfigured
    ) {
      try {
        await ensureCloudDeviceSession(device);
        await sincronizarAcessosWeb();
        hydratedUser =
          (await getById<Colaborador>(
            'colaboradores',
            currentSession.colaboradorId,
          )) || hydratedUser;
      } catch (error) {
        console.warn(
          '[App] Falha ao recuperar o perfil do usuário na carga inicial.',
          error,
        );
      }
    }

    const nextSession =
      currentSession && hydratedUser
        ? await sincronizarEquipeDiaSessao(hydratedUser, currentSession)
        : currentSession;

    setDispositivo(device);
    setSession(nextSession);
    setUsuarioAtual(hydratedUser);
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

  const refreshRelevantQueries = useCallback(
    async (queryKeys: readonly (readonly unknown[])[]) => {
      await atualizarPendencias().catch(() => undefined);
      await Promise.all(
        queryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
    [atualizarPendencias, queryClient],
  );

  const garantirSessaoCloudDispositivo = useCallback(
    async (deviceSnapshot?: Dispositivo | null) => {
      if (!isCloudConfigured || !onlineRef.current) {
        return null;
      }

      try {
        return await ensureCloudDeviceSession(deviceSnapshot || dispositivo || undefined);
      } catch (error) {
        console.warn('[Cloud] Falha ao preparar sess\u00e3o an\u00f4nima do dispositivo.', error);
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
      options?: {
        refreshMode?: 'full' | 'queries-only';
        queryKeys?: readonly (readonly unknown[])[];
        reuseActiveSync?: boolean;
      },
    ) => {
      if (!isCloudConfigured || !onlineRef.current) {
        atualizarEstadoOnline(onlineRef.current);
        return null;
      }

      while (syncPromiseRef.current) {
        const activeSync = syncPromiseRef.current;
        if (options?.reuseActiveSync !== false) {
          return await activeSync;
        }

        try {
          await activeSync;
        } catch {
          // Sync explícita deve esperar a fila atual esvaziar antes de iniciar outra.
        }
      }

      const runSync = (async () => {
        setSincronizando(true);
        setSyncProgress({
          phase: 'preparing',
          label: 'Preparando sincronização',
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
          if (options?.refreshMode === 'queries-only' && options.queryKeys?.length) {
            await refreshRelevantQueries(options.queryKeys);
          } else {
            await refreshApp();
          }
          syncPromiseRef.current = null;
          setSincronizando(false);
        }
      })();

      syncPromiseRef.current = runSync;
      return await runSync;
    },
    [atualizarEstadoOnline, refreshApp, refreshRelevantQueries],
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

      if (!force && !cloudSessionReady) {
        return null;
      }

      const pendencias = await contarPendenciasSync({ repair: false });
      setPendenciasSync(pendencias);

      if (pendencias <= 0) {
        lastSyncAtRef.current = Date.now();
        return criarResultadoSemPendencias();
      }

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
      }, {
        reuseActiveSync: !force,
      });
    },
    [atualizarEstadoOnline, cloudSessionReady, iniciarSincronizacao],
  );

  const sincronizarAcessosWebAgora = useCallback(async () => {
    return await iniciarSincronizacao(
      async (onProgress) => {
        const result = await sincronizarAcessosWeb({
          onProgress,
        });
        lastSyncAtRef.current = Date.now();
        lastWebAccessSyncAtRef.current = Date.now();
        return result;
      },
      {
        refreshMode: 'full',
      },
    );
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

  const publicarNotificacoesPendentes = useCallback(async () => {
    if (!session?.colaboradorId) {
      return 0;
    }

    const notificacoes = await listarNotificacoesDoUsuario(session.colaboradorId, {
      unreadOnly: true,
      limit: 8,
    });
    return await publicarNotificacoesNativasPendentes(notificacoes, { limit: 4 });
  }, [session?.colaboradorId]);

  const executarAutoSyncCompleto = useCallback(
    async ({
      force = false,
      includeWebAccessSync = true,
    }: {
      force?: boolean;
      includeWebAccessSync?: boolean;
    } = {}) => {
      const conectado = await detectarEstadoRede();
      if (!bootstrapped || !conectado || !isCloudConfigured) {
        return null;
      }

      const pendencias = await contarPendenciasSync({ repair: false });
      setPendenciasSync(pendencias);
      if (pendencias <= 0) {
        lastSyncAtRef.current = Date.now();
        return criarResultadoSemPendencias();
      }

      await garantirSessaoCloudDispositivo(dispositivo);

      const shouldSyncWebAccess =
        includeWebAccessSync &&
        (force ||
          Date.now() - lastWebAccessSyncAtRef.current >= AUTO_SYNC_WEB_ACCESS_REFRESH_MS);

      if (shouldSyncWebAccess) {
        await sincronizarAcessosWebAgora();
      }

      const result = session
        ? await executarSincronizacao({
            force,
            allowPullOnly: true,
          })
        : null;

      await publicarNotificacoesPendentes().catch(() => 0);
      return result;
    },
    [
      bootstrapped,
      detectarEstadoRede,
      dispositivo,
      executarSincronizacao,
      garantirSessaoCloudDispositivo,
      publicarNotificacoesPendentes,
      session,
      sincronizarAcessosWebAgora,
    ],
  );

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
              '[Login] A autentica\u00e7\u00e3o cloud falhou, mas o login local foi mantido.',
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

  const definirEquipeDoDia = useCallback(
    (input: { equipeId: string | null; equipeNome?: string | null }) => {
      const nextSession = atualizarSessaoAtiva({
        equipeDiaId: input.equipeId || null,
        equipeDiaNome: String(input.equipeNome || '').trim(),
      });

      if (nextSession) {
        setSession(nextSession);
      }
    },
    [],
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
    if (!bootstrapped || !session) {
      return;
    }

    void prepararNotificacoesNativas().catch(() => false);
  }, [bootstrapped, session]);

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
      if (!cloudSessionReady && session) return;
      await executarAutoSyncCompleto({
        force: false,
        includeWebAccessSync: true,
      });
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
      const isVisible = document.visibilityState === 'visible';
      appActiveRef.current = isVisible;
      if (isVisible) {
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
      if (connected) {
        void executarAutoSyncCompleto({
          force: true,
          includeWebAccessSync: true,
        });
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
    executarAutoSyncCompleto,
    garantirSessaoCloudDispositivo,
    session,
    dispositivo,
  ]);

  useEffect(() => {
    if (bootstrapped && online && session && cloudSessionReady && pendenciasSync > 0) {
      agendarAutoSync(1800);
    }
  }, [agendarAutoSync, bootstrapped, cloudSessionReady, online, pendenciasSync, session]);

  useEffect(() => {
    if (!bootstrapped || !online || !isCloudConfigured) {
      return;
    }

    const timer = window.setInterval(() => {
      void executarAutoSyncCompleto({
        force: false,
        includeWebAccessSync: true,
      });
    }, appActiveRef.current ? AUTO_SYNC_REMOTE_REFRESH_MS : AUTO_SYNC_BACKGROUND_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [bootstrapped, executarAutoSyncCompleto, online]);

  useEffect(() => {
    if (!CapacitorApp) {
      return;
    }

    let disposed = false;
    let removeAppStateListener: (() => void) | null = null;
    let removeResumeListener: (() => void) | null = null;
    let removePauseListener: (() => void) | null = null;

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      appActiveRef.current = isActive;
      if (isActive) {
        void executarAutoSyncCompleto({
          force: true,
          includeWebAccessSync: true,
        });
      }
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
        return;
      }

      removeAppStateListener = () => {
        void listener.remove();
      };
    });

    void CapacitorApp.addListener('resume', () => {
      appActiveRef.current = true;
      void executarAutoSyncCompleto({
        force: true,
        includeWebAccessSync: true,
      });
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
        return;
      }

      removeResumeListener = () => {
        void listener.remove();
      };
    });

    void CapacitorApp.addListener('pause', () => {
      appActiveRef.current = false;
      void publicarNotificacoesPendentes().catch(() => 0);
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
        return;
      }

      removePauseListener = () => {
        void listener.remove();
      };
    });

    return () => {
      disposed = true;
      removeAppStateListener?.();
      removeResumeListener?.();
      removePauseListener?.();
    };
  }, [executarAutoSyncCompleto, publicarNotificacoesPendentes]);

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
      definirEquipeDoDia,
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
      definirEquipeDoDia,
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
