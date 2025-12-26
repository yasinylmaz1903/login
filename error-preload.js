const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  retryLoad: (url) => ipcRenderer.send('error-retry-load', url),
  goBack: () => ipcRenderer.send('error-go-back')
});
