package br.qualcoco.app;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String HARDWARE_VOLUME_EVENT = "qualcoco:hardware-volume";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    private boolean shouldHandleVolumeButtons() {
        if (bridge == null || bridge.getWebView() == null) {
            return false;
        }

        String currentUrl = bridge.getWebView().getUrl();
        return currentUrl != null &&
            currentUrl.contains("/avaliacoes/") &&
            !currentUrl.contains("/avaliacoes/nova");
    }

    private void dispatchVolumeEvent(String button) {
        if (bridge == null) {
            return;
        }

        bridge.triggerWindowJSEvent(HARDWARE_VOLUME_EVENT, "{\"button\":\"" + button + "\"}");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (shouldHandleVolumeButtons()) {
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
                dispatchVolumeEvent("up");
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                dispatchVolumeEvent("down");
                return true;
            }
        }

        return super.onKeyDown(keyCode, event);
    }
}
