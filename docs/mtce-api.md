# MTCE (PX5 / HCT) — bediening van radio-tuner en DVD/CD

Gevonden met de Systeemverkenner op Joris' autoradio, door de fabrikant-apps te analyseren
(`MTCRadioKSP3`, `MTCDVD4`, framework `android.microntek.*`).

**Apparaat:** rk3368 (PX5), Android 9 userdebug (`eng.hct.20190509`, test-keys), MCU `MTCE_KSP_V3.07_1`,
1024×600, SELinux **Permissive**, `/system/xbin/su` aanwezig. Een normale app draait als `untrusted_app`.

## Toegang

De systeemdienst `carservice` (`android.microntek.ICarService`) wordt aangesproken via de framework-klasse
`android.microntek.CarManager`. Die is voor elke app beschikbaar, zonder extra rechten:

```java
Class<?> c = Class.forName("android.microntek.CarManager");
Object cm = c.newInstance();
c.getMethod("setParameters", String.class).invoke(cm, "av_channel_enter=fm");
String s = (String) c.getMethod("getParameters", String.class).invoke(cm, "sta_dvd_title=");
// meldingen ontvangen:
c.getMethod("attach", android.os.Handler.class, String.class).invoke(cm, handler, "Radio,KeyDown");
// handler: msg.obj = "Radio" | "KeyDown" | "Dvd" | "CarEvent" | "CarData";  msg.getData() = Bundle
// afmelden: c.getMethod("detach").invoke(cm);
```

Ook beschikbaar: `getStringState`, `getIntState`, `getBooleanState`, `putState(...)`, `dispatchMessage(...)`.
Huidige audiobron: `getStringState("av_channel")` (bijvoorbeeld `sys` = Android).

## Audiobron (MCU schakelt de analoge bron naar de versterker)

| Opdracht | Betekenis |
|---|---|
| `av_channel_enter=fm` / `av_channel_exit=fm` | radio-tuner aan of uit als bron |
| `av_focus_gain=fm` / `av_focus_loss=fm` | focus (gebruikt bij telefoongesprek of navigatie-melding) |
| `av_channel_enter=dvd` / `av_channel_exit=dvd` | DVD/CD als bron |
| `av_focus_gain=dvd` / `av_focus_loss=dvd` | |

## Radio-tuner

| Opdracht | Betekenis |
|---|---|
| `ctl_radio_frequency=<kHz>` | afstemmen, bijv. `ctl_radio_frequency=103500` = 103,5 MHz (de stock-app deelt Hz door 1000) |
| `ctl_radio_seek=up` / `down` / `auto` | zoeken naar de volgende/vorige zender, `auto` = alle zenders scannen |
| `ctl_radio_tune=up` / `down` | één stap verder of terug |
| `ctl_radio_rds=` / `af=` / `ta=` / `pty=` / `loc=` / `st=` | RDS, alternatieve frequenties, verkeersinfo, programmatype, lokaal zoeken, stereo (waarde 0/1) |
| `cfg_radio_area=<n>` / `cfg_rds=<n>` | regio-instelling en RDS-instelling |

**Meldingen** (`attach(handler, "Radio,KeyDown")`, msg.obj = `"Radio"`), Bundle met `type`:

| `type` | `value` |
|---|---|
| `freq` | int: huidige frequentie |
| `psn` | byte[]: zendernaam (ISO-8859-1) |
| `rt` | byte[]: radiotekst (ISO-8859-1) |
| `pi`, `pty`, `tp`, `ta`, `stereo` | int |
| `seek_start`, `seek_found` (+ `strength`), `seek_end` | zoekvoortgang |
| `seek_start_auto`, `seek_found_auto`, `seek_end_auto` | automatisch scannen |

Broadcasts van de stock-app: `com.microntek.radio.report`, `com.microntek.request.radio`, stuurwiel/widget:
`hct.radio.channel.next/prev/one…six`, `hct.radio.band.next/prev`, `hct.radio.power.switch`.

## DVD / CD

`ctl_dvd_cmd=<n>` met `n = 0x20000 | (code << 8) | (code ^ 2)`
(bijvoorbeeld afspelen: code 22 → `ctl_dvd_cmd=136724`).

| code | functie | code | functie |
|---|---|---|---|
| 0 | sys | 1–10 | cijfers 0–9 |
| 13 | play/pauze | 15 | stop |
| 17 | slow | 19 | audiotaal |
| 20 | vooruit | 21 | achteruit |
| 22 | afspelen | 23 | volgende |
| 24 | vorige | 25 | goto |
| 27 | programma | 28 | volgorde |
| 29 | herhalen | 31 | titel |
| 34 | PBC | 37 | OSD |
| 38–42 | links/rechts/omhoog/omlaag/enter | 43 | zoom |
| 44 | hoek | 45 | ondertitel |
| 46 | setup | 50 | +10 |

Overige opdrachten: `ctl_dvd_door=open` (uitwerpen), `cfg_dvd=`.

**Status uitlezen** (`getParameters`): `sta_dvd=`, `sta_dvd_media=`, `sta_dvd_title=`, `sta_dvd_length=`,
`sta_dvd_position=`, `sta_dvd_media_idx=`, `sta_dvd_media_cnt=`, `sta_dvd_folder=`, `sta_dvd_folder_idx=`,
`sta_dvd_folder_cnt=`. Meldingen: `attach(handler, "KeyDown,CarEvent,Dvd,CarData")`.
Stuurwiel/widget: `hct.dvd.next/last/playpause/stop`.

## Let op

- Het geluid van de tuner en de DVD loopt analoog via de MCU naar de versterker, buiten Android om. De visualizer van
  Klankstroom kan op dat geluid dus niet reageren.
- Alle opdrachten zijn afgeleid uit de stock-apps van dit apparaat (`MTCE_KSP`). Op andere MCU-versies kunnen ze afwijken.

## Bluetooth (HCT/GOC-module, `android.microntek.mtcser`)

Dienst `android.microntek.mtcser/.BlueToothService` (geëxporteerd, geen permissie). Binden met `bindService` en
rauwe `transact` met interfacetoken `android.microntek.mtcser.BTServiceInf`. Transactienummers (1-based, volgorde AIDL):

| nr | methode | nr | methode | nr | methode |
|---|---|---|---|---|---|
| 1 | init | 21 | rejectCall | 41 | deleteBT(String) |
| 2 | getBTState → byte (≥1 = verbonden) | 22 | addCall | 42 | syncMatchList |
| 3 | getAVState → byte | 23 | swichCall | 43 | getMatchList → List |
| 4 | getDialOutNum → String | 24 | mergeCall | 44 | getDeviceList → List |
| 5 | getCallInNum → String | 25 | voiceControl | 45 | getHistoryList → List |
| 6 | getPhoneNum → String | 26 | switchVoice (geluid naar telefoon) | 46 | getPhoneBookList → List |
| 11 | getNowDevAddr → long | 27 | syncPhonebook | 50/51 | musicMute / musicUnmute |
| 12 | getNowDevName → String | 32/34 | setAutoConnect / setAutoAnswer(bool) | 52/53 | scanStart / scanStop |
| 14–18 | avPlay, avPlayPause, avPlayStop, avPlayPrev, avPlayNext | 36 | connectBT(String mac) | 54 | dialOut(String) |
| 19 | answerCall | 37 | disconnectBT | 55 | dialOutSub(char) — DTMF |
| 20 | hangupCall | | | 56 / 57 | reDial / getMusicInfo → "titel\nartiest\nalbum…" |

Broadcast `com.microntek.bt.report` met extras o.a. `connect_state`, `connect_avstate`, `connected_mac`, `music_info`,
`talking_time`, `phonebook_record`; daarnaast `ACTION_HCT_TELPHONE_IN` bij een inkomend gesprek.

## Navigatie-onderdrukking (radio zachter als de navigatie spreekt)

Dit doet de **MCU van de autoradio**, niet de navigatie-app. Hij bewaakt het geluid van de app die als navigatie-app
is ingesteld (`Settings.System` sleutel `gpspkname`) en dempt dan FM/CD/media.

- Navigatie-app instellen: broadcast `com.microntek.setnavi` met extra `pkname` = pakketnaam.
- Parameters (via `setParameters`, opgeslagen in `Settings.System` met de `=`-sleutel): `av_gps_monitor=` (bewaken aan/uit),
  `av_gps_switch=` (mixen), `av_gps_gain=` (navigatievolume), `av_gps_backvol=` (achtergrondvolume tijdens spreken),
  `av_gps_ontop=`, `av_gps_phone=`.
- Klankstroom: Instellingen → *Navigatie maakt de radio zachter* → navigatie-app kiezen.
