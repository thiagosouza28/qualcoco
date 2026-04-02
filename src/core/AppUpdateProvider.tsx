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
  getCurrentAppVersion,
  isAppUpdateConfigured,
  isNativeAndroidApp,
  openAppUpdateUrl,
  type AppUpdateCheckResult,
  type AvailableAppUpdate,
} from '@/core/appUpdate';

type AppUpdateContextShape = {
  nativeAndroid: boolean;
  manifestConfigured: boolean;
  currentVersion: string | null;
  checkingUpdate: boolean;
  availableUpdate: AvailableAppUpdate | null;
  updateDialogOpen: boolean;
  blockingRequiredUpdate: boolean;
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
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableAppUpdate | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const startupCheckDoneRef = useRef(false);

  const hydrateCurrentVersion = useCallback(async () => {
    if (!isNativeAndroidApp) {
      setCurrentVersion(null);
      return null;
    }

    const version = await getCurrentAppVersion();
    if (version) {
      setCurrentVersion(version);
    }

    return version;
  }, []);

  const checkForUpdate = useCallback(async (): Promise<AppUpdateCheckResult> => {
    if (!isNativeAndroidApp) {
      setAvailableUpdate(null);
      setUpdateDialogOpen(false);
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
        setCurrentVersion(result.currentVersion);
      }

      if (result.status === 'available') {
        setAvailableUpdate(result.update);
        setUpdateDialogOpen(true);
      } else if (
        result.status === 'up-to-date' ||
        result.status === 'not-configured' ||
        result.status === 'unsupported'
      ) {
        setAvailableUpdate(null);
        setUpdateDialogOpen(false);
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
    if (!availableUpdate) {
      return;
    }

    await openAppUpdateUrl(availableUpdate.url);

    if (!availableUpdate.required) {
      setUpdateDialogOpen(false);
    }
  }, [availableUpdate]);

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

  const value = useMemo(
    () => ({
      nativeAndroid: isNativeAndroidApp,
      manifestConfigured: isAppUpdateConfigured,
      currentVersion,
      checkingUpdate,
      availableUpdate,
      updateDialogOpen,
      blockingRequiredUpdate: Boolean(
        availableUpdate?.required && updateDialogOpen,
      ),
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
      openUpdate,
      updateDialogOpen,
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
