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
  emailSwitch: (provider) => ipcRenderer.send('email-switch-provider', provider),
  emailLoad: (url) => ipcRenderer.send('email-load-url', url),
  hideEmailPanel: () => ipcRenderer.send('hide-email-panel'),
  onEmailStatus: (callback) => ipcRenderer.on('email-status', (_event, payload) => callback(payload))
});
