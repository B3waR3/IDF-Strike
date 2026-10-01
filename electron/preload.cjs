const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('idfApp', {
  setDisplay: (mode) => ipcRenderer.invoke('set-display', mode),
});
contextBridge.exposeInMainWorld('idfNet', {
  host: () => ipcRenderer.invoke('net-host'),
  mission: (url) => ipcRenderer.invoke('net-mission', url),
  connect: (url) => ipcRenderer.invoke('net-connect', url),
  stop: () => ipcRenderer.invoke('net-stop'),
  send: (payload) => ipcRenderer.send('net-send', payload),
  onMessage: (cb) => {
    const fn = (_event, msg) => cb(msg);
    ipcRenderer.on('net-msg', fn);
    return () => ipcRenderer.removeListener('net-msg', fn);
  },
});
