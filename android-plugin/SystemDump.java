package nl.endless.klankstroom;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.PermissionInfo;
import android.content.pm.ProviderInfo;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Klankstroom Systeemverkenner — ALLEEN LEZEN.
 * Verzamelt wat een gewone app zonder root mag lezen en zet het op de SD-kaart
 * (Android/data/nl.endless.klankstroom/files/verkenner-DATUM/), om op de pc te onderzoeken:
 *  - apparaat- en systeeminfo (Build, getprop, build.prop, /proc/...)
 *  - lijst van alle apps met activities/services/receivers/providers/rechten
 *  - de APK-mappen van de fabrikant-apps (Microntek/HCT e.d.), of desgewenst alle apps
 *  - /system/framework (bevat o.a. android.microntek.CarManager)
 *  - lijst van systeemdiensten
 *  - de methodes van bekende Microntek-klassen (via reflectie, er wordt niets aangeroepen dat iets verandert)
 */
public class SystemDump {

    public interface Progress { void on(String msg, int pct); }

    /** fabrikant-/autoradio-pakketten die altijd volledig worden gekopieerd */
    private static final Pattern VENDOR = Pattern.compile(
        "(microntek|mtc|hct|hzbhd|syu|\\.tw\\.|\\.ts\\.|carradio|car\\.|android\\.car|canbus|can\\.|mcu|bluetooth|\\.bt|radio|dvd|launcher|settings|systemui|avin|dvr|steer|nwd|qf\\.|fyt|autochips|rockchip|rk\\.)",
        Pattern.CASE_INSENSITIVE);

    private static final String[] PROBE_CLASSES = {
        "android.microntek.CarManager", "android.microntek.MTCData", "android.microntek.ICarService",
        "android.microntek.ICarService$Stub", "android.microntek.mtcser.BTServiceInf", "android.microntek.mtcser.MTCSer",
        "android.microntek.service.MicrontekService", "com.microntek.CarManager", "android.microntek.CarService",
        "android.os.ServiceManager", "android.hardware.radio.RadioManager"
    };

    private final Context ctx;
    private final Progress progress;
    private File out;
    private long copied = 0;
    private final StringBuilder logBuf = new StringBuilder();

    private SystemDump(Context ctx, Progress p) {
        this.ctx = ctx;
        this.progress = p;
    }

    public static JSONObject run(Context ctx, boolean allApps, Progress p) throws Exception {
        SystemDump d = new SystemDump(ctx, p);
        return d.go(allApps);
    }

    private void note(String s) { logBuf.append(s).append('\n'); }

    private File pickDir() {
        File[] dirs = ctx.getExternalFilesDirs(null);
        File best = null;
        for (File f : dirs) {
            if (f == null) continue;
            boolean removable = false;
            try { removable = Environment.isExternalStorageRemovable(f); } catch (Exception ignored) {}
            if (removable) { best = f; break; }
            if (best == null) best = f;
        }
        if (best == null) best = ctx.getFilesDir();
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        File o = new File(best, "verkenner-" + stamp);
        o.mkdirs();
        return o;
    }

    private JSONObject go(boolean allApps) throws Exception {
        out = pickDir();
        progress.on("Map: " + out.getAbsolutePath(), 1);

        // 1. apparaat
        progress.on("Apparaatgegevens", 3);
        StringBuilder info = new StringBuilder();
        for (Field f : Build.class.getFields()) {
            if (Modifier.isStatic(f.getModifiers())) try { info.append("Build.").append(f.getName()).append(" = ").append(String.valueOf(f.get(null))).append('\n'); } catch (Exception ignored) {}
        }
        info.append("SDK_INT = ").append(Build.VERSION.SDK_INT).append('\n');
        info.append("RELEASE = ").append(Build.VERSION.RELEASE).append('\n');
        info.append("SECURITY_PATCH = ").append(Build.VERSION.SDK_INT >= 23 ? Build.VERSION.SECURITY_PATCH : "?").append('\n');
        for (String su : new String[]{"/system/xbin/su", "/system/bin/su", "/sbin/su", "/su/bin/su", "/system/app/Superuser.apk"})
            info.append("su-bestand ").append(su).append(": ").append(new File(su).exists() ? "AANWEZIG" : "nee").append('\n');
        write("apparaat.txt", info.toString());
        write("getprop.txt", exec("getprop"));
        for (String f : new String[]{"/system/build.prop", "/vendor/build.prop", "/odm/build.prop", "/default.prop",
            "/proc/version", "/proc/cpuinfo", "/proc/meminfo", "/proc/mounts", "/proc/partitions", "/proc/cmdline"}) {
            copyFile(new File(f), new File(out, "systeem/" + f.replace('/', '_').substring(1)));
        }
        write("id.txt", exec("id") + "\n" + exec("getenforce") + "\n" + exec("uname -a"));

        // 2. diensten
        progress.on("Systeemdiensten", 8);
        StringBuilder sv = new StringBuilder();
        try {
            Class<?> sm = Class.forName("android.os.ServiceManager");
            String[] list = (String[]) sm.getMethod("listServices").invoke(null);
            if (list != null) for (String s : list) sv.append(s).append('\n');
        } catch (Throwable t) { sv.append("listServices: ").append(t).append('\n'); }
        sv.append("\n--- service list ---\n").append(exec("service list"));
        write("diensten.txt", sv.toString());

        // 3. Microntek-klassen via reflectie (alleen opsommen)
        progress.on("Microntek-klassen onderzoeken", 12);
        StringBuilder cl = new StringBuilder();
        for (String name : PROBE_CLASSES) {
            try {
                Class<?> c = Class.forName(name);
                cl.append("=== ").append(name).append(" (gevonden) extends ").append(c.getSuperclass()).append('\n');
                for (Field f : c.getDeclaredFields()) cl.append("  veld   ").append(f.toGenericString()).append('\n');
                for (Method m : c.getDeclaredMethods()) cl.append("  methode ").append(m.toGenericString()).append('\n');
            } catch (Throwable t) { cl.append("=== ").append(name).append(": niet gevonden (").append(t.getClass().getSimpleName()).append(")\n"); }
        }
        // huidige audiobron alleen uitlezen (verandert niets)
        try {
            Class<?> c = Class.forName("android.microntek.CarManager");
            Object cm = c.newInstance();
            for (String key : new String[]{"av_channel", "cfg_maxvolume", "sta_rds", "sta_radio_freq"}) {
                try { Object v = c.getMethod("getStringState", String.class).invoke(cm, key); cl.append("getStringState(").append(key).append(") = ").append(v).append('\n'); }
                catch (Throwable t) { cl.append("getStringState(").append(key).append("): ").append(t.getClass().getSimpleName()).append('\n'); }
                try { Object v = c.getMethod("getParameters", String.class).invoke(cm, key); cl.append("getParameters(").append(key).append(") = ").append(v).append('\n'); }
                catch (Throwable t) { cl.append("getParameters(").append(key).append("): ").append(t.getClass().getSimpleName()).append('\n'); }
            }
        } catch (Throwable t) { cl.append("CarManager uitlezen: ").append(t).append('\n'); }
        write("microntek-klassen.txt", cl.toString());

        // 4. alle apps met onderdelen
        progress.on("Apps inventariseren", 15);
        PackageManager pm = ctx.getPackageManager();
        List<PackageInfo> pkgs = pm.getInstalledPackages(0);
        JSONArray arr = new JSONArray();
        List<ApplicationInfo> toCopy = new ArrayList<>();
        int i = 0;
        for (PackageInfo base : pkgs) {
            i++;
            JSONObject o = new JSONObject();
            String pn = base.packageName;
            try {
                PackageInfo pi = pm.getPackageInfo(pn, PackageManager.GET_ACTIVITIES | PackageManager.GET_SERVICES | PackageManager.GET_RECEIVERS
                    | PackageManager.GET_PROVIDERS | PackageManager.GET_PERMISSIONS | PackageManager.GET_META_DATA);
                ApplicationInfo ai = pi.applicationInfo;
                o.put("pakket", pn);
                o.put("naam", String.valueOf(pm.getApplicationLabel(ai)));
                o.put("versie", pi.versionName);
                o.put("systeem", (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                o.put("apk", ai.sourceDir);
                o.put("uid", ai.uid);
                o.put("sharedUserId", pi.sharedUserId);
                o.put("activities", names(pi.activities));
                o.put("services", names(pi.services));
                o.put("receivers", names(pi.receivers));
                JSONArray prov = new JSONArray();
                if (pi.providers != null) for (ProviderInfo pr : pi.providers) prov.put(pr.name + " (" + pr.authority + ")");
                o.put("providers", prov);
                JSONArray req = new JSONArray();
                if (pi.requestedPermissions != null) for (String s : pi.requestedPermissions) req.put(s);
                o.put("vraagtRechten", req);
                JSONArray dec = new JSONArray();
                if (pi.permissions != null) for (PermissionInfo pe : pi.permissions) dec.put(pe.name + " [" + pe.protectionLevel + "]");
                o.put("definieertRechten", dec);
                if (allApps || VENDOR.matcher(pn).find() || VENDOR.matcher(String.valueOf(pm.getApplicationLabel(ai))).find()) toCopy.add(ai);
            } catch (Throwable t) {
                try { o.put("pakket", pn); o.put("fout", t.toString()); } catch (Exception ignored) {}
            }
            arr.put(o);
            if (i % 20 == 0) progress.on("Apps inventariseren " + i + "/" + pkgs.size(), 15 + 10 * i / Math.max(1, pkgs.size()));
        }
        write("apps.json", arr.toString(2));

        // 5. framework
        progress.on("Framework kopiëren (/system/framework)", 26);
        copyTree(new File("/system/framework"), new File(out, "framework"), 0);

        // 6. APK-mappen
        int n = 0;
        for (ApplicationInfo ai : toCopy) {
            n++;
            progress.on("APK " + n + "/" + toCopy.size() + ": " + ai.packageName, 30 + 65 * n / Math.max(1, toCopy.size()));
            File src = new File(ai.sourceDir);
            boolean sys = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            File dst = new File(out, "apps/" + ai.packageName);
            // systeem-apps: hele map (apk + oat/odex/vdex), anders alleen de apk
            if (sys && src.getParentFile() != null && src.getParentFile().getAbsolutePath().startsWith("/system")) copyTree(src.getParentFile(), dst, 0);
            else copyFile(src, new File(dst, src.getName()));
        }

        // 7. bestandslijsten
        progress.on("Bestandslijst maken", 96);
        StringBuilder ls = new StringBuilder();
        for (String r : new String[]{"/system/app", "/system/priv-app", "/system/framework", "/system/etc", "/system/bin", "/system/lib", "/vendor", "/oem", "/odm", "/mnt", "/storage"})
            list(new File(r), ls, 0);
        write("bestanden.txt", ls.toString());
        write("logboek.txt", logBuf.toString());

        JSONObject res = new JSONObject();
        res.put("map", out.getAbsolutePath());
        res.put("apps", pkgs.size());
        res.put("gekopieerd", toCopy.size());
        res.put("mb", Math.round(copied / 1048576.0));
        StatFs st = new StatFs(out.getAbsolutePath());
        res.put("vrijMb", Math.round(st.getAvailableBytes() / 1048576.0));
        progress.on("Klaar: " + Math.round(copied / 1048576.0) + " MB in " + out.getAbsolutePath(), 100);
        return res;
    }

    private static JSONArray names(ActivityInfo[] a) { JSONArray r = new JSONArray(); if (a != null) for (ActivityInfo x : a) r.put(x.name + (x.exported ? " [exported]" : "")); return r; }
    private static JSONArray names(ServiceInfo[] a) { JSONArray r = new JSONArray(); if (a != null) for (ServiceInfo x : a) r.put(x.name + (x.exported ? " [exported]" : "")); return r; }

    private void write(String name, String text) {
        try (OutputStream o = new FileOutputStream(new File(out, name))) { o.write(text.getBytes("UTF-8")); }
        catch (Exception e) { note("schrijven " + name + ": " + e); }
    }

    private void copyFile(File src, File dst) {
        try {
            if (!src.isFile() || !src.canRead()) { note("niet leesbaar: " + src); return; }
            dst.getParentFile().mkdirs();
            try (InputStream in = new FileInputStream(src); OutputStream o = new FileOutputStream(dst)) {
                byte[] b = new byte[65536]; int k;
                while ((k = in.read(b)) > 0) { o.write(b, 0, k); copied += k; }
            }
        } catch (Exception e) { note("kopiëren " + src + ": " + e); }
    }

    private void copyTree(File src, File dst, int depth) {
        if (depth > 6 || src == null) return;
        File[] kids = src.listFiles();
        if (kids == null) { if (src.isFile()) copyFile(src, dst); else note("map niet leesbaar: " + src); return; }
        for (File k : kids) {
            if (k.isDirectory()) copyTree(k, new File(dst, k.getName()), depth + 1);
            else copyFile(k, new File(dst, k.getName()));
        }
    }

    private void list(File d, StringBuilder sb, int depth) {
        if (depth > 4) return;
        File[] kids = d.listFiles();
        if (kids == null) { sb.append(d.getAbsolutePath()).append("  (niet leesbaar)\n"); return; }
        for (File k : kids) {
            sb.append(k.isDirectory() ? "[map] " : "      ").append(k.getAbsolutePath());
            if (k.isFile()) sb.append("  ").append(k.length());
            sb.append('\n');
            if (k.isDirectory()) list(k, sb, depth + 1);
        }
    }

    private String exec(String cmd) {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", cmd});
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) { String l; while ((l = r.readLine()) != null) sb.append(l).append('\n'); }
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getErrorStream()))) { String l; while ((l = r.readLine()) != null) sb.append("[stderr] ").append(l).append('\n'); }
            p.waitFor();
            return sb.toString();
        } catch (Exception e) { return cmd + ": " + e + "\n"; }
    }
}
