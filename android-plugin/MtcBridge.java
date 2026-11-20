package nl.endless.klankstroom;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Parcel;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.nio.charset.Charset;
import java.util.List;

/**
 * Klankstroom — brug naar de autoradio-hardware van Microntek/HCT (MTCD/MTCE, PX5 e.d.).
 *  - carservice via android.microntek.CarManager (reflectie): setParameters / getParameters / meldingen
 *  - Bluetooth via de dienst android.microntek.mtcser.BlueToothService (AIDL android.microntek.mtcser.BTServiceInf)
 * Zie docs/mtce-api.md voor de opdrachten. Op andere apparaten is available() false.
 */
public class MtcBridge {
    public interface Events { void emit(String name, JSObject data); }

    private final Context ctx;
    private final Events events;
    private Object cm;            // android.microntek.CarManager
    private Class<?> cmc;
    private Handler handler;
    private boolean attached;

    // Bluetooth
    private static final String BT_DESC = "android.microntek.mtcser.BTServiceInf";
    private IBinder bt;
    private ServiceConnection btConn;
    private BroadcastReceiver btReceiver;

    public MtcBridge(Context ctx, Events events) {
        this.ctx = ctx.getApplicationContext();
        this.events = events;
        try {
            cmc = Class.forName("android.microntek.CarManager");
            cm = cmc.newInstance();
        } catch (Throwable t) { cm = null; }
    }

    public boolean available() { return cm != null; }

    public void set(String param) throws Exception {
        if (cm == null) throw new IllegalStateException("Geen MTC-autoradio");
        cmc.getMethod("setParameters", String.class).invoke(cm, param);
    }

    public String get(String param) throws Exception {
        if (cm == null) throw new IllegalStateException("Geen MTC-autoradio");
        Object r = cmc.getMethod("getParameters", String.class).invoke(cm, param);
        return r == null ? "" : r.toString();
    }

    public Object state(String key, String kind) throws Exception {
        if (cm == null) throw new IllegalStateException("Geen MTC-autoradio");
        switch (kind == null ? "string" : kind) {
            case "int": return cmc.getMethod("getIntState", String.class).invoke(cm, key);
            case "bool": return cmc.getMethod("getBooleanState", String.class).invoke(cm, key);
            default: return cmc.getMethod("getStringState", String.class).invoke(cm, key);
        }
    }

    /** meldingen van de MCU, bv. "Radio,Dvd,KeyDown,CarEvent,CarData" */
    public void attach(String types) throws Exception {
        if (cm == null) throw new IllegalStateException("Geen MTC-autoradio");
        detach();
        handler = new Handler(Looper.getMainLooper()) {
            @Override public void handleMessage(Message msg) {
                JSObject e = new JSObject();
                e.put("obj", msg.obj == null ? "" : msg.obj.toString());
                e.put("what", msg.what);
                e.put("data", bundleToJs(msg.getData()));
                events.emit("mtcEvent", e);
            }
        };
        cmc.getMethod("attach", Handler.class, String.class).invoke(cm, handler, types);
        attached = true;
    }

    public void detach() {
        if (cm != null && attached) {
            try { cmc.getMethod("detach").invoke(cm); } catch (Throwable ignored) {}
        }
        attached = false;
    }

    /** navigatie-instellingen van de radio (voor het onderdrukken van het volume als de navigatie spreekt) */
    public JSObject naviInfo() {
        JSObject o = new JSObject();
        android.content.ContentResolver cr = ctx.getContentResolver();
        o.put("app", Settings.System.getString(cr, "gpspkname"));
        o.put("monitor", Settings.System.getString(cr, "av_gps_monitor="));
        o.put("switch", Settings.System.getString(cr, "av_gps_switch="));
        o.put("gain", Settings.System.getString(cr, "av_gps_gain="));
        o.put("backvol", Settings.System.getString(cr, "av_gps_backvol="));
        return o;
    }

    public void setNaviApp(String pkg) {
        Intent i = new Intent("com.microntek.setnavi");
        i.putExtra("pkname", pkg);
        ctx.sendBroadcast(i);
    }

    // ---------------------------------------------------------------- Bluetooth

    public void btBind() {
        if (bt != null || btConn != null) return;
        btConn = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName n, IBinder b) {
                bt = b;
                JSObject e = new JSObject(); e.put("connected", true); events.emit("btService", e);
            }
            @Override public void onServiceDisconnected(ComponentName n) {
                bt = null;
                JSObject e = new JSObject(); e.put("connected", false); events.emit("btService", e);
            }
        };
        Intent i = new Intent();
        i.setComponent(new ComponentName("android.microntek.mtcser", "android.microntek.mtcser.BlueToothService"));
        try { ctx.bindService(i, btConn, Context.BIND_AUTO_CREATE); } catch (Throwable t) { btConn = null; }
        if (btReceiver == null) {
            btReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent intent) {
                    JSObject e = new JSObject();
                    e.put("action", intent.getAction());
                    e.put("data", bundleToJs(intent.getExtras()));
                    events.emit("btReport", e);
                }
            };
            IntentFilter f = new IntentFilter();
            f.addAction("com.microntek.bt.report");
            f.addAction("com.microntek.btbarstatechange");
            f.addAction("ACTION_HCT_TELPHONE_IN");
            ctx.registerReceiver(btReceiver, f);
        }
    }

    public boolean btReady() { return bt != null; }

    /** methodes van BTServiceInf met hun transactienummer (volgorde uit de AIDL) */
    private static int btCode(String m) {
        String[] order = {"init", "getBTState", "getAVState", "getDialOutNum", "getCallInNum", "getPhoneNum", "IsThreeWayCalling",
            "IsConferenceCalling", "getThreeWayCallNum", "getCallingNumberList", "getNowDevAddr", "getNowDevName", "getNowDevUuids",
            "avPlay", "avPlayPause", "avPlayStop", "avPlayPrev", "avPlayNext", "answerCall", "hangupCall", "rejectCall", "addCall",
            "swichCall", "mergeCall", "voiceControl", "switchVoice", "syncPhonebook", "getModuleName", "getModulePassword",
            "setModuleName", "setModulePassword", "setAutoConnect", "getAutoConnect", "setAutoAnswer", "getAutoAnswer", "connectBT",
            "disconnectBT", "connectOBD", "disconnectOBD", "deleteOBD", "deleteBT", "syncMatchList", "getMatchList", "getDeviceList",
            "getHistoryList", "getPhoneBookList", "setPhoneBookList", "deleteHistory", "deleteHistoryAll", "musicMute", "musicUnmute",
            "scanStart", "scanStop", "dialOut", "dialOutSub", "reDial", "getMusicInfo", "getOBDstate", "requestBtInfo"};
        for (int i = 0; i < order.length; i++) if (order[i].equals(m)) return i + 1;
        return -1;
    }

    /** roept een BTServiceInf-methode aan; arg: String/char/int/boolean naar gelang de methode */
    public Object btCall(String method, Object arg) throws Exception {
        if (bt == null) throw new IllegalStateException("Bluetooth-dienst niet verbonden");
        int code = btCode(method);
        if (code < 0) throw new IllegalArgumentException("Onbekende methode " + method);
        Parcel d = Parcel.obtain(), r = Parcel.obtain();
        try {
            d.writeInterfaceToken(BT_DESC);
            switch (method) {
                case "dialOut": case "connectBT": case "disconnectBT": case "deleteBT":
                case "setModuleName": case "setModulePassword":
                    d.writeString(String.valueOf(arg)); break;
                case "dialOutSub":
                    d.writeInt(String.valueOf(arg).isEmpty() ? 0 : String.valueOf(arg).charAt(0)); break;
                case "deleteHistory":
                    d.writeInt(Integer.parseInt(String.valueOf(arg))); break;
                case "setAutoConnect": case "setAutoAnswer":
                    d.writeInt(Boolean.parseBoolean(String.valueOf(arg)) ? 1 : 0); break;
                default: break;
            }
            bt.transact(code, d, r, 0);
            r.readException();
            switch (method) {
                case "getBTState": case "getAVState": return (int) r.readByte();
                case "getDialOutNum": case "getCallInNum": case "getPhoneNum": case "getThreeWayCallNum":
                case "getNowDevName": case "getModuleName": case "getModulePassword": case "getMusicInfo":
                    return r.readString();
                case "IsThreeWayCalling": case "IsConferenceCalling": case "getAutoConnect": case "getAutoAnswer":
                    return r.readInt() != 0;
                case "getNowDevAddr": return r.readLong();
                case "getOBDstate": return r.readInt();
                case "getCallingNumberList": case "getNowDevUuids": case "getMatchList": case "getDeviceList":
                case "getHistoryList": case "getPhoneBookList": {
                    List<String> l = r.createStringArrayList();
                    JSArray a = new JSArray();
                    if (l != null) for (String s : l) a.put(s);
                    return a;
                }
                default: return null;
            }
        } finally { d.recycle(); r.recycle(); }
    }

    /** alles wat een speler/telefoonscherm nodig heeft in één keer */
    public JSObject btStatus() {
        JSObject o = new JSObject();
        o.put("service", bt != null);
        if (bt == null) return o;
        String[] ms = {"getBTState", "getAVState", "getCallInNum", "getDialOutNum", "getPhoneNum", "getNowDevName", "getMusicInfo", "getNowDevAddr"};
        for (String m : ms) {
            try { Object v = btCall(m, null); o.put(m, v == null ? JSObject.NULL : v); }
            catch (Throwable t) { o.put(m + "_fout", t.toString()); }
        }
        return o;
    }

    public void close() {
        detach();
        try { if (btReceiver != null) ctx.unregisterReceiver(btReceiver); } catch (Throwable ignored) {}
        try { if (btConn != null) ctx.unbindService(btConn); } catch (Throwable ignored) {}
        btReceiver = null; btConn = null; bt = null;
    }

    // ---------------------------------------------------------------- hulp

    private static final Charset LATIN1 = Charset.forName("ISO-8859-1");

    static JSObject bundleToJs(Bundle b) {
        JSObject o = new JSObject();
        if (b == null) return o;
        for (String k : b.keySet()) {
            Object v = b.get(k);
            if (v == null) o.put(k, JSObject.NULL);
            else if (v instanceof byte[]) o.put(k, new String(trim((byte[]) v), LATIN1).trim());
            else if (v instanceof int[]) { JSArray a = new JSArray(); for (int x : (int[]) v) a.put(x); o.put(k, a); }
            else if (v instanceof String[]) { JSArray a = new JSArray(); for (String x : (String[]) v) a.put(x); o.put(k, a); }
            else if (v instanceof java.util.ArrayList) { JSArray a = new JSArray(); for (Object x : (java.util.ArrayList<?>) v) a.put(String.valueOf(x)); o.put(k, a); }
            else if (v instanceof Boolean || v instanceof Integer || v instanceof Long || v instanceof Double || v instanceof Float) o.put(k, v);
            else o.put(k, String.valueOf(v));
        }
        return o;
    }

    private static byte[] trim(byte[] b) {
        int n = b.length;
        while (n > 0 && b[n - 1] == 0) n--;
        byte[] r = new byte[n];
        System.arraycopy(b, 0, r, 0, n);
        return r;
    }
}
