const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  closeNotesWindow: () => ipcRenderer.send('close-notes-window'),
  openSettings: () => ipcRenderer.send('open-settings', 'notes')
});

// Electron clipboard modülünü kullan
contextBridge.exposeInMainWorld('clipboard', {
  writeText: (text) => {
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
});
