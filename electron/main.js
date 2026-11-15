/* Klankstroom — pc-app (Electron).
   Serveert de app via http://127.0.0.1:43117 (nodig voor Spotify-login en service worker-vrije werking),
   leest lokale muziek en scant schijven / CD-station / USB. */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const WWW = path.join(__dirname, '..', 'www');
const AUDIO_RE = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|weba|webm|wma)$/i;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.weba': 'audio/webm', '.webm': 'audio/webm', '.wma': 'audio/x-ms-wma' };

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/* Mappen die de gebruiker zelf heeft gekozen/gescand: alleen daaruit mag /local bestanden geven */
const rootsFile = () => path.join(app.getPath('userData'), 'roots.json');
let roots = [];
const loadRoots = () => { try { roots = JSON.parse(fs.readFileSync(rootsFile(), 'utf8')); } catch { roots = []; } };
const addRoot = r => { r = path.resolve(r); if (!roots.includes(r)) { roots.push(r); fs.writeFileSync(rootsFile(), JSON.stringify(roots)); } };
const allowed = p => AUDIO_RE.test(p) && roots.some(r => path.resolve(p).toLowerCase().startsWith(r.toLowerCase()));

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
    if (range) {
      const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      fs.createReadStream(file).pipe(res);
    }
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/local') {
        const p = u.searchParams.get('p') || '';
        if (!allowed(p)) { res.writeHead(403); return res.end(); }
        return sendFile(req, res, p);
      }
      let rel = decodeURIComponent(u.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.normalize(path.join(WWW, rel));
      if (!file.startsWith(WWW)) { res.writeHead(403); return res.end(); }
      sendFile(req, res, file);
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv.address().port));
  });
}

async function walk(dir, out, depth = 0) {
  if (depth > 14 || out.length > 60000) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$') || /^(System Volume Information|Windows|Program Files.*|ProgramData|AppData|node_modules)$/i.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (AUDIO_RE.test(e.name)) {
      try { const st = await fsp.stat(full); out.push({ path: full, size: st.size }); } catch {}
    }
  }
}

function ps(cmd) {
  return new Promise(res => execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 15000 }, (err, out) => res(err ? '' : out)));
}

async function scanHardware() {
  const result = { musicDir: app.getPath('music'), drives: [] };
  if (process.platform === 'win32') {
    const json = await ps('Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName,Size | ConvertTo-Json -Compress');
    let list = [];
    try { list = JSON.parse(json); if (!Array.isArray(list)) list = [list]; } catch {}
    for (const d of list) {
      const type = { 2: 'removable', 3: 'fixed', 4: 'network', 5: 'cdrom' }[d.DriveType] || 'other';
      const root = d.DeviceID + '\\';
      const drive = { path: root, label: d.VolumeName || '', type, ready: d.Size != null };
      if (type === 'cdrom' && drive.ready) {
        try { const files = await fsp.readdir(root); drive.audioCd = files.filter(f => /\.cda$/i.test(f)).length || 0; } catch { drive.audioCd = 0; }
      }
      result.drives.push(drive);
    }
  } else {
    const bases = process.platform === 'darwin' ? ['/Volumes'] : [`/media/${process.env.USER}`, `/run/media/${process.env.USER}`, '/mnt'];
    for (const b of bases) {
      try { for (const n of await fsp.readdir(b)) result.drives.push({ path: path.join(b, n), label: n, type: 'removable', ready: true }); } catch {}
    }
  }
  return result;
}

let win, port;
async function createWindow() {
  loadRoots();
  try { port = await startServer(43117); } catch { port = await startServer(0); }
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600, backgroundColor: '#0b0f1e', title: 'Klankstroom',
    icon: path.join(WWW, 'icons', 'icon-512.png'), autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      webSecurity: false,                       // streams zonder CORS-headers toch analyseren voor de visualizer
      additionalArguments: ['--ks-port=' + port]
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('https://accounts.spotify.com') || url.startsWith(`http://127.0.0.1:${port}`)) return; // Spotify-login in het venster
    e.preventDefault(); shell.openExternal(url);
  });
  win.loadURL(`http://127.0.0.1:${port}/index.html`);
}

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('scan-folder', async (_e, dir) => { addRoot(dir); const out = []; await walk(dir, out); return out; });
ipcMain.handle('scan-hardware', scanHardware);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
