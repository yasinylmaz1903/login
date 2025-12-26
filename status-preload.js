const { contextBridge, ipcRenderer } = require('electron');

// Hardware Fingerprinting Engelleyici
(() => {
  try {
    const getParameterProxyHandler = {
      apply: function(target, thisArg, args) {
        const parameter = args[0];
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel(R) UHD Graphics 620';
        return Reflect.apply(target, thisArg, args);
      }
    };
    if (typeof WebGLRenderingContext !== 'undefined') {
      WebGLRenderingContext.prototype.getParameter = new Proxy(WebGLRenderingContext.prototype.getParameter, getParameterProxyHandler);
    }
    if (typeof WebGL2RenderingContext !== 'undefined') {
      WebGL2RenderingContext.prototype.getParameter = new Proxy(WebGL2RenderingContext.prototype.getParameter, getParameterProxyHandler);
    }
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4, configurable: true });
    Object.defineProperty(navigator, 'language', { get: () => 'en-US', configurable: true });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
    if (navigator.getBattery) navigator.getBattery = undefined;
    if (navigator.deviceMemory !== undefined) Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0, configurable: true });
  } catch (_err) { /* noop */ }
})();

// Canvas Fingerprinting Engelleyici
(() => {
  try {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    
    function addNoise(imageData) {
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.01) {
          data[i] = data[i] ^ (Math.random() < 0.5 ? 1 : 0);
          data[i + 1] = data[i + 1] ^ (Math.random() < 0.5 ? 1 : 0);
          data[i + 2] = data[i + 2] ^ (Math.random() < 0.5 ? 1 : 0);
        }
      }
      return imageData;
    }
    
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, args);
    };
    
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToBlob.call(this, callback, ...args);
    };
    
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = originalGetImageData.apply(this, args);
      return addNoise(imageData);
    };
  } catch (_err) { /* noop */ }
})();

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
  hideStatusPanel: () => ipcRenderer.send('hide-status-panel'),
  getSessionInfo: () => ipcRenderer.invoke('status-get-session-info'),
  getCookies: () => ipcRenderer.invoke('status-get-cookies'),
  clearAllCookies: () => ipcRenderer.invoke('clear-all-cookies'),
  getLocalStorage: () => ipcRenderer.invoke('status-get-localstorage'),
  getIndexedDB: () => ipcRenderer.invoke('status-get-indexeddb'),
  getCacheInfo: () => ipcRenderer.invoke('status-get-cache-info'),
  getSecurityInfo: () => ipcRenderer.invoke('status-get-security-info'),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  updatePermission: (kind, host, action) => ipcRenderer.invoke('update-permission', { kind, host, action }),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setPrivacyOptions: (options) => ipcRenderer.send('set-privacy-options', options)
});
