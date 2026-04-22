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
  refreshAndOpenUpdate: () => Promise<AppUpdateCheckResult>;
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
        setUpdateDialogOpen(true);
        setUpdateMessage(
          preparedUpdate
            ? `O APK da vers\u00e3o ${result.update.latestVersion} j\u00e1 foi baixado. Toque em Atualizar para reabrir o instalador.`
            : startedInstaller
              ? 'A instala\u00e7\u00e3o anterior n\u00e3o foi conclu\u00edda. O app vai preparar novamente o APK correto.'
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

  const installUpdate = useCallback(async (targetUpdate: AvailableAppUpdate) => {
    if (updatingApp) {
      return;
    }

    setUpdatingApp(true);
    setUpdateProgressPercent(0);
    setUpdateMessage(null);

    try {
      const result = await downloadAndInstallAppUpdate({
        url: targetUpdate.url,
        urls: targetUpdate.urls,
        version: targetUpdate.latestVersion,
        fileName: targetUpdate.fileName,
        onProgress: (percent) => {
          setUpdateProgressPercent(percent);
        },
      });

      const preparedUpdate = await hasPreparedAppUpdate(
        targetUpdate.latestVersion,
        targetUpdate.fileName,
      );
      setInstallReadyForAvailableUpdate(preparedUpdate);
      setUpdateMessage(result.message);

      if (result.status === 'installer-opened') {
        markStartedAppUpdateVersion(targetUpdate.latestVersion);
        if (!targetUpdate.required) {
          setUpdateDialogOpen(false);
        }
      } else {
        setUpdateDialogOpen(true);
      }
    } finally {
      setUpdatingApp(false);
      setUpdateProgressPercent(null);
    }
  }, [updatingApp]);

  const openUpdate = useCallback(async () => {
    if (!availableUpdate) {
      return;
    }

    await installUpdate(availableUpdate);
  }, [availableUpdate, installUpdate]);

  const refreshAndOpenUpdate = useCallback(async () => {
    const result = await checkForUpdate();

    if (result.status !== 'available') {
      if (
        availableUpdate &&
        installReadyForAvailableUpdate &&
        (result.status === 'error' || result.status === 'not-configured')
      ) {
        await installUpdate(availableUpdate);
        return {
          status: 'available' as const,
          currentVersion:
            result.currentVersion || currentVersion || availableUpdate.currentVersion,
          update: availableUpdate,
        };
      }

      return result;
    }

    autoStartUpdateKeyRef.current = `${result.update.latestVersion}:${result.update.urls.join('|')}`;
    await installUpdate(result.update);
    return result;
  }, [
    availableUpdate,
    checkForUpdate,
    currentVersion,
    installReadyForAvailableUpdate,
    installUpdate,
  ]);

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
      refreshAndOpenUpdate,
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
      refreshAndOpenUpdate,
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
