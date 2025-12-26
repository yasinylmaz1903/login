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
    // Canvas API'sini override et - fingerprinting'i engelle
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    
    // Her çağrıda rastgele noise ekle - böylece her seferinde farklı hash üretilir
    function addNoise(imageData) {
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // %1 oranında rastgele piksel değişikliği - görsel olarak fark edilmez
        if (Math.random() < 0.01) {
          data[i] = data[i] ^ (Math.random() < 0.5 ? 1 : 0);     // R
          data[i + 1] = data[i + 1] ^ (Math.random() < 0.5 ? 1 : 0); // G
          data[i + 2] = data[i + 2] ^ (Math.random() < 0.5 ? 1 : 0); // B
        }
      }
      return imageData;
    }
    
    // toDataURL override - fingerprinting metodlarından biri
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, args);
    };
    
    // toBlob override
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToBlob.call(this, callback, ...args);
    };
    
    // getImageData override
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = originalGetImageData.apply(this, args);
      return addNoise(imageData);
    };
    
    console.log('🛡️ Canvas Fingerprinting Koruması Aktif');
  } catch (err) {
    console.warn('Canvas koruma hatası:', err);
  }
})();

// Mask legacy Electron globals with harmless no-ops so renderer scripts that probe
// for them don't crash (they'll just get undefined back).
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
  // Custom Notification System
  showNotification: (options) => ipcRenderer.invoke('show-custom-notification', options),
  getNotificationSettings: () => ipcRenderer.invoke('get-notification-settings'),
  setNotificationSettings: (settings) => ipcRenderer.invoke('set-notification-settings', settings),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  
  createTab: (side, tabId, url) => ipcRenderer.send('create-tab', side, tabId, url),
  activateTab: (side, tabId) => ipcRenderer.send('activate-tab', side, tabId),
  closeTab: (side, tabId) => ipcRenderer.send('close-tab', side, tabId),
  muteTab: (side, tabId, mute) => ipcRenderer.send('mute-tab', side, tabId, mute),
  load: (side, url) => ipcRenderer.send(`load-${side}`, url),
  back: (side) => ipcRenderer.send(`back-${side}`),
  forward: (side) => ipcRenderer.send(`forward-${side}`),
  reload: (side) => ipcRenderer.send(`reload-${side}`),
  setSplit: (ratio) => ipcRenderer.send('set-split', ratio),
  getSplit: () => ipcRenderer.invoke('get-split'),
  getPanelSize: () => ipcRenderer.invoke('get-panel-size'),
  setPanelSize: (size) => ipcRenderer.invoke('set-panel-size', size),
  setSidebarWidth: (width) => ipcRenderer.send('set-sidebar-width', width),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setAllowTelegramSession: (enabled) => ipcRenderer.send('set-allow-telegram-session', enabled),
  getTelegramSessionInfo: () => ipcRenderer.invoke('get-telegram-session-info'),
  getTelegramStorageData: () => ipcRenderer.invoke('get-telegram-storage-data'),
  clearTelegramSession: () => ipcRenderer.invoke('clear-telegram-session'),
  toggleTelegramWindow: () => ipcRenderer.send('toggle-telegram-window'),
  hideTelegramWindow: () => ipcRenderer.send('hide-telegram-window'),
  setAllowChatgptCookies: (enabled) => ipcRenderer.send('set-allow-chatgpt-cookies', enabled),
  setPrivacyOptions: (options) => ipcRenderer.send('set-privacy-options', options),
  setSessionOptions: (options) => ipcRenderer.send('set-session-options', options),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),
  updatePermission: (payload) => ipcRenderer.send('update-permission', payload),
  onPermissionsUpdated: (callback) => ipcRenderer.on('permissions-updated', (_event, payload) => callback(payload)),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  downloadAction: (payload) => ipcRenderer.invoke('download-action', payload),
  openDownload: (savePath) => ipcRenderer.invoke('open-download', savePath),
  openDownloadFolder: (savePath) => ipcRenderer.invoke('open-download-folder', savePath),
  openSettings: (section) => ipcRenderer.send('open-settings', section),
  getSiteInfo: (side) => ipcRenderer.invoke('get-site-info', { side }),
  toggleSiteInfo: (payload) => ipcRenderer.send('toggle-site-info', payload),
  closeSiteInfo: () => ipcRenderer.send('close-site-info'),
  onSiteInfoRefresh: (callback) => ipcRenderer.on('site-info-refresh', (_event, payload) => callback(payload)),

  toggleZoomMenu: (payload) => ipcRenderer.send('toggle-zoom-menu', payload),
  closeZoomMenu: () => ipcRenderer.send('close-zoom-menu'),
  onZoomMenuRefresh: (callback) => ipcRenderer.on('zoom-menu-refresh', (_event, payload) => callback(payload)),
  
  toggleTabOverflow: (payload) => ipcRenderer.send('toggle-tab-overflow', payload),
  closeTabOverflow: () => ipcRenderer.send('close-tab-overflow'),
  onTabOverflowRefresh: (callback) => ipcRenderer.on('tab-overflow-refresh', (_event, payload) => callback(payload)),
  getOverflowTabs: (side) => ipcRenderer.invoke('get-overflow-tabs', side),
  sendMessage: (channel, payload) => ipcRenderer.send(channel, payload),
  
  getCookieStats: () => ipcRenderer.invoke('get-cookie-stats'),
  clearCookiesForHost: (host) => ipcRenderer.invoke('clear-cookies-for-host', host),
  getCookiesForHost: (host) => ipcRenderer.invoke('get-cookies-for-host', host),
  getAllowHosts: () => ipcRenderer.invoke('get-allow-hosts'),
  addAllowHost: (host) => ipcRenderer.invoke('add-allow-host', host),
  removeAllowHost: (host) => ipcRenderer.invoke('remove-allow-host', host),
  getActiveHosts: () => ipcRenderer.invoke('get-active-hosts'),
  clearAllCookies: () => ipcRenderer.invoke('clear-all-cookies'),
  openPanelWindow: () => ipcRenderer.send('open-panel-window'),
  openNotesWindow: () => ipcRenderer.send('open-notes-window'),
  toggleNotesWindow: () => ipcRenderer.send('toggle-notes-window'),
  closeNotesWindow: () => ipcRenderer.send('close-notes-window'),
  togglePanelWindow: () => ipcRenderer.send('toggle-panel-window'),
  openTelegramPanel: () => ipcRenderer.send('open-telegram-panel'),
  hideTelegram: () => ipcRenderer.send('hide-telegram-window'),
  openAiPanel: () => ipcRenderer.send('open-ai-panel'),
  hideAiPanel: () => ipcRenderer.send('hide-ai-panel'),
  aiSwitch: (provider) => ipcRenderer.send('ai-switch-provider', provider),
  aiLoad: (url) => ipcRenderer.send('ai-load-url', url),
  aiResetSessions: () => ipcRenderer.invoke('ai-reset-sessions'),
  aiClearCookies: () => ipcRenderer.invoke('ai-clear-cookies'),
  openEmailPanel: () => ipcRenderer.send('open-email-panel'),
  hideEmailPanel: () => ipcRenderer.send('hide-email-panel'),
  emailSwitch: (provider) => ipcRenderer.send('email-switch-provider', provider),
  emailLoad: (url) => ipcRenderer.send('email-load-url', url),
  openStatusPanel: () => ipcRenderer.send('open-status-panel'),
  hideStatusPanel: () => ipcRenderer.send('hide-status-panel'),
  openClipboardPanel: () => ipcRenderer.send('open-clipboard-panel'),
  hideClipboardPanel: () => ipcRenderer.send('hide-clipboard-panel'),
  clipboardLoad: () => ipcRenderer.invoke('clipboard-load'),
  clipboardSave: (items) => ipcRenderer.send('clipboard-save', items),
  clipboardCopy: (text) => ipcRenderer.send('clipboard-copy', text),
  openTranslatorPanel: () => ipcRenderer.send('open-translator-panel'),
  hideTranslatorPanel: () => ipcRenderer.send('hide-translator-panel'),
  translatorSwitch: (provider) => ipcRenderer.send('translator-switch-provider', provider),
  translatorLoad: (url) => ipcRenderer.send('translator-load-url', url),
  openCalendarPanel: () => ipcRenderer.send('open-calendar-panel'),
  hideCalendarPanel: () => ipcRenderer.send('hide-calendar-panel'),
  calendarLoadAlarms: () => ipcRenderer.invoke('calendar-load-alarms'),
  calendarSaveAlarms: (alarms) => ipcRenderer.send('calendar-save-alarms', alarms),
  closePanelWindow: () => ipcRenderer.send('close-panel-window'),
  setUiZoom: (factor) => ipcRenderer.send('set-ui-zoom', factor),
  setViewsVisible: (visible) => ipcRenderer.send('set-views-visible', visible),
  onTelegramBadge: (callback) => ipcRenderer.on('telegram-badge', (_event, count) => callback(count)),
  onAiStatus: (callback) => ipcRenderer.on('ai-status', (_event, payload) => callback(payload)),
  onEmailStatus: (callback) => ipcRenderer.on('email-status', (_event, payload) => callback(payload)),
  onClipboardUpdate: (callback) => ipcRenderer.on('clipboard-update', (_event, data) => callback(data)),
  onClipboardNew: (callback) => ipcRenderer.on('clipboard-new', (_event, item) => callback(item)),
  onTranslatorStatus: (callback) => ipcRenderer.on('translator-status', (_event, payload) => callback(payload)),
  onCalendarAlarmActive: (callback) => ipcRenderer.on('calendar-alarm-active', (_event, active) => callback(active)),
  openTabContextMenu: (payload) => ipcRenderer.invoke('tab-context-menu', payload),
  onTabMenuCommand: (callback) => ipcRenderer.on('tab-menu-command', (_event, payload) => callback(payload)),
  onOpenNewTab: (callback) => ipcRenderer.on('open-new-tab', (_event, payload) => callback(payload)),
  onSplitUpdated: (callback) => ipcRenderer.on('split-updated', (_event, ratio) => callback(ratio)),
  onShowTelegram: (callback) => ipcRenderer.on('show-telegram', callback),
  onUrlUpdate: (side, callback) => {
    const channel = `url-updated-${side}`;
    ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
  onLoadingStart: (side, callback) => {
    const channel = `loading-start-${side}`;
    ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
  onLoadingStop: (side, callback) => {
    const channel = `loading-stop-${side}`;
    ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
  zoomIn: (side) => ipcRenderer.send('zoom-in', side),
  zoomOut: (side) => ipcRenderer.send('zoom-out', side),
  zoomReset: (side) => ipcRenderer.send('zoom-reset', side),
  getZoom: (side) => ipcRenderer.invoke('zoom-get', side),
  onZoomUpdate: (side, callback) => {
    const channel = `zoom-updated-${side}`;
    ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
  onTitleUpdate: (side, callback) => {
    const channel = `title-updated-${side}`;
    ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
  onCleanup: (callback) => ipcRenderer.on('cleanup-complete', callback),
  onExitProgress: (callback) => ipcRenderer.on('exit-progress', (_event, payload) => callback(payload)),
  onDownloadsUpdated: (callback) => ipcRenderer.on('downloads-updated', (_event, list) => callback(list)),

  // Find In Page
  findInPage: (side, query, options) => ipcRenderer.send('find-in-page', side, query, options),
  stopFindInPage: (side) => ipcRenderer.send('stop-find-in-page', side),
  onFindResult: (callback) => ipcRenderer.on('find-result', (_event, result) => callback(result)),

  // Standalone window toolbar controls
  goBack: () => ipcRenderer.send('standalone-go-back'),
  goForward: () => ipcRenderer.send('standalone-go-forward'),
  standaloneReload: () => ipcRenderer.send('standalone-reload'),
  loadURL: (url) => ipcRenderer.send('standalone-load-url', url),
  standaloneZoomIn: () => ipcRenderer.send('standalone-zoom-in'),
  standaloneZoomOut: () => ipcRenderer.send('standalone-zoom-out'),
  standaloneZoomReset: () => ipcRenderer.send('standalone-zoom-reset'),
  openStandaloneZoomMenu: (payload) => ipcRenderer.send('open-standalone-zoom-menu', payload),
  openStandaloneSiteInfo: (payload) => ipcRenderer.send('open-standalone-site-info', payload),
  getStandaloneSiteInfo: () => ipcRenderer.invoke('get-standalone-site-info'),
  onNavigate: (callback) => ipcRenderer.on('standalone-navigate', (_event, url) => callback(url)),
  onNavState: (callback) => ipcRenderer.on('standalone-nav-state', (_event, state) => callback(state)),
  onStandaloneZoomUpdate: (callback) => ipcRenderer.on('standalone-zoom-update', (_event, factor) => callback(factor)),
  onStandaloneSiteInfoRefresh: (callback) => ipcRenderer.on('standalone-site-info-refresh', callback),
  onStandaloneLoadStart: (callback) => ipcRenderer.on('standalone-load-start', callback),
  onStandaloneLoadStop: (callback) => ipcRenderer.on('standalone-load-stop', callback),
  onStandaloneTitleUpdate: (callback) => ipcRenderer.on('standalone-title-update', (_event, title) => callback(title)),
  standaloneWindowMinimize: () => ipcRenderer.send('standalone-window-minimize'),
  standaloneWindowMaximize: () => ipcRenderer.send('standalone-window-maximize'),
  standaloneWindowClose: () => ipcRenderer.send('standalone-window-close'),

  // Custom context menu
  onShowContextMenu: (callback) => ipcRenderer.on('display-context-menu', (_event, data) => callback(data)),

  // Auth
  authLogin: (payload) => ipcRenderer.invoke('auth-login', payload),
  getAuthConfig: () => ipcRenderer.invoke('auth-get'),
  setAuthConfig: (payload) => ipcRenderer.invoke('auth-set', payload),
  
  // OGame credentials
  saveOGameCredentials: (payload) => ipcRenderer.invoke('save-ogame-credentials', payload),
  getOGameCredentials: () => ipcRenderer.invoke('get-ogame-credentials'),

  // Login window controls
  loginWindowMinimize: () => ipcRenderer.invoke('login-window-minimize'),
  loginWindowClose: () => ipcRenderer.invoke('login-window-close')
});

// User window custom title bar controls
contextBridge.exposeInMainWorld('userWindowAPI', {
  minimize: () => ipcRenderer.invoke('user-window-minimize'),
  maximize: () => ipcRenderer.invoke('user-window-maximize'),
  close: () => ipcRenderer.invoke('user-window-close'),
  onTitleUpdate: (callback) => ipcRenderer.on('user-title-update', (_event, title) => callback(title))
});
