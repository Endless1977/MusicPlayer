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
