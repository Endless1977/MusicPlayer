package nl.endless.klankstroom;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Build;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Klankstroom — hardwarescan voor Android:
 *  - muziek op interne opslag, SD-kaart en USB-sticks (MediaStore, per opslagvolume)
 *  - USB-apparaten (opslag, CD/DVD-speler, USB-audio)
 *  - ingebouwde FM-radio-app van de fabrikant
 *  - voorgronddienst zodat muziek doorspeelt met het scherm uit
 */
@CapacitorPlugin(
    name = "MediaScan",
    permissions = {
        @Permission(alias = "audio33", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MediaScanPlugin extends Plugin {

    private static final String[] FM_PACKAGES = {
        "com.android.fmradio", "com.caf.fmradio", "com.sec.android.app.fm", "com.motorola.fmplayer",
        "com.miui.fm", "com.miui.fmradio", "com.huawei.android.FMRadio", "com.sonyericsson.fmradio", "com.sony.fmradio",
        "com.lge.fmradio", "com.mediatek.fmradio", "com.mediatek.FMRadio", "com.android.FMRadio", "com.zte.fmradio",
        "com.oppo.fmradio", "com.coloros.fmradio", "com.vivo.FMRadio", "com.asus.fmradio", "com.htc.fm", "com.nothing.fmradio"
    };

    private final StreamProxy proxy = new StreamProxy();

    /** Poort van de doorgeefserver (zodat de visualizer ook radiostreams kan analyseren). */
    @PluginMethod
    public void proxyPort(PluginCall call) {
        JSObject r = new JSObject();
        r.put("port", proxy.start());
        call.resolve(r);
    }

    private String audioAlias() { return Build.VERSION.SDK_INT >= 33 ? "audio33" : "audioLegacy"; }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject r = new JSObject();
        r.put("audio", getPermissionState(audioAlias()).toString());
        call.resolve(r);
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState(audioAlias()) == PermissionState.GRANTED) { checkPermissions(call); return; }
        requestPermissionForAlias(audioAlias(), call, "permCallback");
    }

    @PermissionCallback
    private void permCallback(PluginCall call) { checkPermissions(call); }

    @PluginMethod
    public void scan(PluginCall call) {
        Context ctx = getContext();
        JSObject out = new JSObject();
        JSArray volumes = new JSArray();
        JSArray tracks = new JSArray();
        Map<String, JSObject> volInfo = new HashMap<>();

        // Opslagvolumes en hun namen (Telefoon, SD-kaart, USB-stick)
        StorageManager sm = (StorageManager) ctx.getSystemService(Context.STORAGE_SERVICE);
        if (sm != null && Build.VERSION.SDK_INT >= 30) {
            for (StorageVolume sv : sm.getStorageVolumes()) {
                String name = sv.getMediaStoreVolumeName();
                if (name == null) continue;
                JSObject v = new JSObject();
                v.put("name", name);
                String desc = sv.getDescription(ctx);
                v.put("label", sv.isPrimary() ? "Interne opslag" : (desc != null ? desc : "Externe opslag"));
                v.put("removable", sv.isRemovable());
                v.put("primary", sv.isPrimary());
                v.put("state", sv.getState());
                volInfo.put(name, v);
            }
        }
        List<String> names = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 29) {
            Set<String> s = MediaStore.getExternalVolumeNames(ctx);
            names.addAll(s);
        } else names.add("external");

        ContentResolver cr = ctx.getContentResolver();
        for (String vol : names) {
            JSObject v = volInfo.get(vol);
            if (v == null) {
                v = new JSObject();
                v.put("name", vol);
                boolean primary = vol.equals("external_primary") || vol.equals("external");
                v.put("label", primary ? "Interne opslag" : "SD-kaart / USB (" + vol + ")");
                v.put("removable", !primary);
                v.put("primary", primary);
                v.put("state", "mounted");
            }
            volumes.put(v);
            Uri uri = Build.VERSION.SDK_INT >= 29 ? MediaStore.Audio.Media.getContentUri(vol) : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] proj = { MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.DATA };
            String sel = MediaStore.Audio.Media.IS_MUSIC + " != 0 OR " + MediaStore.Audio.Media.DURATION + " > 60000";
            try (Cursor c = cr.query(uri, proj, sel, null, MediaStore.Audio.Media.ARTIST + " ASC")) {
                if (c == null) continue;
                while (c.moveToNext()) {
                    JSObject t = new JSObject();
                    long id = c.getLong(0);
                    t.put("title", c.getString(1));
                    t.put("artist", c.getString(2));
                    t.put("album", c.getString(3));
                    t.put("duration", c.getLong(4));
                    t.put("path", c.getString(5));
                    t.put("uri", ContentUris.withAppendedId(uri, id).toString());
                    t.put("volume", vol);
                    t.put("volumeLabel", v.getString("label"));
                    tracks.put(t);
                }
            } catch (Exception e) { /* volume niet leesbaar: overslaan */ }
        }
        out.put("volumes", volumes);
        out.put("tracks", tracks);

        // USB-apparaten
        JSArray usb = new JSArray();
        UsbManager um = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        if (um != null) {
            for (UsbDevice d : um.getDeviceList().values()) {
                JSObject u = new JSObject();
                String pname = d.getProductName() != null ? d.getProductName() : "USB-apparaat";
                String mname = d.getManufacturerName() != null ? d.getManufacturerName() + " " : "";
                boolean storage = false, optical = false, audio = false;
                for (int i = 0; i < d.getInterfaceCount(); i++) {
                    UsbInterface itf = d.getInterface(i);
                    if (itf.getInterfaceClass() == 8) { storage = true; int sc = itf.getInterfaceSubclass(); if (sc == 2 || sc == 5) optical = true; }
                    if (itf.getInterfaceClass() == 1) audio = true;
                }
                if (pname.toUpperCase().matches(".*(DVD|CD|BD|OPTICAL|BLU-?RAY).*")) optical = true;
                u.put("name", mname + pname);
                u.put("storage", storage && !optical);
                u.put("optical", optical);
                u.put("audio", audio);
                usb.put(u);
            }
        }
        out.put("usb", usb);

        // FM-radio
        JSObject fm = new JSObject();
        JSArray apps = new JSArray();
        PackageManager pm = ctx.getPackageManager();
        for (String p : FM_PACKAGES) {
            Intent li = pm.getLaunchIntentForPackage(p);
            if (li == null) continue;
            JSObject a = new JSObject();
            a.put("package", p);
            try { ApplicationInfo ai = pm.getApplicationInfo(p, 0); a.put("label", pm.getApplicationLabel(ai).toString()); }
            catch (Exception e) { a.put("label", "FM-radio"); }
            apps.put(a);
        }
        fm.put("apps", apps);
        fm.put("available", apps.length() > 0);
        fm.put("hint", pm.hasSystemFeature("android.hardware.radio") ? "Telefoon meldt een radiochip, maar geen bekende FM-app" : "Geen FM-app van de fabrikant gevonden");
        out.put("fm", fm);
        call.resolve(out);
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String p = call.getString("package");
        Intent li = p == null ? null : getContext().getPackageManager().getLaunchIntentForPackage(p);
        if (li == null) { call.reject("App niet gevonden"); return; }
        li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(li);
        call.resolve();
    }

    /** Voorgronddienst aan/uit: houdt afspelen actief met het scherm uit en toont een melding. */
    @PluginMethod
    public void keepAlive(PluginCall call) {
        Context ctx = getContext();
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Intent i = new Intent(ctx, PlaybackService.class);
        if (on) {
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") != PermissionState.GRANTED && !Boolean.TRUE.equals(call.getBoolean("asked", false))) {
                requestPermissionForAlias("notify", call, "notifyCallback");
                return;
            }
            i.putExtra("title", call.getString("title", "Klankstroom"));
            i.putExtra("artist", call.getString("artist", ""));
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
            } catch (Exception e) { /* bv. app op de achtergrond: stil negeren */ }
        } else ctx.stopService(i);
        call.resolve();
    }

    @PermissionCallback
    private void notifyCallback(PluginCall call) {
        call.getData().put("asked", true);
        keepAlive(call);
    }
}
