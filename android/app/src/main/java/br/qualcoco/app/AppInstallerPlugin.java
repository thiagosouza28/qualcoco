package br.qualcoco.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";

    @PluginMethod()
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath", "").trim();
        if (filePath.isEmpty()) {
            call.reject("Caminho do APK não informado.");
            return;
        }

        try {
            Uri apkUri = resolveApkUri(filePath);
            if (apkUri == null) {
                call.reject("Não foi possível localizar o APK para instalação.");
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settingsIntent);

                JSObject result = new JSObject();
                result.put("status", "needs_permission");
                call.resolve(result);
                return;
            }

            try {
                Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                installIntent.setData(apkUri);
                installIntent.putExtra(Intent.EXTRA_RETURN_RESULT, false);
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(installIntent);
            } catch (ActivityNotFoundException firstInstallAttempt) {
                Intent fallbackIntent = new Intent(Intent.ACTION_VIEW);
                fallbackIntent.setDataAndType(apkUri, APK_MIME_TYPE);
                fallbackIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallbackIntent);
            }

            JSObject result = new JSObject();
            result.put("status", "installer_opened");
            call.resolve(result);
        } catch (Exception exception) {
            call.reject(
                exception.getMessage() != null
                    ? exception.getMessage()
                    : "Falha ao abrir o instalador do Android.",
                exception
            );
        }
    }

    private Uri resolveApkUri(String filePath) {
        Uri parsedUri = Uri.parse(filePath);
        String scheme = parsedUri.getScheme();

        if ("content".equalsIgnoreCase(scheme)) {
            return parsedUri;
        }

        String resolvedPath = filePath;
        if ("file".equalsIgnoreCase(scheme)) {
            resolvedPath = parsedUri.getPath();
        }

        if (resolvedPath == null || resolvedPath.trim().isEmpty()) {
            return null;
        }

        File apkFile = new File(resolvedPath);
        if (!apkFile.exists()) {
            return null;
        }

        return FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );
    }
}
