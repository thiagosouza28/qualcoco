import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  Directory,
  Filesystem,
  type ProgressStatus,
} from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';

const APP_UPDATE_MANIFEST_URL = String(
  import.meta.env.VITE_APP_UPDATE_MANIFEST_URL || '',
).trim();

export type RemoteAppUpdateManifest = {
  version: string;
  required: boolean;
  url: string;
};

export type AvailableAppUpdate = {
  currentVersion: string;
  latestVersion: string;
  required: boolean;
  url: string;
};

type DownloadAndInstallAppUpdateOptions = {
  url: string;
  version: string;
  onProgress?: (percent: number) => void;
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

const resolveUrl = (value: string) => new URL(value, window.location.origin);

const appendNoCacheParam = (value: string) => {
  try {
    const parsed = resolveUrl(value);
    parsed.searchParams.set('_ts', String(Date.now()));
    return parsed.toString();
  } catch {
    return value;
  }
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
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const version =
    typeof record.version === 'string' ? record.version.trim() : '';
  const url =
    typeof record.url === 'string'
      ? normalizeGoogleDriveDownloadUrl(record.url)
      : '';

  if (!version || !url) {
    return null;
  }

  return {
    version,
    required: isTruthyFlag(record.required),
    url,
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
    },
  };
};

const APP_UPDATE_MIME_TYPE = 'application/vnd.android.package-archive';
const APP_UPDATE_DOWNLOAD_DIR = 'updates';

const sanitizeVersionForFileName = (value: string) => {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return sanitized || 'latest';
};

const getUpdateApkPath = (version: string) =>
  `${APP_UPDATE_DOWNLOAD_DIR}/qualcoco-${sanitizeVersionForFileName(version)}.apk`;

export const downloadAndInstallAppUpdate = async ({
  url,
  version,
  onProgress,
}: DownloadAndInstallAppUpdateOptions): Promise<boolean> => {
  if (!isNativeAndroidApp) {
    return false;
  }

  const targetUrl = normalizeGoogleDriveDownloadUrl(url);
  if (!targetUrl) {
    return false;
  }

  const targetPath = getUpdateApkPath(version);
  let progressListener: { remove: () => Promise<void> } | null = null;

  try {
    onProgress?.(0);

    try {
      progressListener = await Filesystem.addListener(
        'progress',
        (progress: ProgressStatus) => {
          if (!onProgress || progress.url !== targetUrl || progress.contentLength <= 0) {
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

    try {
      await Filesystem.deleteFile({
        path: targetPath,
        directory: Directory.Cache,
      });
    } catch {
      // Ignore stale cache cleanup failures.
    }

    await Filesystem.downloadFile({
      url: targetUrl,
      path: targetPath,
      directory: Directory.Cache,
      recursive: true,
      progress: Boolean(onProgress),
    });

    const { uri } = await Filesystem.getUri({
      path: targetPath,
      directory: Directory.Cache,
    });

    onProgress?.(100);

    await FileOpener.open({
      filePath: uri,
      contentType: APP_UPDATE_MIME_TYPE,
      openWithDefault: true,
    });

    return true;
  } catch {
    try {
      await Filesystem.deleteFile({
        path: targetPath,
        directory: Directory.Cache,
      });
    } catch {
      // Keep failures silent.
    }

    return false;
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
