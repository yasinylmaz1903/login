// With contextIsolation: false, we can directly write to window object.
// Provide Electron stubs so sites calling require('electron') or window.electron work.

// Storage Engelleyici - storageEnabled ayarı kapalıysa localStorage/sessionStorage/indexedDB'yi devre dışı bırak
(() => {
  // Ayar kontrolü için ipcRenderer lazım ama contextIsolation:false'ta direkt electron'a erişebiliriz
  let storageEnabled = true; // varsayılan true
  
  try {
    const { ipcRenderer } = require('electron');
    
    // Ayarları al
    ipcRenderer.invoke('get-settings').then(settings => {
      if (settings && typeof settings.storageEnabled === 'boolean') {
        storageEnabled = settings.storageEnabled;
        if (!storageEnabled) {
          disableStorage();
        }
      }
    }).catch(() => {});
    
    // Ayar değiştiğinde dinle
    ipcRenderer.on('session-options-updated', (_event, options) => {
      if (typeof options?.storageEnabled === 'boolean') {
        storageEnabled = options.storageEnabled;
        if (!storageEnabled) {
          disableStorage();
        } else {
          // Storage yeniden etkinleştirildiğinde sayfayı yenile
          location.reload();
        }
      }
    });
  } catch (_err) {
    // ipcRenderer'a erişilemezse storage'ı etkin tut
  }
  
  function disableStorage() {
    try {
      // localStorage ve sessionStorage'ı no-op yap
      const noopStorage = {
        length: 0,
        clear: () => {},
        getItem: () => null,
        key: () => null,
        removeItem: () => {},
        setItem: () => {}
      };
      
      Object.defineProperty(window, 'localStorage', {
        get: () => noopStorage,
        configurable: false
      });
      Object.defineProperty(window, 'sessionStorage', {
        get: () => noopStorage,
        configurable: false
      });
      
      // indexedDB'yi devre dışı bırak
      Object.defineProperty(window, 'indexedDB', {
        get: () => undefined,
        configurable: false
      });
      
      // Cache API'yi devre dışı bırak
      if (window.caches) {
        Object.defineProperty(window, 'caches', {
          get: () => undefined,
          configurable: false
        });
      }
    } catch (_err) {
      console.warn('Storage engellenemedi:', _err);
    }
  }
})();

// Hardware Fingerprinting Engelleyici - Donanım bilgilerini maskele
(() => {
  try {
    // 1. GPU Maskeleme (WebGL)
    const getParameterProxyHandler = {
      apply: function(target, thisArg, args) {
        const parameter = args[0];
        // GPU renderer ve vendor bilgilerini maskele
        if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
          return 'Intel Inc.';
        }
        if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
          return 'Intel(R) UHD Graphics 620';
        }
        return Reflect.apply(target, thisArg, args);
      }
    };

    // WebGL ve WebGL2 için proxy
    if (typeof WebGLRenderingContext !== 'undefined') {
      WebGLRenderingContext.prototype.getParameter = new Proxy(
        WebGLRenderingContext.prototype.getParameter,
        getParameterProxyHandler
      );
    }
    if (typeof WebGL2RenderingContext !== 'undefined') {
      WebGL2RenderingContext.prototype.getParameter = new Proxy(
        WebGL2RenderingContext.prototype.getParameter,
        getParameterProxyHandler
      );
    }

    // 2. CPU Çekirdek Sayısı Maskeleme
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
      configurable: true
    });

    // 3. Dil Maskeleme
    Object.defineProperty(navigator, 'language', {
      get: () => 'en-US',
      configurable: true
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true
    });

    // 4. Battery API Engelleme
    if (navigator.getBattery) {
      navigator.getBattery = undefined;
    }

    // 5. Device Memory Maskeleme
    if (navigator.deviceMemory !== undefined) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true
      });
    }

    // 6. Max Touch Points Maskeleme
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
      configurable: true
    });

    // 7. Saat Dilimi Maskeleme (UTC ama görünürde farklı göster)
    const originalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(...args) {
      const options = args[1] || {};
      // Eğer timeZone belirtilmemişse en yaygın değeri kullan
      if (!options.timeZone) {
        options.timeZone = 'America/New_York'; // Çok yaygın saat dilimi
      }
      return new originalDateTimeFormat(args[0], options);
    };
    Intl.DateTimeFormat.prototype = originalDateTimeFormat.prototype;

    // 8. Ekran Çözünürlüğü Maskeleme
    Object.defineProperty(screen, 'width', {
      get: () => 1920,
      configurable: true
    });
    Object.defineProperty(screen, 'height', {
      get: () => 1080,
      configurable: true
    });
    Object.defineProperty(screen, 'availWidth', {
      get: () => 1920,
      configurable: true
    });
    Object.defineProperty(screen, 'availHeight', {
      get: () => 1040, // Taskbar için biraz eksik
      configurable: true
    });
    Object.defineProperty(screen, 'colorDepth', {
      get: () => 24,
      configurable: true
    });
    Object.defineProperty(screen, 'pixelDepth', {
      get: () => 24,
      configurable: true
    });

    // 9. Timezone Offset Maskeleme
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function() {
      return -300; // EST timezone (UTC-5)
    };

  } catch (_err) { /* noop */ }
})();

// Canvas Fingerprinting Engelleyici - sayfa scriptlerinden ÖNCE çalışır
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

// Inject script into page context BEFORE any page scripts load
const script = document.createElement('script');
script.textContent = `
(function() {
  const version = '1.0.0';
  const noop = () => undefined;
  const noopPromise = async () => undefined;
  
  const noopIpc = {
    on: () => noopIpc,
    once: () => noopIpc,
    removeListener: () => noopIpc,
    removeAllListeners: () => noopIpc,
    send: noop,
    invoke: noopPromise,
    postMessage: noop,
    sendSync: noop
  };
  
  const electronStub = {
    ipcRenderer: noopIpc,
    shell: {},
    clipboard: {},
    desktopAppVersion: version,
    desktopApp: { version }
  };
  
  // Override require at the earliest possible moment
  const originalRequire = window.require;
  window.require = function(moduleName) {
    if (!moduleName || moduleName === 'electron') {
      return electronStub;
    }
    if (typeof originalRequire === 'function') {
      return originalRequire.apply(this, arguments);
    }
    return electronStub;
  };
  
  window.electron = electronStub;
  window.electronRequire = window.require;
  window.desktopAppVersion = version;
  window.desktopApp = { version };
  
})();
`;

// Insert at the very start of <head> or <html>
if (document.documentElement) {
  document.documentElement.insertBefore(script, document.documentElement.firstChild);
  script.remove();
}

const version = '1.0.0';
const noop = () => undefined;
const noopPromise = async () => undefined;

const noopIpc = {
  on: () => noopIpc,
  once: () => noopIpc,
  removeListener: () => noopIpc,
  removeAllListeners: () => noopIpc,
  send: noop,
  invoke: noopPromise,
  postMessage: noop,
  sendSync: noop
};

const electronStub = {
  ipcRenderer: noopIpc,
  shell: {},
  clipboard: {},
  desktopAppVersion: version,
  desktopApp: { version }
};

const shimRequire = (moduleName) => {
  if (!moduleName || moduleName === 'electron') return electronStub;
  return electronStub;
};

// Write to all possible locations with non-configurable properties
try {
  // Use defineProperty to make these harder to override
  Object.defineProperty(window, 'electronRequire', { value: shimRequire, writable: true, configurable: true });
  Object.defineProperty(window, 'nodeRequire', { value: shimRequire, writable: true, configurable: true });
  Object.defineProperty(window, 'require', { value: shimRequire, writable: true, configurable: true });
  Object.defineProperty(window, 'electron', { value: electronStub, writable: true, configurable: true });
  Object.defineProperty(window, 'ipcRenderer', { value: electronStub.ipcRenderer, writable: true, configurable: true });
  Object.defineProperty(window, 'desktopAppVersion', { value: version, writable: true, configurable: true });
  Object.defineProperty(window, 'desktopApp', { value: { version }, writable: true, configurable: true });
  
  Object.defineProperty(globalThis, 'electronRequire', { value: shimRequire, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'nodeRequire', { value: shimRequire, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'require', { value: shimRequire, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'electron', { value: electronStub, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'ipcRenderer', { value: electronStub.ipcRenderer, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'desktopAppVersion', { value: version, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'desktopApp', { value: { version }, writable: true, configurable: true });
  
  // Also create a module cache that Webpack might check
  if (!window.__webpack_modules__) {
    window.__webpack_modules__ = {};
  }
  window.__webpack_modules__['electron'] = { exports: electronStub };
  
  
  // Intercept Webpack require at runtime by patching the global __webpack_require__
  const originalRequire = window.require;
  const patchedRequire = function(moduleId) {
    if (moduleId === 'electron' || !moduleId) {
      return electronStub;
    }
    if (typeof originalRequire === 'function') {
      return originalRequire.apply(this, arguments);
    }
    return electronStub;
  };
  
  Object.defineProperty(window, 'require', { 
    get: () => {
      return patchedRequire;
    },
    set: (val) => {
    },
    configurable: true 
  });
  
  // Intercept webpack chunk loading to inject electron module BEFORE any code runs
  const setupWebpackInterceptor = () => {
    // Find webpack chunk array (commonly named webpackChunk<name>)
    const chunkArrayNames = Object.keys(window).filter(k => k.startsWith('webpackChunk'));
    
    chunkArrayNames.forEach(chunkName => {
      const chunkArray = window[chunkName];
      if (Array.isArray(chunkArray)) {
        // Wrap the push method to inject our module into every chunk
        const originalPush = chunkArray.push.bind(chunkArray);
        chunkArray.push = function(...args) {
          
          // Each chunk is typically [chunkIds, modules, runtime]
          if (args[0] && args[0][1]) {
            const modules = args[0][1];
            
            // Inject our electron module
            modules['electron'] = function(module, exports, __webpack_require__) {
              module.exports = electronStub;
            };
          }
          
          return originalPush(...args);
        };
      }
    });
  };
  
  // Also patch module cache if it exists
  const patchWebpack = () => {
    
    if (window.__webpack_modules__) {
      // Inject as CommonJS module factory
      window.__webpack_modules__['electron'] = function(module, exports, __webpack_require__) {
        module.exports = electronStub;
      };
    }
  };
  
  // Setup interceptor immediately
  setupWebpackInterceptor();
  
  // Try immediately
  patchWebpack();
  
  // Try again after DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      patchWebpack();
    });
  }
  
  // And keep trying for a bit
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    patchWebpack();
    if (attempts > 10) clearInterval(interval);
  }, 100);
  
} catch (err) {
  console.error('[PRELOAD] Failed to inject stubs:', err);
}
