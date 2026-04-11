import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  FileTransfer,
  type FileTransferError,
  type ProgressStatus,
} from '@capacitor/file-transfer';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { AppInstaller } from '@/plugins/appInstaller';

const APP_UPDATE_MANIFEST_URL = String(
  import.meta.env.VITE_APP_UPDATE_MANIFEST_URL || '',
).trim();

export type RemoteAppUpdateManifest = {
  version: string;
  required: boolean;
  url: string;
  urls: string[];
  fileName: string;
};

export type AvailableAppUpdate = {
  currentVersion: string;
  latestVersion: string;
  required: boolean;
  url: string;
  urls: string[];
  fileName: string;
};

const APP_UPDATE_INSTALLER_VERSION_KEY = 'appUpdate:installerVersion';

type DownloadAndInstallAppUpdateOptions = {
  url?: string;
  urls?: string[];
  version: string;
  fileName?: string;
  onProgress?: (percent: number) => void;
};

export type AppUpdateInstallResult =
  | {
      status: 'installer-opened';
      usedUrl: string | null;
      message: string;
    }
  | {
      status: 'needs-permission';
      usedUrl: string | null;
      message: string;
    }
  | {
      status: 'error';
      usedUrl: string | null;
      message: string;
    };

export type AppUpdateCheckResult =
  | {
      status: 'unsupported';
      currentVersion: null;
      update: null;
    }
  | {
      status: 'not-configured' | 'error';
      currentVersion: string | null;
      update: null;
    }
  | {
      status: 'up-to-date';
      currentVersion: string;
      update: null;
    }
  | {
      status: 'available';
      currentVersion: string;
      update: AvailableAppUpdate;
    };

export const isNativeAndroidApp =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const isAppUpdateConfigured = Boolean(APP_UPDATE_MANIFEST_URL);

const APP_UPDATE_DOWNLOAD_DIR = 'updates';

const parseVersionPart = (value: string) => {
  const match = value.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
};

const parseVersionTokens = (value: string) =>
  value
    .trim()
    .replace(/^[^\d]*/, '')
    .split('.')
    .map((part) => parseVersionPart(part));

const isTruthyFlag = (value: unknown) =>
  value === true ||
  value === 1 ||
  value === '1' ||
  String(value || '')
    .trim()
    .toLowerCase() === 'true';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const resolveUrl = (value: string) => new URL(value, window.location.origin);

const getStoredValue = (key: string) => {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const setStoredValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep storage failures silent.
  }
};

const removeStoredValue = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Keep storage failures silent.
  }
};

const appendNoCacheParam = (value: string) => {
  try {
    const parsed = resolveUrl(value);
    parsed.searchParams.set('_ts', String(Date.now()));
    return parsed.toString();
  } catch {
    return value;
  }
};

const toTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const getDefaultApkFileName = (version: string) =>
  `appqualcoco${sanitizeVersionForFileName(version)}.apk`;

const sanitizeVersionForFileName = (value: string) => {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return sanitized || 'latest';
};

const sanitizeFileName = (value: string) => {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (!sanitized) {
    return '';
  }

  return sanitized.toLowerCase().endsWith('.apk') ? sanitized : `${sanitized}.apk`;
};

const normalizeManifestFileName = (version: string, fileName?: string) =>
  sanitizeFileName(fileName || '') || getDefaultApkFileName(version);

const getUpdateApkPath = (version: string, fileName?: string) =>
  `${APP_UPDATE_DOWNLOAD_DIR}/${normalizeManifestFileName(version, fileName)}`;

const ensureUpdateDownloadDir = async () => {
  try {
    await Filesystem.mkdir({
      path: APP_UPDATE_DOWNLOAD_DIR,
      directory: Directory.Cache,
      recursive: true,
    });
  } catch {
    // Ignore if the directory already exists.
  }
};

const getUpdateApkUri = async (version: string, fileName?: string) => {
  await ensureUpdateDownloadDir();
  const { uri } = await Filesystem.getUri({
    path: getUpdateApkPath(version, fileName),
    directory: Directory.Cache,
  });
  return uri;
};

const dedupeStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const collectCandidateUrls = (record: Record<string, unknown>) =>
  dedupeStrings(
    [
      toTrimmedString(record.url),
      toTrimmedString(record.driveUrl),
      toTrimmedString(record.googleDriveUrl),
      toTrimmedString(record.githubUrl),
      ...(Array.isArray(record.urls)
        ? record.urls.map((item) => toTrimmedString(item))
        : []),
    ]
      .map((item) => normalizeGoogleDriveDownloadUrl(item))
      .filter(Boolean),
  );

const describeUpdateSource = (value: string) => {
  try {
    const hostname = resolveUrl(value).hostname.toLowerCase();
    if (hostname.includes('drive.google.com')) {
      return 'Google Drive';
    }
    if (
      hostname.includes('github.com') ||
      hostname.includes('githubusercontent.com') ||
      hostname.includes('objects.githubusercontent.com')
    ) {
      return 'GitHub';
    }
    return hostname.replace(/^www\./, '') || 'fonte externa';
  } catch {
    return 'fonte externa';
  }
};

const parseFileTransferError = (error: unknown): FileTransferError | null => {
  if (!isRecord(error)) {
    return null;
  }

  if (isRecord(error.data)) {
    return error.data as unknown as FileTransferError;
  }

  if ('code' in error && typeof error.message === 'string') {
    return error as unknown as FileTransferError;
  }

  return null;
};

const formatDownloadFailureMessage = (url: string, error: unknown) => {
  const source = describeUpdateSource(url);
  const transferError = parseFileTransferError(error);

  if (transferError?.httpStatus) {
    return `${source} retornou HTTP ${transferError.httpStatus}.`;
  }

  if (transferError?.exception) {
    return `${source}: ${transferError.exception}.`;
  }

  if (transferError?.message) {
    return `${source}: ${transferError.message}.`;
  }

  if (error instanceof Error && error.message.trim()) {
    return `${source}: ${error.message.trim()}.`;
  }

  return `N\u00e3o foi poss\u00edvel baixar o APK por ${source}.`;
};

export const compareVersions = (left: string, right: string) => {
  const leftParts = parseVersionTokens(left);
  const rightParts = parseVersionTokens(right);
  const totalParts = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < totalParts; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
};

export const normalizeGoogleDriveDownloadUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = resolveUrl(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.includes('drive.google.com')) {
      return trimmed;
    }

    const idFromPath = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    const idFromQuery = parsed.searchParams.get('id');
    const fileId = idFromPath || idFromQuery;

    if (!fileId) {
      return trimmed;
    }

    const directDownload = new URL('https://drive.google.com/uc');
    directDownload.searchParams.set('export', 'download');
    directDownload.searchParams.set('id', fileId);
    return directDownload.toString();
  } catch {
    return trimmed;
  }
};

const parseRemoteManifest = (payload: unknown): RemoteAppUpdateManifest | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const version = toTrimmedString(payload.version);
  const urls = collectCandidateUrls(payload);
  if (!version || urls.length === 0) {
    return null;
  }

  const fileName = normalizeManifestFileName(
    version,
    toTrimmedString(payload.fileName),
  );

  return {
    version,
    required: isTruthyFlag(payload.required),
    url: urls[0],
    urls,
    fileName,
  };
};

export const getCurrentAppVersion = async (): Promise<string | null> => {
  if (!isNativeAndroidApp) {
    return null;
  }

  try {
    const info = await CapacitorApp.getInfo();
    return info.version?.trim() || null;
  } catch {
    return null;
  }
};

export const fetchRemoteAppUpdateManifest =
  async (): Promise<RemoteAppUpdateManifest | null> => {
    if (!isNativeAndroidApp || !isAppUpdateConfigured) {
      return null;
    }

    try {
      const response = await fetch(appendNoCacheParam(APP_UPDATE_MANIFEST_URL), {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const payload: unknown = await response.json();
      return parseRemoteManifest(payload);
    } catch {
      return null;
    }
  };

export const checkForAppUpdate = async (
  currentVersion?: string | null,
): Promise<AppUpdateCheckResult> => {
  if (!isNativeAndroidApp) {
    return {
      status: 'unsupported',
      currentVersion: null,
      update: null,
    };
  }

  const resolvedCurrentVersion = currentVersion || (await getCurrentAppVersion());
  if (!resolvedCurrentVersion) {
    return {
      status: 'error',
      currentVersion: null,
      update: null,
    };
  }

  if (!isAppUpdateConfigured) {
    return {
      status: 'not-configured',
      currentVersion: resolvedCurrentVersion,
      update: null,
    };
  }

  const remoteManifest = await fetchRemoteAppUpdateManifest();
  if (!remoteManifest) {
    return {
      status: 'error',
      currentVersion: resolvedCurrentVersion,
      update: null,
    };
  }

  if (compareVersions(remoteManifest.version, resolvedCurrentVersion) <= 0) {
    return {
      status: 'up-to-date',
      currentVersion: resolvedCurrentVersion,
      update: null,
    };
  }

  return {
    status: 'available',
    currentVersion: resolvedCurrentVersion,
    update: {
      currentVersion: resolvedCurrentVersion,
      latestVersion: remoteManifest.version,
      required: remoteManifest.required,
      url: remoteManifest.url,
      urls: remoteManifest.urls,
      fileName: remoteManifest.fileName,
    },
  };
};

const doesCachedUpdateExist = async (version: string, fileName?: string) => {
  try {
    await ensureUpdateDownloadDir();
    const fileInfo = await Filesystem.stat({
      path: getUpdateApkPath(version, fileName),
      directory: Directory.Cache,
    });
    return Number(fileInfo.size || 0) > 0;
  } catch {
    return false;
  }
};

export const hasPreparedAppUpdate = async (version: string, fileName?: string) =>
  doesCachedUpdateExist(version, fileName);

const openDownloadedUpdateInstaller = async (
  version: string,
  fileName?: string,
): Promise<AppUpdateInstallResult> => {
  try {
    const fileUri = await getUpdateApkUri(version, fileName);
    const result = await AppInstaller.installApk({
      filePath: fileUri,
    });

    if (result.status === 'needs_permission') {
      return {
        status: 'needs-permission',
        usedUrl: null,
        message:
          'Permita instalar apps desconhecidos para o QualCoco e toque novamente em Atualizar.',
      };
    }

    return {
      status: 'installer-opened',
      usedUrl: null,
      message:
        'O instalador do Android foi aberto. Confirme a instala\u00e7\u00e3o para concluir.',
    };
  } catch (error) {
    return {
      status: 'error',
      usedUrl: null,
      message:
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'N\u00e3o foi poss\u00edvel abrir o instalador do Android.',
    };
  }
};

export const getStartedAppUpdateVersion = () =>
  getStoredValue(APP_UPDATE_INSTALLER_VERSION_KEY);

export const hasStartedAppUpdateForVersion = (version: string) =>
  getStartedAppUpdateVersion() === version;

export const markStartedAppUpdateVersion = (version: string) => {
  if (!version.trim()) {
    return;
  }

  setStoredValue(APP_UPDATE_INSTALLER_VERSION_KEY, version.trim());
};

export const clearStartedAppUpdateVersion = (currentVersion?: string | null) => {
  const startedVersion = getStartedAppUpdateVersion();
  if (!startedVersion) {
    return;
  }

  if (!currentVersion || compareVersions(currentVersion, startedVersion) >= 0) {
    removeStoredValue(APP_UPDATE_INSTALLER_VERSION_KEY);
  }
};

export const downloadAndInstallAppUpdate = async ({
  url,
  urls,
  version,
  fileName,
  onProgress,
}: DownloadAndInstallAppUpdateOptions): Promise<AppUpdateInstallResult> => {
  if (!isNativeAndroidApp) {
    return {
      status: 'error',
      usedUrl: null,
      message: 'Atualiza\u00e7\u00e3o autom\u00e1tica n\u00e3o suportada neste dispositivo.',
    };
  }

  const candidateUrls = dedupeStrings(
    [url || '', ...(urls || [])]
      .map((item) => normalizeGoogleDriveDownloadUrl(item))
      .filter(Boolean),
  );

  if (candidateUrls.length === 0) {
    return {
      status: 'error',
      usedUrl: null,
      message:
        'Nenhuma URL v\u00e1lida do APK foi encontrada no manifesto de atualiza\u00e7\u00e3o.',
    };
  }

  const targetPath = getUpdateApkPath(version, fileName);
  const targetUri = await getUpdateApkUri(version, fileName);
  let progressListener: { remove: () => Promise<void> } | null = null;
  let activeDownloadUrl = '';

  try {
    onProgress?.(0);

    if (await doesCachedUpdateExist(version, fileName)) {
      return openDownloadedUpdateInstaller(version, fileName);
    }

    try {
      progressListener = await FileTransfer.addListener(
        'progress',
        (progress: ProgressStatus) => {
          if (
            !onProgress ||
            progress.type !== 'download' ||
            progress.url !== activeDownloadUrl ||
            !progress.lengthComputable ||
            progress.contentLength <= 0
          ) {
            return;
          }

          const percent = Math.max(
            0,
            Math.min(
              100,
              Math.round((progress.bytes / progress.contentLength) * 100),
            ),
          );

          onProgress(percent);
        },
      );
    } catch {
      progressListener = null;
    }

    const failures: string[] = [];

    for (const candidateUrl of candidateUrls) {
      activeDownloadUrl = candidateUrl;
      onProgress?.(0);

      try {
        await Filesystem.deleteFile({
          path: targetPath,
          directory: Directory.Cache,
        });
      } catch {
        // Ignore stale cache cleanup failures.
      }

      try {
        await FileTransfer.downloadFile({
          url: candidateUrl,
          path: targetUri,
          progress: Boolean(onProgress),
          connectTimeout: 30000,
          readTimeout: 180000,
        });

        onProgress?.(100);

        const installerResult = await openDownloadedUpdateInstaller(version, fileName);
        return {
          ...installerResult,
          usedUrl: candidateUrl,
        };
      } catch (error) {
        failures.push(formatDownloadFailureMessage(candidateUrl, error));
      }
    }

    return {
      status: 'error',
      usedUrl: null,
      message: failures.length
        ? `Falha ao baixar a atualiza\u00e7\u00e3o. ${failures.join(' ')}`
        : 'N\u00e3o foi poss\u00edvel baixar a atualiza\u00e7\u00e3o do aplicativo.',
    };
  } finally {
    if (progressListener) {
      try {
        await progressListener.remove();
      } catch {
        // Keep cleanup silent.
      }
    }
  }
};
