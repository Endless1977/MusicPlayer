package nl.endless.klankstroom;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Klankstroom automatisch starten na het opstarten van de autoradio (instelbaar in de app). */
public class BootReceiver extends BroadcastReceiver {
    static final String PREFS = "klankstroom";

    static boolean enabled(Context c) { return c.getSharedPreferences(PREFS, 0).getBoolean("autostart", true); }

    static void launch(Context c) {
        try {
            Intent i = new Intent(c, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            i.putExtra("autostart", true);
            c.startActivity(i);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (a == null || !enabled(c)) return;
        boolean accOn = "com.microntek.acc".equals(a) && "accon".equals(intent.getStringExtra("accstate"));
        if (accOn || Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)
            || "com.microntek.bootcheck".equals(a) && "accon".equals(intent.getStringExtra("class"))) {
            // even wachten tot de radio klaar is met opstarten
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> launch(c), accOn ? 1500 : 4000);
        }
    }
}
