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
  translatorSwitch: (provider) => ipcRenderer.send('translator-switch-provider', provider),
  translatorLoad: (url) => ipcRenderer.send('translator-load-url', url),
  hideTranslatorPanel: () => ipcRenderer.send('hide-translator-panel'),
  onTranslatorStatus: (callback) => ipcRenderer.on('translator-status', (_event, payload) => callback(payload))
});
