import { registerPlugin } from '@capacitor/core';

export type AppInstallerStatus = 'installer_opened' | 'needs_permission';

export type InstallApkResult = {
  status: AppInstallerStatus;
};

type AppInstallerPlugin = {
  installApk(options: { filePath: string }): Promise<InstallApkResult>;
};

export const AppInstaller = registerPlugin<AppInstallerPlugin>('AppInstaller');
