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
  checkForAppUpdate,
  clearStartedAppUpdateVersion,
  downloadAndInstallAppUpdate,
  getCurrentAppVersion,
  hasPreparedAppUpdate,
  hasStartedAppUpdateForVersion,
  isAppUpdateConfigured,
  isNativeAndroidApp,
  markStartedAppUpdateVersion,
  type AppUpdateCheckResult,
  type AvailableAppUpdate,
} from '@/core/appUpdate';

type AppUpdateContextShape = {
  nativeAndroid: boolean;
  manifestConfigured: boolean;
  currentVersion: string | null;
  checkingUpdate: boolean;
  updatingApp: boolean;
  updateProgressPercent: number | null;
  updateMessage: string | null;
  availableUpdate: AvailableAppUpdate | null;
  updateDialogOpen: boolean;
  blockingRequiredUpdate: boolean;
  installReadyForAvailableUpdate: boolean;
  checkForUpdate: () => Promise<AppUpdateCheckResult>;
  dismissUpdate: () => void;
  openUpdate: () => Promise<void>;
};

const AppUpdateContext = createContext<AppUpdateContextShape | null>(null);

export function AppUpdateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [updateProgressPercent, setUpdateProgressPercent] = useState<number | null>(
    null,
  );
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableAppUpdate | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [installReadyForAvailableUpdate, setInstallReadyForAvailableUpdate] =
    useState(false);
  const startupCheckDoneRef = useRef(false);
  const autoStartUpdateKeyRef = useRef<string | null>(null);

  const hydrateCurrentVersion = useCallback(async () => {
    if (!isNativeAndroidApp) {
      setCurrentVersion(null);
      return null;
    }

    const version = await getCurrentAppVersion();
    if (version) {
      clearStartedAppUpdateVersion(version);
      setCurrentVersion(version);
    }

    return version;
  }, []);

  const checkForUpdate = useCallback(async (): Promise<AppUpdateCheckResult> => {
    if (!isNativeAndroidApp) {
      setAvailableUpdate(null);
      setInstallReadyForAvailableUpdate(false);
      setUpdateDialogOpen(false);
      setUpdateMessage(null);
      return {
        status: 'unsupported',
        currentVersion: null,
        update: null,
      };
    }

    setCheckingUpdate(true);

    try {
      const version = currentVersion || (await hydrateCurrentVersion());
      const result = await checkForAppUpdate(version);

      if (result.currentVersion && result.currentVersion !== currentVersion) {
        clearStartedAppUpdateVersion(result.currentVersion);
        setCurrentVersion(result.currentVersion);
      }

      if (result.status === 'available') {
        const preparedUpdate = await hasPreparedAppUpdate(
          result.update.latestVersion,
          result.update.fileName,
        );
        const startedInstaller = hasStartedAppUpdateForVersion(
          result.update.latestVersion,
        );

        setAvailableUpdate(result.update);
        setInstallReadyForAvailableUpdate(preparedUpdate);
        setUpdateDialogOpen(result.update.required || !startedInstaller);
        setUpdateMessage(
          preparedUpdate
            ? 'O APK j\u00e1 foi baixado. Toque em Atualizar para reabrir o instalador.'
            : null,
        );
      } else if (
        result.status === 'up-to-date' ||
        result.status === 'not-configured' ||
        result.status === 'unsupported'
      ) {
        setAvailableUpdate(null);
        setInstallReadyForAvailableUpdate(false);
        setUpdateDialogOpen(false);
        setUpdateMessage(null);
      }

      return result;
    } finally {
      setCheckingUpdate(false);
    }
  }, [currentVersion, hydrateCurrentVersion]);

  const dismissUpdate = useCallback(() => {
    if (availableUpdate?.required) {
      return;
    }

    setUpdateDialogOpen(false);
  }, [availableUpdate]);

  const openUpdate = useCallback(async () => {
    if (!availableUpdate || updatingApp) {
      return;
    }

    setUpdatingApp(true);
    setUpdateProgressPercent(0);
    setUpdateMessage(null);

    try {
      const result = await downloadAndInstallAppUpdate({
        urls: availableUpdate.urls,
        version: availableUpdate.latestVersion,
        fileName: availableUpdate.fileName,
        onProgress: (percent) => {
          setUpdateProgressPercent(percent);
        },
      });

      const preparedUpdate = await hasPreparedAppUpdate(
        availableUpdate.latestVersion,
        availableUpdate.fileName,
      );
      setInstallReadyForAvailableUpdate(preparedUpdate);
      setUpdateMessage(result.message);

      if (result.status === 'installer-opened') {
        markStartedAppUpdateVersion(availableUpdate.latestVersion);
        if (!availableUpdate.required) {
          setUpdateDialogOpen(false);
        }
      } else {
        setUpdateDialogOpen(true);
      }
    } finally {
      setUpdatingApp(false);
      setUpdateProgressPercent(null);
    }
  }, [availableUpdate, updatingApp]);

  useEffect(() => {
    void hydrateCurrentVersion();
  }, [hydrateCurrentVersion]);

  useEffect(() => {
    if (!isNativeAndroidApp || !isAppUpdateConfigured || startupCheckDoneRef.current) {
      return;
    }

    startupCheckDoneRef.current = true;
    void checkForUpdate();
  }, [checkForUpdate]);

  useEffect(() => {
    if (!availableUpdate) {
      autoStartUpdateKeyRef.current = null;
      return;
    }

    if (!updateDialogOpen || updatingApp || installReadyForAvailableUpdate) {
      return;
    }

    const autoStartKey = `${availableUpdate.latestVersion}:${availableUpdate.urls.join('|')}`;
    if (autoStartUpdateKeyRef.current === autoStartKey) {
      return;
    }

    autoStartUpdateKeyRef.current = autoStartKey;
    void openUpdate();
  }, [
    availableUpdate,
    installReadyForAvailableUpdate,
    openUpdate,
    updateDialogOpen,
    updatingApp,
  ]);

  const value = useMemo(
    () => ({
      nativeAndroid: isNativeAndroidApp,
      manifestConfigured: isAppUpdateConfigured,
      currentVersion,
      checkingUpdate,
      updatingApp,
      updateProgressPercent,
      updateMessage,
      availableUpdate,
      updateDialogOpen,
      blockingRequiredUpdate: Boolean(
        availableUpdate?.required && updateDialogOpen,
      ),
      installReadyForAvailableUpdate,
      checkForUpdate,
      dismissUpdate,
      openUpdate,
    }),
    [
      availableUpdate,
      checkForUpdate,
      checkingUpdate,
      currentVersion,
      dismissUpdate,
      installReadyForAvailableUpdate,
      openUpdate,
      updateMessage,
      updateProgressPercent,
      updateDialogOpen,
      updatingApp,
    ],
  );

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export const useAppUpdate = () => {
  const context = useContext(AppUpdateContext);
  if (!context) {
    throw new Error('useAppUpdate deve ser usado dentro de AppUpdateProvider.');
  }
  return context;
};
