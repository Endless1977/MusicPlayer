# 🎵 Klankstroom — muziekspeler voor pc en Android

Eén app voor **radio**, **legale gratis muziek**, **je eigen (betaalde) accounts** en **muziek op je apparaat** — met een 3D-visualizer en screensaver die op de muziek reageren. Gemaakt door **Endless**.

![wapen](www/icons/wapen.svg)

**⬇ Downloads:** [Releases → latest](https://github.com/Endless1977/MusicPlayer/releases/latest)
· [Klankstroom.apk (Android)](https://github.com/Endless1977/MusicPlayer/releases/latest/download/Klankstroom.apk)
· [Klankstroom-Setup.exe (Windows)](https://github.com/Endless1977/MusicPlayer/releases/latest/download/Klankstroom-Setup.exe)
· [webversie](https://endless1977.github.io/MusicPlayer/)

## Wat zit erin

| Onderdeel | Wat het doet |
|---|---|
| 📻 **Radio** | ±50.000 zenders uit de open [Radio Browser](https://www.radio-browser.info)-database. Zoeken op naam, land en genre. Eigen stream-URL’s (mp3/aac/m3u/pls/HLS) kun je plakken. Kapotte zenders worden standaard verborgen. |
| 🔎 **Zoeken** | Zoekt tegelijk in legale bronnen: **Audius** (gratis), **Internet Archive** (publiek domein / CC / live-opnames), **Jamendo** (CC, gratis client-ID) en je gekoppelde accounts. |
| 🔗 **Accounts** | **Spotify** (Premium, PKCE-login; op de pc speelt het in de app, op Android via Spotify Connect), **Navidrome/Subsonic** (je eigen muziekserver, bijv. op de Pi), **Jamendo**, **Audius**. Deezer/Apple Music/YouTube Music/Tidal hebben geen open afspeel-API; die openen in hun eigen app. |
| 💽 **Bibliotheek** | Lokale muziek met ID3-titels en -hoezen. Werkt **volledig offline**. |
| 📡 **Scanknop** | **Android:** interne opslag, **SD-kaart**, USB-sticks, **USB-CD-speler**, de ingebouwde **FM-radio**-app van je telefoon en audio-ingangen. **Pc:** alle schijven, USB/SD, **CD-station** en de map Muziek. |
| 🌀 **Visualizer** | Zes 3D-scènes in de stijl van vizz.fm (**Mesh Grid, Pulserende bol, Audiotunnel, Cycloonogen, Gloeiende roos, Gletsjerspiraal**), elk met **16 varianten**, plus klassieke feedback-effecten in de stijl van Drempels/Milkdrop. Met de knop 🌀 zet je hem **aan/uit**. |
| 🖥 **Screensaver** | Na een instelbare tijd zonder bediening verschijnt de visualizer schermvullend, met titel en klok. Zet je hem aan of uit met de knop 🖥 of in Instellingen. |

### Sneltoetsen (pc)
`spatie` afspelen/pauze · `N`/`P` volgende/vorige · `V` visualizer aan/uit · `M` volgende stijl · `[` `]` variant · `F` volledig scherm · `S` screensaver nu

## Downloaden

Bij elke push naar `main` bouwt **GitHub Actions** alles automatisch en zet het op [Releases → latest](https://github.com/Endless1977/MusicPlayer/releases/latest):

| Platform | Bestand |
|---|---|
| Android | `Klankstroom.apk`: downloaden en installeren (sta “onbekende bronnen” toe). Een nieuwe versie installeert over de oude heen; je bibliotheek en instellingen blijven bewaard. |
| Windows | `Klankstroom-Setup.exe` (installer) of `Klankstroom-portable.exe` |
| Web | https://endless1977.github.io/MusicPlayer/ |

De APK is ondertekend met de sleutel in `signing/`. Die sleutel staat openbaar in de repo: prima voor eigen gebruik, maar niet geschikt voor de Play Store.

## Zelf bouwen

```bash
npm install
npm start                 # pc-app (Electron)
npm run dist:win          # Windows-installer in dist/
npm run android:add       # Android-project maken + eigen plugin erin
npx cap open android      # openen in Android Studio
```

De webversie draait met elke statische server: `npx http-server www`.

## Goed om te weten

- **Visualizer bij radio:** veel radiostreams sturen geen CORS-headers. In de browser kan de app het geluid van zulke streams dan niet analyseren, en volgt de visualizer een gesimuleerd ritme. In de pc-app en voor lokale bestanden reageert hij altijd op het echte geluid.
- **Audio-CD’s:** Windows en Android geven CD-audio (CDDA) niet als bestand vrij. Data-CD’s met MP3’s werken wel. Een losse CD-speler of radio kun je via een **lijn-ingang** laten meespelen (scanknop → Audio-ingangen).
- **FM-radio:** Android heeft geen standaard-API voor de FM-chip. De app zoekt de FM-app van de fabrikant (Samsung, Xiaomi, Motorola, Qualcomm/OnePlus, enz.) en opent die. De meeste nieuwe telefoons hebben geen FM meer.
- **Spotify:** maak een gratis app op developer.spotify.com en vul de Client-ID en Redirect-URI in die op de Accounts-pagina staan (pc: `http://127.0.0.1:43117/index.html`, Android: `nl.endless.klankstroom://spotify`).
- Je inloggegevens blijven alleen op je eigen apparaat.

## Structuur

```
www/                 de app (HTML/CSS/JS), gedeeld door web, pc en Android
  js/visualizer.js   audio-analyse + klassieke WebGL-feedbackeffecten
  js/viz3d.js        3D-scènes (three.js + bloom)
  js/player.js       speler, wachtrij, CORS-terugval, Media Session
  js/radio.js        Radio Browser
  js/sources.js      Audius, Internet Archive, Jamendo
  js/accounts.js     Spotify, Navidrome/Subsonic
  js/library.js      lokale bibliotheek (IndexedDB)
  js/scan.js         scanknop
electron/            pc-app
android-plugin/      Java: MediaScan-plugin + achtergrond-afspeeldienst
scripts/patch-android.js
.github/workflows/build.yml
```

Gebruikt [three.js](https://threejs.org) (MIT) en [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0).
