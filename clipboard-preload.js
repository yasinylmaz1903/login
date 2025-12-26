const { contextBridge, ipcRenderer } = require('electron');

// Mask legacy Electron globals
(() => {
  try {
    const noopRequire = () => undefined;
    window.electronRequire = noopRequire;
    window.nodeRequire = noopRequire;
    window.require = noopRequire;
    window.module = undefined;
    window.exports = undefined;
    contextBridge.exposeInMainWorld('electronRequire', noopRequire);
    contextBridge.exposeInMainWorld('nodeRequire', noopRequire);
    contextBridge.exposeInMainWorld('require', noopRequire);
  } catch (_err) {
    /* noop */
  }
})();

contextBridge.exposeInMainWorld('browserAPI', {
  hideClipboardPanel: () => ipcRenderer.send('hide-clipboard-panel'),
  clipboardLoad: () => ipcRenderer.invoke('clipboard-load'),
  clipboardSave: (items) => ipcRenderer.send('clipboard-save', items),
  clipboardCopy: (text) => ipcRenderer.send('clipboard-copy', text),
  clipboardClearAll: () => ipcRenderer.send('clipboard-clear-all'),
  onClipboardUpdate: (callback) => ipcRenderer.on('clipboard-update', (_event, data) => callback(data)),
  onClipboardNew: (callback) => ipcRenderer.on('clipboard-new', (_event, item) => callback(item))
});
