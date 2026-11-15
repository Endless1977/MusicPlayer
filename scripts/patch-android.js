/* Klankstroom — zet de eigen Android-plugin en rechten in het door Capacitor gegenereerde android-project.
   Gebruik: npx cap add android && node scripts/patch-android.js && npx cap sync android */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = path.join(root, 'android', 'app', 'src', 'main');
if (!fs.existsSync(app)) { console.error('android/ ontbreekt: eerst "npx cap add android"'); process.exit(1); }

// 1. Java-bestanden kopiëren
const pkgDir = path.join(app, 'java', 'nl', 'endless', 'klankstroom');
fs.mkdirSync(pkgDir, { recursive: true });
for (const f of ['MediaScanPlugin.java', 'PlaybackService.java'])
  fs.copyFileSync(path.join(root, 'android-plugin', f), path.join(pkgDir, f));

// 2. Plugin registreren in MainActivity
const mainFile = path.join(pkgDir, 'MainActivity.java');
let main = fs.readFileSync(mainFile, 'utf8');
if (!main.includes('MediaScanPlugin')) {
  main = main.replace(/public class MainActivity extends BridgeActivity \{\s*\}/,
`import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaScanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}`);
  fs.writeFileSync(mainFile, main);
}

// 3. AndroidManifest: rechten, dienst, FM-apps zichtbaar, Spotify-deeplink
const manFile = path.join(app, 'AndroidManifest.xml');
let man = fs.readFileSync(manFile, 'utf8');
const perms = [
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS'
];
for (const p of perms) {
  const name = p.split('"')[0];
  if (!man.includes(`"${name}"`)) man = man.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}
if (!man.includes('android.hardware.usb.host')) man = man.replace('</manifest>', '    <uses-feature android:name="android.hardware.usb.host" android:required="false" />\n</manifest>');
if (!man.includes('<queries>')) {
  const fm = ['com.android.fmradio', 'com.caf.fmradio', 'com.sec.android.app.fm', 'com.motorola.fmplayer', 'com.miui.fm', 'com.miui.fmradio',
    'com.huawei.android.FMRadio', 'com.sonyericsson.fmradio', 'com.sony.fmradio', 'com.lge.fmradio', 'com.mediatek.fmradio', 'com.mediatek.FMRadio',
    'com.android.FMRadio', 'com.zte.fmradio', 'com.oppo.fmradio', 'com.coloros.fmradio', 'com.vivo.FMRadio', 'com.asus.fmradio', 'com.htc.fm', 'com.nothing.fmradio'];
  man = man.replace('</manifest>', `    <queries>\n${fm.map(p => `        <package android:name="${p}" />`).join('\n')}\n    </queries>\n</manifest>`);
}
if (!man.includes('PlaybackService')) {
  man = man.replace('</application>',
    '        <service android:name=".PlaybackService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>');
}
if (!man.includes('nl.endless.klankstroom" android:host="spotify')) {
  man = man.replace(/(<activity[^>]*MainActivity[\s\S]*?)(<\/activity>)/,
    `$1    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="nl.endless.klankstroom" android:host="spotify" />
            </intent-filter>
        $2`);
}
if (!man.includes('usesCleartextTraffic')) man = man.replace('<application', '<application android:usesCleartextTraffic="true"');
fs.writeFileSync(manFile, man);
console.log('Android-project gepatcht ✔');
