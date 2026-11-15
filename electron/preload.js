/* Klankstroom — brug tussen de app (www) en Electron */
const { contextBridge, ipcRenderer } = require('electron');
const port = (process.argv.find(a => a.startsWith('--ks-port=')) || '=43117').split('=')[1];

contextBridge.exposeInMainWorld('native', {
  platform: 'electron',
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanFolder: dir => ipcRenderer.invoke('scan-folder', dir),
  scanHardware: () => ipcRenderer.invoke('scan-hardware'),
  fileUrl: p => `http://127.0.0.1:${port}/local?p=${encodeURIComponent(p)}`
});
