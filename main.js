function toggleTelegramWindow() {
  if (telegramWindow && !telegramWindow.isDestroyed()) {
    // If renderer crashed/hung, recreate.
    try {
      if (telegramWindow.webContents?.isCrashed?.()) {
        forceRecreateTelegramWindow('webContents crashed');
        return;
      }
    } catch (_err) {
      /* ignore */
    }
    if (telegramWindow.isVisible()) {
      telegramWindow.hide();
    } else {
      try { positionTelegramWindow(false); } catch (_err) { /* ignore */ }
      try { telegramWindow.show(); } catch (_err) { /* ignore */ }
      try { telegramWindow.focus(); } catch (_err) { /* ignore */ }
      // Pencere açıldığında bildirimleri temizle
      telegramNotifications.clear();
    }
    return;
  }
  openTelegramWindow();
}

function hideTelegramWindow() {
  if (telegramWindow && !telegramWindow.isDestroyed() && telegramWindow.isVisible()) {
    try { telegramWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function toggleAiPanelWindow() {
  if (aiWindow && !aiWindow.isDestroyed()) {
    if (aiWindow.isVisible()) {
      try { aiWindow.hide(); } catch (_err) { /* ignore */ }
    } else {
      try { positionAiPanelWindow(false); } catch (_err) { /* ignore */ }
      try { aiWindow.show(); } catch (_err) { /* ignore */ }
      try { aiWindow.focus(); } catch (_err) { /* ignore */ }
    }
    return;
  }
  openAiPanelWindow();
}

function hideAiPanelWindow() {
  if (aiWindow && !aiWindow.isDestroyed() && aiWindow.isVisible()) {
    try { aiWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const {
  app,
  BrowserWindow,
  BrowserView,
  session,
  ipcMain,
  Notification,
  dialog,
  Menu,
  shell,
  nativeImage,
  safeStorage,
  globalShortcut,
  screen
} = require('electron');
const { createTempSession, createPermissiveSession, clearSessionData, setCookieAllowList } = require('./src/session/createTempSession');

// --- Auth (only persisted data) ---
let currentRole = null; // 'admin' | 'user' | null
let loginWindow = null;
let userWindow = null;

function canEncryptAuth() {
  try {
    return !!safeStorage?.isEncryptionAvailable?.();
  } catch (_err) {
    return false;
  }
}

function encryptAuthSecret(plain) {
  const value = String(plain ?? '');
  if (!value) return '';
  // Simple Base64 encoding for development (userData gets wiped, safeStorage keys lost)
  try {
    return `b64:${Buffer.from(value, 'utf8').toString('base64')}`;
  } catch (_err) {
    return value;
  }
}

function decryptAuthSecret(maybeEncrypted) {
  const value = String(maybeEncrypted ?? '');
  
  if (!value) return '';
  
  // Handle Base64 encoded passwords
  if (value.startsWith('b64:')) {
    try {
      const b64 = value.slice(4);
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch (_err) {
      return '';
    }
  }
  
  // Handle old safeStorage encrypted passwords (cannot decrypt after userData wipe)
  if (value.startsWith('enc:')) {
    return '';
  }
  
  // Plaintext
  return value;
}

function getAuthFilePath() {
  try {
    // auth.json'u userData dışında, kalıcı bir yerde sakla
    // userData post-exit wipe ile temizleniyor, auth.json kalıcı olmalı
    const appData = process.env.APPDATA || process.env.HOME || os.homedir();
    const authDir = path.join(appData, '.ogame-browser');
    const authPath = path.join(authDir, 'auth.json');
    
    // Dizini oluştur
    try { fs.mkdirSync(authDir, { recursive: true }); } catch (_err) { /* ignore */ }
    
    return authPath;
  } catch (_err) {
    return path.join(__dirname, 'auth.json');
  }
}

function loadAuthConfig() {
  const defaults = {
    admin: { username: 'admin', password: 'admin!asd' },
    user: { username: 'filmkolik', password: '1234' },
    userModeSite: 'https://lobby.ogame.gameforge.com/tr_TR/'
  };
  const filePath = getAuthFilePath();
  try {
    if (!fs.existsSync(filePath)) return defaults;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const admin = parsed?.admin || {};
    const user = parsed?.user || {};

    const adminPassword = admin.passwordEnc
      ? decryptAuthSecret(admin.passwordEnc)
      : String(admin.password || defaults.admin.password);
    const userPassword = user.passwordEnc
      ? decryptAuthSecret(user.passwordEnc)
      : String(user.password || defaults.user.password);

    // Migrate legacy plaintext if needed
    if (canEncryptAuth()) {
      const needsMigration = (!!admin.password && !admin.passwordEnc) || (!!user.password && !user.passwordEnc) || (Number(parsed?.schemaVersion || 0) < 3);
      if (needsMigration) {
        try {
          saveAuthConfig({
            admin: { username: String(admin.username || defaults.admin.username), password: adminPassword || defaults.admin.password },
            user: { username: String(user.username || defaults.user.username), password: userPassword || defaults.user.password },
            userModeSite: String(parsed?.userModeSite || defaults.userModeSite)
          });
        } catch (_err) { /* ignore */ }
      }
    }

    return {
      admin: { username: String(admin.username || defaults.admin.username), password: adminPassword || defaults.admin.password },
      user: { username: String(user.username || defaults.user.username), password: userPassword || defaults.user.password },
      userModeSite: String(parsed?.userModeSite || defaults.userModeSite)
    };
  } catch (_err) {
    return defaults;
  }
}

function saveAuthConfig(next) {
  const filePath = getAuthFilePath();
  const dir = path.dirname(filePath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_err) { /* ignore */ }

  const adminPasswordPlain = String(next?.admin?.password || 'admin!asd');
  const userPasswordPlain = String(next?.user?.password || '1234');
  const adminPasswordEnc = encryptAuthSecret(adminPasswordPlain);
  const userPasswordEnc = encryptAuthSecret(userPasswordPlain);

  const safe = {
    schemaVersion: 3, // Incremented for Base64 format
    admin: {
      username: String(next?.admin?.username || 'admin'),
      passwordEnc: adminPasswordEnc
    },
    user: {
      username: String(next?.user?.username || 'filmkolik'),
      passwordEnc: userPasswordEnc
    },
    userModeSite: String(next?.userModeSite || 'https://www.hdfilmizle.life/')
  };
  fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
  
  // Return config with decrypted passwords for in-memory use
  return {
    admin: {
      username: String(next?.admin?.username || 'admin'),
      password: adminPasswordPlain
    },
    user: {
      username: String(next?.user?.username || 'filmkolik'),
      password: userPasswordPlain
    },
    userModeSite: String(next?.userModeSite || 'https://www.hdfilmizle.life/')
  };
}

let authConfig = loadAuthConfig();

// --- Geo/IP block (admin login) ---
const GEO_BLOCK = {
  enabled: true,
  blockCountryCodes: new Set(['TR']),
  // TODO: Bu URL'yi sizin indirme sayfanızla değiştirin.
  downloadUrl: 'https://www.hdfilmizle.life/',
  message: 'Eski sürüm kullanmaktasınız; yeni sürümü sitemizden indirebilirsiniz.'
};

let geoCache = { at: 0, countryCode: null };

function httpsGetJson(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HDFilmizle/1.0 (Electron)' } }, (res) => {
      let raw = '';
      res.on('data', (d) => { raw += String(d); });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw || '{}');
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error('timeout')); } catch (_err) { /* ignore */ }
    });
  });
}

async function detectCountryCode() {
  const now = Date.now();
  // Cache 5 dk
  if (geoCache.countryCode && (now - geoCache.at) < 5 * 60 * 1000) return geoCache.countryCode;

  const sources = [
    // ipinfo: { country: "TR" }
    async () => {
      const j = await httpsGetJson('https://ipinfo.io/json', 2500);
      return String(j?.country || '').trim().toUpperCase() || null;
    },
    // ipapi: { country_code: "TR" }
    async () => {
      const j = await httpsGetJson('https://ipapi.co/json/', 2500);
      return String(j?.country_code || '').trim().toUpperCase() || null;
    }
  ];

  for (const fn of sources) {
    try {
      const code = await fn();
      if (code) {
        geoCache = { at: now, countryCode: code };
        return code;
      }
    } catch (_err) {
      // try next
    }
  }

  return null;
}

async function isGeoBlockedForAdminLogin() {
  if (!GEO_BLOCK.enabled) return false;
  const code = await detectCountryCode();
  if (!code) return false;
  return GEO_BLOCK.blockCountryCodes.has(code);
}

function verifyLogin(username, password) {
  const u = String(username || '').trim();
  const p = String(password || '').trim();
  
  if (!u || !p) return null;
  if (u === authConfig.admin.username && p === authConfig.admin.password) return 'admin';
  if (u === authConfig.user.username && p === authConfig.user.password) return 'user';
  return null;
}
const { createBrowserView } = require('./src/view/createBrowserView');
const { createDualLayout } = require('./src/view/dualLayout');

// Force no HTTP disk cache and incognito-like mode globally.
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('incognito');
app.commandLine.appendSwitch('lang', 'tr-TR');
// Bazı video siteleri Permissions-Policy ile iframe fullscreen'i kısıtlıyor.
// User modunda video fullscreen çalışsın diye policy enforcement'ı kapatıyoruz.
app.commandLine.appendSwitch('disable-features', 'PermissionsPolicy');
// Not: Remote debugging port intentionally disabled for security/privacy.

const TOOLBAR_HEIGHT = 72;
const TABBAR_HEIGHT = 40;
// Sidebar ships collapsed by default in the UI; align BrowserViews to the same width
// so there is no gap between the sidebar and content at startup.
const SIDEBAR_WIDTH = 52;
const DEFAULT_PANEL_WIDTH = 380;
const DEFAULT_PANEL_HEIGHT = 700;
const TELEGRAM_URL = 'https://web.telegram.org/k/';
const TELEGRAM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TELEGRAM_DRAG_CSS = `
:root { --tg-drag-height: 32px; }
body { padding-top: var(--tg-drag-height) !important; }
.tg-drag-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--tg-drag-height);
  -webkit-app-region: drag;
  background: linear-gradient(180deg, rgba(12,14,18,0.92) 0%, rgba(12,14,18,0.55) 100%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 6px 12px;
  box-sizing: border-box;
  user-select: none;
  pointer-events: auto;
}
.tg-drag-bar .tg-title {
  color: #e6ecff;
  font-family: 'Segoe UI', sans-serif;
  font-size: 12px;
  opacity: 0.9;
}
`;

function parseTelegramCount(title) {
  if (!title) return 0;
  const trimmed = String(title).trim();
  const m = trimmed.match(/[\(\[\{]?\s*(\d+)\s*[\)\]\}]?/);
  if (!m) return 0;
  return Number(m[1]) || 0;
}

const TELEGRAM_UNREAD_JS = `(() => {
  let best = 0;
  const title = (document.title || '').trim();
  const m = title.match(/[\(\[\{]?\s*(\d+)\s*[\)\]\}]?/);
  if (m) best = Math.max(best, parseInt(m[1], 10) || 0);

  const candidates = document.querySelectorAll('[data-testid*="unread"], [class*="unread"], [class*="badge"]');
  candidates.forEach((el) => {
    const txt = (el.textContent || '').trim();
    const n = parseInt(txt, 10);
    if (Number.isFinite(n)) best = Math.max(best, n);
  });

  return best;
})()`;

function clampZoom(val) {
  const f = Number(val);
  if (!Number.isFinite(f)) return 1;
  return Math.min(2, Math.max(0.5, f));
}

function rectOverlap(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return { width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
}

function ensureBoundsOnScreen(bounds) {
  try {
    const displays = screen.getAllDisplays?.() || [];
    const workAreas = displays.map((d) => d.workArea || d.bounds).filter(Boolean);
    const minVisible = 48;
    const visible = workAreas.some((wa) => {
      const o = rectOverlap(bounds, wa);
      return o.width >= minVisible && o.height >= minVisible;
    });
    if (visible) return bounds;

    const wa = (screen.getPrimaryDisplay?.()?.workArea) || workAreas[0];
    if (!wa) return bounds;

    const width = Math.min(bounds.width, wa.width);
    const height = Math.min(bounds.height, wa.height);
    const x = wa.x + Math.round((wa.width - width) / 2);
    const y = wa.y + Math.round((wa.height - height) / 2);
    return { x, y, width, height };
  } catch (_err) {
    return bounds;
  }
}

function forceRecreateTelegramWindow(reason) {
  try { console.warn('[telegram] recreating window:', reason); } catch (_err) { /* ignore */ }
  try { stopTelegramTitlePolling(); } catch (_err) { /* ignore */ }
  try {
    if (telegramWindow && !telegramWindow.isDestroyed()) {
      try { telegramWindow.removeAllListeners(); } catch (_err) { /* ignore */ }
      try { telegramWindow.destroy(); } catch (_err) { /* ignore */ }
    }
  } catch (_err) {
    /* ignore */
  }
  telegramWindow = null;
  telegramReady = false;
  // Reset remembered position so we don't recreate offscreen.
  telegramUserMoved = false;
  telegramPos = { x: null, y: null };
  try { openTelegramWindow(); } catch (_err) { /* ignore */ }
}

const HOME_FILE = path.join(__dirname, 'renderer', 'home.html');
const LEFT_HOME = `file://${HOME_FILE}?side=left`;
const RIGHT_HOME = `file://${HOME_FILE}?side=right`;

let mainWindow;
let layout;

// Çoklu instance'a izin ver.
// Not: Birden fazla instance aynı profile/session dosyalarını paylaşırsa çakışma yaşanabilir.
// Bu projede oturumlar ağırlıkla temp partition kullandığı için genelde sorun çıkmaz.
const ENABLE_SINGLE_INSTANCE_LOCK = false;
let hasSingleInstanceLock = true;

// Single-instance lock devre dışı (çoklu instance serbest).
if (ENABLE_SINGLE_INSTANCE_LOCK) {
  try {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      hasSingleInstanceLock = false;
      app.quit();
    } else {
      app.on('second-instance', () => {
        const win = (mainWindow && !mainWindow.isDestroyed())
          ? mainWindow
          : (loginWindow && !loginWindow.isDestroyed())
            ? loginWindow
            : (userWindow && !userWindow.isDestroyed())
              ? userWindow
              : null;
        if (win) {
          try { if (win.isMinimized()) win.restore(); } catch (_err) { /* ignore */ }
          try { win.show(); } catch (_err) { /* ignore */ }
          try { win.focus(); } catch (_err) { /* ignore */ }
        }
      });
    }
  } catch (_err) {
    /* ignore */
  }
}
let currentSplit = 0.5;
const sessions = {};
const tabViews = {
  left: new Map(),
  right: new Map()
};
const activeTab = {
  left: null,
  right: null
};

// Track BrowserView -> { side, tabId } for error page handling
const viewToTab = new WeakMap();
let allowChatgptCookies = true;
let allowTelegramSession = true;
let blockThirdPartyCookies = false;
let trackingProtection = false;
// false = Gizli mod (RAM'de, oturum kapanınca silinir)
// true = Normal mod (disk'e yazılır, kalıcı)
let persistentSession = false;
// true = Tüm siteler cookie kullanabilir (varsayılan)
// false = Sadece allowlist'teki siteler
let allowAllCookies = true;
let storageEnabled = true;
// memoryCookies kullanılmıyor - persistentSession kontrol eder
let memoryCookies = false;
// Cache: false = gizli mod, true = hızlı yükleme
let cacheEnabled = false;
const permissionStore = {
  camera: { allow: new Set(), deny: new Set() },
  microphone: { allow: new Set(), deny: new Set() },
  geolocation: { allow: new Set(), deny: new Set() },
  notifications: { allow: new Set(), deny: new Set() },
  popups: { allow: new Set(), deny: new Set() }
};
const recentDownloads = [];
const downloadItems = new Map();
let viewsHidden = false;
let settingsWindow = null;
let panelWindow = null;
let panelSize = { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
let panelUserMoved = false;
let panelPos = { x: null, y: null };
let panelReady = false;

let notesWindow = null;
let notesSize = { width: 460, height: DEFAULT_PANEL_HEIGHT };
let notesUserMoved = false;
let notesPos = { x: null, y: null };
let notesReady = false;

function hideNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed() && notesWindow.isVisible()) {
    try { notesWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

let telegramWindow = null;
let telegramSize = { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
let telegramUserMoved = false;
let telegramPos = { x: null, y: null };
let telegramReady = false;
let telegramBadgeCount = 0;
let telegramTitlePoll = null;

let aiWindow = null;
let aiView = null; // backward compat (unused)
let aiViews = null; // { chatgpt: BrowserView, gemini: BrowserView, copilot: BrowserView, grok: BrowserView }
let aiActiveProvider = 'chatgpt';
let aiLoaded = null; // { chatgpt: boolean, gemini: boolean, copilot: boolean, grok: boolean }
let aiSize = { width: 520, height: 740 };
let aiUserMoved = false;
let aiPos = { x: null, y: null };
let aiReady = false;
let aiLastUrl = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/',
  copilot: 'https://copilot.microsoft.com/',
  grok: 'https://grok.com/'
};

let emailWindow = null;
let emailViews = null; // { gmail: BrowserView, hotmail: BrowserView }
let emailActiveProvider = 'gmail';
let emailLoaded = null; // { gmail: boolean, hotmail: boolean }
let emailSize = { width: 520, height: 740 };
let emailUserMoved = false;
let emailPos = { x: null, y: null };
let emailReady = false;
let emailLastUrl = {
  gmail: 'https://mail.google.com/',
  hotmail: 'https://outlook.live.com/'
};

let clipboardWindow = null;
let clipboardHistory = [];
let clipboardSize = { width: 520, height: 740 };
let clipboardUserMoved = false;
let clipboardPos = { x: null, y: null };
let clipboardReady = false;
let clipboardLastText = '';
let clipboardPollInterval = null;

let translatorWindow = null;
let translatorViews = null; // { google: BrowserView, deepl: BrowserView, bing: BrowserView, yandex: BrowserView }
let translatorActiveProvider = 'google';
let translatorLoaded = null; // { google: boolean, deepl: boolean, bing: boolean, yandex: boolean }
let translatorSize = { width: 520, height: 740 };
let translatorUserMoved = false;
let translatorPos = { x: null, y: null };
let translatorReady = false;
let translatorLastUrl = {
  google: 'https://translate.google.com/',
  deepl: 'https://www.deepl.com/translator',
  bing: 'https://www.bing.com/translator',
  yandex: 'https://translate.yandex.com/'
};

let calendarWindow = null;
let calendarAlarms = [];
let calendarSize = { width: 520, height: 740 };
let calendarUserMoved = false;
let calendarPos = { x: null, y: null };
let calendarReady = false;
let calendarCheckInterval = null;
let calendarAlarmNotificationWindow = null;

let statusWindow = null;
let statusSize = { width: 600, height: 800 };
let statusUserMoved = false;
let statusPos = { x: null, y: null };
let statusReady = false;

const AI_BAR_HEIGHT = 44;
const EMAIL_BAR_HEIGHT = 44;
const TRANSLATOR_BAR_HEIGHT = 44;
const MAX_CLIPBOARD_ITEMS = 50;
const AI_DEFAULT_URL = 'https://chatgpt.com/';
const AI_DEFAULTS = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/',
  copilot: 'https://copilot.microsoft.com/',
  grok: 'https://grok.com/'
};

const AI_PARTITIONS = [
  'temp:ai-chatgpt',
  'temp:ai-gemini',
  'temp:ai-copilot',
  'temp:ai-grok',
  // fallback
  'temp:ai'
];

async function clearCookiesOnlyForSession(s) {
  if (!s) return;
  try {
    await s.clearStorageData({ storages: ['cookies'] });
  } catch (_err) {
    /* ignore */
  }
}

async function clearAiCookiesOnly() {
  // Session temizliği
  for (const part of AI_PARTITIONS) {
    try { markPartition(part); } catch (_e) { /* ignore */ }
    try {
      const s = session.fromPartition(part);
      await clearCookiesOnlyForSession(s);
    } catch (_err) {
      /* ignore */
    }
  }

  // AI view'ları yok et ve yeniden yarat
  if (aiViews) {
    try {
      if (aiWindow && !aiWindow.isDestroyed()) {
        aiWindow.setBrowserView(null);
      }
    } catch (_err) { /* ignore */ }

    for (const [prov, view] of Object.entries(aiViews)) {
      try { view?.webContents?.destroy?.(); } catch (_err) { /* ignore */ }
    }

    try {
      aiViews = {
        chatgpt: createAiBrowserView('temp:ai-chatgpt'),
        gemini: createAiBrowserView('temp:ai-gemini'),
        copilot: createAiBrowserView('temp:ai-copilot'),
        grok: createAiBrowserView('temp:ai-grok')
      };
      aiLoaded = { chatgpt: false, gemini: false, copilot: false, grok: false };

      // Aktif provider'ı tekrar attach et
      if (aiWindow && !aiWindow.isDestroyed()) {
        const nextView = aiViews[aiActiveProvider];
        if (nextView) {
          aiWindow.setBrowserView(nextView);
          updateAiViewBounds();
          const url = aiLastUrl[aiActiveProvider] || AI_DEFAULTS[aiActiveProvider] || AI_DEFAULT_URL;
          nextView.webContents.loadURL(url);
        }
      }
    } catch (_err) { /* ignore */ }
  }
}

async function resetAiSessions() {
  // Session temizliği
  for (const part of AI_PARTITIONS) {
    try { markPartition(part); } catch (_e) { /* ignore */ }
    try {
      const s = session.fromPartition(part);
      await clearSessionData(s);
    } catch (_err) {
      /* ignore */
    }
  }

  // URL'leri default'a döndür
  try {
    for (const prov of Object.keys(AI_DEFAULTS)) {
      aiLastUrl[prov] = AI_DEFAULTS[prov];
    }
  } catch (_err) {
    /* ignore */
  }

  // AI view'ları tamamen yok et ve yeniden yarat
  if (aiViews) {
    try {
      if (aiWindow && !aiWindow.isDestroyed()) {
        aiWindow.setBrowserView(null);
      }
    } catch (_err) { /* ignore */ }

    for (const [prov, view] of Object.entries(aiViews)) {
      try { view?.webContents?.destroy?.(); } catch (_err) { /* ignore */ }
    }

    try {
      aiViews = {
        chatgpt: createAiBrowserView('temp:ai-chatgpt'),
        gemini: createAiBrowserView('temp:ai-gemini'),
        copilot: createAiBrowserView('temp:ai-copilot'),
        grok: createAiBrowserView('temp:ai-grok')
      };
      aiLoaded = { chatgpt: false, gemini: false, copilot: false, grok: false };

      // Aktif provider'ı tekrar attach et ve default URL yükle
      if (aiWindow && !aiWindow.isDestroyed()) {
        const nextView = aiViews[aiActiveProvider];
        if (nextView) {
          aiWindow.setBrowserView(nextView);
          updateAiViewBounds();
          const url = AI_DEFAULTS[aiActiveProvider] || AI_DEFAULT_URL;
          nextView.webContents.loadURL(url);
          aiWindow.webContents.send('ai-status', { provider: aiActiveProvider, loading: true });
        }
      }
    } catch (_err) { /* ignore */ }
  }
}

let siteInfoWindow = null;
let siteInfoAnchor = null; // { side, left, bottom }

let zoomMenuWindow = null;
let zoomMenuAnchor = null; // { side, left, bottom }

let tabOverflowWindow = null;
let tabOverflowAnchor = null; // { side, left, bottom }

function getSiteInfoHtmlPath() {
  return path.join(__dirname, 'renderer', 'site-info.html');
}

function getZoomMenuHtmlPath() {
  return path.join(__dirname, 'renderer', 'zoom-menu.html');
}

function getTabOverflowHtmlPath() {
  return path.join(__dirname, 'renderer', 'tab-overflow.html');
}

function hideSiteInfoWindow() {
  if (siteInfoWindow && !siteInfoWindow.isDestroyed()) {
    try { siteInfoWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function hideZoomMenuWindow() {
  if (zoomMenuWindow && !zoomMenuWindow.isDestroyed()) {
    try { zoomMenuWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function positionSiteInfoWindow() {
  if (!siteInfoWindow || siteInfoWindow.isDestroyed() || !mainWindow) return;
  if (!siteInfoAnchor) return;
  const bounds = mainWindow.getContentBounds();
  const width = 360;
  const height = 420;
  const gap = 10;

  let x = bounds.x + Math.round(siteInfoAnchor.left || 0);
  let y = bounds.y + Math.round(siteInfoAnchor.bottom || 0) + gap;

  const display = screen.getDisplayNearestPoint({ x: bounds.x + 10, y: bounds.y + 10 });
  const work = display?.workArea || display?.bounds;
  if (work) {
    const maxX = work.x + work.width - width - 10;
    const maxY = work.y + work.height - height - 10;
    x = Math.max(work.x + 10, Math.min(x, maxX));
    y = Math.max(work.y + 10, Math.min(y, maxY));
  }

  try { siteInfoWindow.setBounds({ x, y, width, height }); } catch (_err) { /* ignore */ }
}

function positionZoomMenuWindow() {
  if (!zoomMenuWindow || zoomMenuWindow.isDestroyed() || !mainWindow) return;
  if (!zoomMenuAnchor) return;

  const bounds = mainWindow.getContentBounds();
  const width = 340;
  const height = 230;
  const gap = 10;

  let x = bounds.x + Math.round(zoomMenuAnchor.left || 0);
  let y = bounds.y + Math.round(zoomMenuAnchor.bottom || 0) + gap;

  const display = screen.getDisplayNearestPoint({ x: bounds.x + 10, y: bounds.y + 10 });
  const work = display?.workArea || display?.bounds;
  if (work) {
    x = Math.max(work.x + 10, Math.min(x, work.x + work.width - width - 10));
    y = Math.max(work.y + 10, Math.min(y, work.y + work.height - height - 10));
  }

  try { zoomMenuWindow.setBounds({ x, y, width, height }); } catch (_err) { /* ignore */ }
}

function ensureSiteInfoWindow() {
  if (siteInfoWindow && !siteInfoWindow.isDestroyed()) return siteInfoWindow;
  siteInfoWindow = new BrowserWindow({
    width: 360,
    height: 420,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    parent: mainWindow,
    modal: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });

  try {
    if (process.platform === 'win32') siteInfoWindow.setAlwaysOnTop(true, 'pop-up-menu');
  } catch (_err) {
    /* ignore */
  }

  siteInfoWindow.on('blur', () => {
    hideSiteInfoWindow();
  });

  siteInfoWindow.on('closed', () => {
    siteInfoWindow = null;
  });

  try {
    siteInfoWindow.loadFile(getSiteInfoHtmlPath(), { query: { side: 'left' } });
  } catch (_err) {
    // ignore
  }
  return siteInfoWindow;
}

function ensureZoomMenuWindow() {
  if (zoomMenuWindow && !zoomMenuWindow.isDestroyed()) return zoomMenuWindow;
  zoomMenuWindow = new BrowserWindow({
    width: 340,
    height: 230,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    parent: mainWindow,
    modal: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });

  try { if (process.platform === 'win32') zoomMenuWindow.setAlwaysOnTop(true, 'pop-up-menu'); } catch (_err) { /* ignore */ }

  zoomMenuWindow.on('blur', () => {
    hideZoomMenuWindow();
  });

  zoomMenuWindow.on('closed', () => {
    zoomMenuWindow = null;
  });

  try { zoomMenuWindow.loadFile(getZoomMenuHtmlPath(), { query: { side: 'left' } }); } catch (_err) { /* ignore */ }
  return zoomMenuWindow;
}

function ensureTabOverflowWindow() {
  if (tabOverflowWindow && !tabOverflowWindow.isDestroyed()) return tabOverflowWindow;
  tabOverflowWindow = new BrowserWindow({
    width: 320,
    height: 400,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    parent: mainWindow,
    modal: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });

  try { if (process.platform === 'win32') tabOverflowWindow.setAlwaysOnTop(true, 'pop-up-menu'); } catch (_err) { /* ignore */ }

  tabOverflowWindow.on('blur', () => {
    hideTabOverflowWindow();
  });

  tabOverflowWindow.on('closed', () => {
    tabOverflowWindow = null;
  });

  try { tabOverflowWindow.loadFile(getTabOverflowHtmlPath(), { query: { side: 'left' } }); } catch (_err) { /* ignore */ }
  return tabOverflowWindow;
}

function hideTabOverflowWindow() {
  if (tabOverflowWindow && !tabOverflowWindow.isDestroyed()) {
    try { tabOverflowWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function positionTabOverflowWindow() {
  if (!tabOverflowWindow || tabOverflowWindow.isDestroyed() || !mainWindow) return;
  if (!tabOverflowAnchor) return;
  const bounds = mainWindow.getContentBounds();
  const width = 320;
  const height = 400;
  const gap = 6;

  let x = bounds.x + Math.round(tabOverflowAnchor.left || 0);
  let y = bounds.y + Math.round(tabOverflowAnchor.bottom || 0) + gap;

  const screen = require('electron').screen;
  const display = screen.getDisplayNearestPoint({ x, y });
  const workArea = display?.workArea || { x: 0, y: 0, width: 1920, height: 1080 };

  if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width - gap;
  if (y + height > workArea.y + workArea.height) y = Math.round(tabOverflowAnchor.bottom || 0) - height - gap;
  if (x < workArea.x) x = workArea.x + gap;
  if (y < workArea.y) y = workArea.y + gap;

  try { tabOverflowWindow.setBounds({ x, y, width, height }); } catch (_err) { /* ignore */ }
}

function getAiPanelHtmlPath() {
  return path.join(__dirname, 'renderer', 'ai-panel.html');
}

function getEmailPanelHtmlPath() {
  return path.join(__dirname, 'renderer', 'email-panel.html');
}

function getClipboardPanelHtmlPath() {
  return path.join(__dirname, 'renderer', 'clipboard-panel.html');
}

function getTranslatorPanelHtmlPath() {
  return path.join(__dirname, 'renderer', 'translator-panel.html');
}

function getCalendarPanelHtmlPath() {
  return path.join(__dirname, 'renderer', 'calendar-panel.html');
}

function getStatusPanelHtmlPath() {
  return path.join(__dirname, 'renderer', 'status-panel.html');
}

function createAiBrowserView(partition) {
  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascript: true,
      devTools: false
    }
  });

  view.webContents.on('devtools-opened', () => {
    try { view.webContents.closeDevTools(); } catch (_err) { /* ignore */ }
  });

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      event.preventDefault();
    }
  });

  try {
    const chromeVersion = process.versions.chrome;
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    view.webContents.setUserAgent(userAgent);
  } catch (_err) {
    /* ignore */
  }

  // Link handling - Yeni pencerede aç
  try {
    view.webContents.setWindowOpenHandler((details) => {
      const targetUrl = String(details?.url || '').trim();
      if (targetUrl) {
        // Yeni standalone pencerede aç
        try { 
          openStandaloneWindow('left', targetUrl);
        } catch (_err) { 
          console.error('Failed to open link in new window:', _err);
        }
      }
      return { action: 'deny' };
    });
  } catch (_err) {
    /* ignore */
  }

  // Context menu - Sağ tık menüsü
  view.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Kopyala',
        role: 'copy',
        enabled: params.editFlags?.canCopy || params.selectionText?.length > 0
      },
      {
        label: 'Kes',
        role: 'cut',
        enabled: params.editFlags?.canCut
      },
      {
        label: 'Yapıştır',
        role: 'paste',
        enabled: params.editFlags?.canPaste
      },
      ...(params.linkURL ? [
        { type: 'separator' },
        {
          label: 'Bağlantıyı Yeni Pencerede Aç',
          click: () => {
            try { openStandaloneWindow('left', params.linkURL); } catch (_err) { console.error('Failed to open link:', _err); }
          }
        },
        {
          label: 'Bağlantıyı Sol Pencerede Aç',
          click: () => {
            try { sendOpenNewTab('left', params.linkURL); } catch (_err) { console.error('Failed to open in left:', _err); }
          }
        },
        {
          label: 'Bağlantıyı Sağ Pencerede Aç',
          click: () => {
            try { sendOpenNewTab('right', params.linkURL); } catch (_err) { console.error('Failed to open in right:', _err); }
          }
        }
      ] : []),
      { type: 'separator' },
      {
        label: 'Yenile',
        click: () => view.webContents.reload()
      }
    ]);
    menu.popup();
  });

  // Setup find in page listener
  setupFindListeners(view);

  return view;
}

function normalizeAiProvider(raw) {
  const p = String(raw || '').trim().toLowerCase();
  if (p === 'gemini') return 'gemini';
  if (p === 'copilot') return 'copilot';
  if (p === 'grok') return 'grok';
  return 'chatgpt';
}

function getAiView(provider) {
  if (!aiViews) return null;
  return aiViews[provider] || null;
}

function createEmailBrowserView(partition) {
  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascript: true,
      devTools: false
    }
  });

  view.webContents.on('devtools-opened', () => {
    try { view.webContents.closeDevTools(); } catch (_err) { /* ignore */ }
  });

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      event.preventDefault();
    }
  });

  try {
    const chromeVersion = process.versions.chrome;
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    view.webContents.setUserAgent(userAgent);
  } catch (_err) {
    /* ignore */
  }

  try {
    view.webContents.setWindowOpenHandler((details) => {
      const targetUrl = String(details?.url || '').trim();
      if (targetUrl) {
        try { view.webContents.loadURL(targetUrl); } catch (_err) { /* ignore */ }
      }
      return { action: 'deny' };
    });
  } catch (_err) {
    /* ignore */
  }

  setupFindListeners(view);

  return view;
}

function normalizeEmailProvider(raw) {
  const p = String(raw || '').trim().toLowerCase();
  if (p === 'hotmail') return 'hotmail';
  return 'gmail';
}

function getEmailView(provider) {
  if (!emailViews) return null;
  return emailViews[provider] || null;
}

function createTranslatorBrowserView(partition) {
  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascript: true,
      devTools: false
    }
  });

  view.webContents.on('devtools-opened', () => {
    try { view.webContents.closeDevTools(); } catch (_err) { /* ignore */ }
  });

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      event.preventDefault();
    }
  });

  try {
    const chromeVersion = process.versions.chrome;
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    view.webContents.setUserAgent(userAgent);
  } catch (_err) {
    /* ignore */
  }

  try {
    view.webContents.setWindowOpenHandler((details) => {
      const targetUrl = String(details?.url || '').trim();
      if (targetUrl) {
        try { view.webContents.loadURL(targetUrl); } catch (_err) { /* ignore */ }
      }
      return { action: 'deny' };
    });
  } catch (_err) {
    /* ignore */
  }

  setupFindListeners(view);

  return view;
}

function normalizeTranslatorProvider(raw) {
  const p = String(raw || '').trim().toLowerCase();
  if (p === 'deepl') return 'deepl';
  if (p === 'bing') return 'bing';
  if (p === 'yandex') return 'yandex';
  return 'google';
}

function getTranslatorView(provider) {
  if (!translatorViews) return null;
  return translatorViews[provider] || null;
}

function setActiveAiProvider(provider, options = {}) {
  if (!aiWindow || aiWindow.isDestroyed()) return;
  const nextProvider = normalizeAiProvider(provider);
  const prevProvider = aiActiveProvider;

  const sendAiStatus = (prov, loading) => {
    try {
      if (aiWindow && !aiWindow.isDestroyed()) {
        aiWindow.webContents.send('ai-status', { provider: prov, loading: !!loading });
      }
    } catch (_e) {
      /* ignore */
    }
  };

  if (!aiViews || !aiLoaded) {
    // Çıkışta "sıfır iz" temizliği için AI partition'larını da kaydet.
    markPartition('temp:ai-chatgpt');
    markPartition('temp:ai-gemini');
    markPartition('temp:ai-copilot');
    markPartition('temp:ai-grok');

    aiViews = {
      chatgpt: createAiBrowserView('temp:ai-chatgpt'),
      gemini: createAiBrowserView('temp:ai-gemini'),
      copilot: createAiBrowserView('temp:ai-copilot'),
      grok: createAiBrowserView('temp:ai-grok')
    };
    aiLoaded = { chatgpt: false, gemini: false, copilot: false, grok: false };
    // Her view için event bağla
    for (const [prov, view] of Object.entries(aiViews)) {
      try {
        const wc = view?.webContents;
        if (!wc) continue;
        const updateLast = (url) => {
          const u = String(url || '').trim();
          if (u) aiLastUrl[prov] = u;
        };

        wc.on('did-start-loading', () => {
          if (aiActiveProvider === prov) sendAiStatus(prov, true);
        });
        wc.on('did-stop-loading', () => {
          if (aiActiveProvider === prov) sendAiStatus(prov, false);
        });
        wc.on('did-finish-load', () => {
          if (aiActiveProvider === prov) sendAiStatus(prov, false);
        });

        wc.on('did-navigate', (_e, url) => updateLast(url));
        wc.on('did-navigate-in-page', (_e, url) => updateLast(url));
        wc.on('render-process-gone', (_e, details) => {
          // Sadece ilgili view'i yeniden yarat
          try {
            aiLoaded[prov] = false;
            const old = aiViews[prov];
            try { if (aiWindow && aiWindow.getBrowserView?.() === old) aiWindow.setBrowserView(null); } catch (_e2) { /* ignore */ }
            try { old?.webContents?.destroy?.(); } catch (_e2) { /* ignore */ }
          } catch (_e2) { /* ignore */ }

          try {
            const part = `temp:ai-${prov}`;
            markPartition(part);
            aiViews[prov] = createAiBrowserView(part);
          } catch (_e2) {
            // fallback partitions
            markPartition('temp:ai');
            aiViews[prov] = createAiBrowserView('temp:ai');
          }
          // Eğer aktif provider buysa tekrar attach et
          if (aiActiveProvider === prov) {
            try { aiWindow.setBrowserView(aiViews[prov]); } catch (_e2) { /* ignore */ }
            try { updateAiViewBounds(); } catch (_e2) { /* ignore */ }
          }
          const url = aiLastUrl[prov] || AI_DEFAULTS[prov] || AI_DEFAULT_URL;
          try { aiViews[prov].webContents.loadURL(url); } catch (_e2) { /* ignore */ }
          if (aiActiveProvider === prov) sendAiStatus(prov, true);
          try { console.warn('[ai] view recreated', prov, details?.reason || 'unknown'); } catch (_e2) { /* ignore */ }
        });
      } catch (_err) {
        /* ignore */
      }
    }
  }

  const nextView = getAiView(nextProvider);
  if (!nextView) return;

  // UI'ya hemen "açılıyor" de (did-stop-loading ile temizlenecek)
  sendAiStatus(nextProvider, true);

  // View değiştir (sohbet state'i korunur, çünkü webContents kapanmıyor)
  try {
    if (prevProvider !== nextProvider) {
      try { aiWindow.setBrowserView(null); } catch (_e) { /* ignore */ }
    }
    aiWindow.setBrowserView(nextView);
  } catch (_err) {
    /* ignore */
  }

  aiActiveProvider = nextProvider;
  updateAiViewBounds();

  const requestedUrl = String(options?.url || '').trim();
  if (requestedUrl) {
    aiLastUrl[nextProvider] = requestedUrl;
    try { nextView.webContents.loadURL(requestedUrl); } catch (_err) { /* ignore */ }
    aiLoaded[nextProvider] = true;
    return;
  }

  // İlk kez açılıyorsa default URL yükle; değilse dokunma.
  if (!aiLoaded[nextProvider]) {
    const url = aiLastUrl[nextProvider] || AI_DEFAULTS[nextProvider] || AI_DEFAULT_URL;
    try { nextView.webContents.loadURL(url); } catch (_err) { /* ignore */ }
    aiLoaded[nextProvider] = true;
    return;
  }

  // Zaten yüklüyse mevcut loading state'i bildir ("Açılıyor" takılı kalmasın)
  try {
    const loading = !!nextView.webContents?.isLoading?.();
    sendAiStatus(nextProvider, loading);
  } catch (_err) {
    sendAiStatus(nextProvider, false);
  }
}

function positionAiPanelWindow(force = false) {
  if (!aiWindow || aiWindow.isDestroyed() || !mainWindow) return;
  if (aiUserMoved && !force && aiPos.x !== null && aiPos.y !== null) {
    const desired = { x: aiPos.x, y: aiPos.y, width: aiSize.width, height: aiSize.height };
    const safe = ensureBoundsOnScreen(desired);
    try { aiWindow.setBounds(safe); } catch (_err) { /* ignore */ }
    if (safe.x !== desired.x || safe.y !== desired.y) {
      aiPos = { x: safe.x, y: safe.y };
    }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const width = aiSize.width;
  const height = aiSize.height;
  try { aiWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openAiPanelWindow() {
  if (!mainWindow) return;
  if (aiWindow && !aiWindow.isDestroyed()) {
    aiReady = true;
    try { positionAiPanelWindow(false); } catch (_err) { /* ignore */ }
    try { aiWindow.show(); } catch (_err) { /* ignore */ }
    try { aiWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = aiSize.height;
  const width = aiSize.width;

  aiWindow = new BrowserWindow({
    width,
    height,
    x: aiPos.x !== null ? aiPos.x : defaultX,
    y: aiPos.y !== null ? aiPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: 520,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  aiWindow.on('closed', () => {
    aiWindow = null;
    aiView = null;
    aiViews = null;
    aiLoaded = null;
    aiReady = false;
  });

  aiWindow.webContents.on('did-finish-load', () => {
    aiReady = true;
  });

  aiWindow.on('resize', () => {
    if (!aiWindow || aiWindow.isDestroyed()) return;
    const b = aiWindow.getBounds();
    aiSize = { width: b.width, height: b.height };
    try { updateAiViewBounds(); } catch (_err) { /* ignore */ }
  });

  aiWindow.on('move', () => {
    if (!aiWindow || aiWindow.isDestroyed()) return;
    const b = aiWindow.getBounds();
    aiUserMoved = true;
    aiPos = { x: b.x, y: b.y };
  });

  aiWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    try { aiWindow.hide(); } catch (_err) { /* ignore */ }
  });

  aiWindow.loadFile(getAiPanelHtmlPath());

  // Create provider views and attach default provider without wiping state on switches.
  try {
    setActiveAiProvider(aiActiveProvider || 'chatgpt');
  } catch (err) {
    console.error('AI provider init failed', err);
  }
}

function updateAiViewBounds() {
  if (!aiWindow || aiWindow.isDestroyed()) return;
  const current = getAiView(aiActiveProvider) || aiWindow.getBrowserView?.();
  if (!current) return;
  const bounds = aiWindow.getContentBounds();
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height - AI_BAR_HEIGHT);
  try {
    current.setBounds({ x: 0, y: AI_BAR_HEIGHT, width, height });
    current.setAutoResize({ width: true, height: true });
  } catch (_err) {
    /* ignore */
  }
}

// Email Panel Functions
function setActiveEmailProvider(provider, options = {}) {
  if (!emailWindow || emailWindow.isDestroyed()) return;
  const nextProvider = normalizeEmailProvider(provider);
  const prevProvider = emailActiveProvider;

  const sendEmailStatus = (prov, loading) => {
    try {
      if (emailWindow && !emailWindow.isDestroyed()) {
        emailWindow.webContents.send('email-status', { provider: prov, loading: !!loading });
      }
    } catch (_e) {
      /* ignore */
    }
  };

  if (!emailViews || !emailLoaded) {
    markPartition('temp:email-gmail');
    markPartition('temp:email-hotmail');

    emailViews = {
      gmail: createEmailBrowserView('temp:email-gmail'),
      hotmail: createEmailBrowserView('temp:email-hotmail')
    };

    emailLoaded = { gmail: false, hotmail: false };

    for (const prov in emailViews) {
      const v = emailViews[prov];
      if (!v) continue;

      v.webContents.on('did-start-loading', () => {
        sendEmailStatus(prov, true);
      });

      v.webContents.on('did-stop-loading', () => {
        if (emailActiveProvider === prov) {
          sendEmailStatus(prov, false);
        }
      });

      v.webContents.on('did-fail-load', () => {
        if (emailActiveProvider === prov) {
          sendEmailStatus(prov, false);
        }
      });
    }
  }

  const nextView = getEmailView(nextProvider);
  if (!nextView) return;

  sendEmailStatus(nextProvider, true);

  try {
    if (prevProvider !== nextProvider) {
      try { emailWindow.setBrowserView(null); } catch (_e) { /* ignore */ }
    }
    emailWindow.setBrowserView(nextView);
  } catch (_err) {
    /* ignore */
  }

  emailActiveProvider = nextProvider;
  updateEmailViewBounds();

  const requestedUrl = String(options?.url || '').trim();
  if (requestedUrl) {
    emailLastUrl[nextProvider] = requestedUrl;
    try { nextView.webContents.loadURL(requestedUrl); } catch (_err) { /* ignore */ }
    emailLoaded[nextProvider] = true;
    return;
  }

  if (!emailLoaded[nextProvider]) {
    const url = emailLastUrl[nextProvider];
    try { nextView.webContents.loadURL(url); } catch (_err) { /* ignore */ }
    emailLoaded[nextProvider] = true;
    return;
  }

  try {
    const loading = !!nextView.webContents?.isLoading?.();
    sendEmailStatus(nextProvider, loading);
  } catch (_err) {
    sendEmailStatus(nextProvider, false);
  }
}

function positionEmailPanelWindow(force = false) {
  if (!emailWindow || emailWindow.isDestroyed() || !mainWindow) return;
  if (emailUserMoved && !force && emailPos.x !== null && emailPos.y !== null) {
    const desired = { x: emailPos.x, y: emailPos.y, width: emailSize.width, height: emailSize.height };
    const safe = ensureBoundsOnScreen(desired);
    try { emailWindow.setBounds(safe); } catch (_err) { /* ignore */ }
    if (safe.x !== desired.x || safe.y !== desired.y) {
      emailPos = { x: safe.x, y: safe.y };
    }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const width = emailSize.width;
  const height = emailSize.height;
  try { emailWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openEmailPanelWindow() {
  if (!mainWindow) return;
  if (emailWindow && !emailWindow.isDestroyed()) {
    emailReady = true;
    try { positionEmailPanelWindow(false); } catch (_err) { /* ignore */ }
    try { emailWindow.show(); } catch (_err) { /* ignore */ }
    try { emailWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = emailSize.height;
  const width = emailSize.width;

  emailWindow = new BrowserWindow({
    width,
    height,
    x: emailPos.x !== null ? emailPos.x : defaultX,
    y: emailPos.y !== null ? emailPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: 520,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'email-preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  emailWindow.on('closed', () => {
    emailWindow = null;
    emailViews = null;
    emailLoaded = null;
    emailReady = false;
  });

  emailWindow.webContents.on('did-finish-load', () => {
    emailReady = true;
  });

  emailWindow.on('resize', () => {
    if (!emailWindow || emailWindow.isDestroyed()) return;
    const b = emailWindow.getBounds();
    emailSize = { width: b.width, height: b.height };
    try { updateEmailViewBounds(); } catch (_err) { /* ignore */ }
  });

  emailWindow.on('move', () => {
    if (!emailWindow || emailWindow.isDestroyed()) return;
    const b = emailWindow.getBounds();
    emailUserMoved = true;
    emailPos = { x: b.x, y: b.y };
  });

  emailWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    try { emailWindow.hide(); } catch (_err) { /* ignore */ }
  });

  emailWindow.loadFile(getEmailPanelHtmlPath());

  try {
    setActiveEmailProvider(emailActiveProvider || 'gmail');
  } catch (err) {
    console.error('Email provider init failed', err);
  }
}

function updateEmailViewBounds() {
  if (!emailWindow || emailWindow.isDestroyed()) return;
  const current = getEmailView(emailActiveProvider) || emailWindow.getBrowserView?.();
  if (!current) return;
  const bounds = emailWindow.getContentBounds();
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height - EMAIL_BAR_HEIGHT);
  try {
    current.setBounds({ x: 0, y: EMAIL_BAR_HEIGHT, width, height });
    current.setAutoResize({ width: true, height: true });
  } catch (_err) {
    /* ignore */
  }
}

function hideEmailPanelWindow() {
  if (emailWindow && !emailWindow.isDestroyed() && emailWindow.isVisible()) {
    try { emailWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function toggleEmailPanelWindow() {
  if (emailWindow && !emailWindow.isDestroyed()) {
    if (emailWindow.isVisible()) {
      try { emailWindow.hide(); } catch (_err) { /* ignore */ }
    } else {
      try { emailWindow.show(); } catch (_err) { /* ignore */ }
      try { emailWindow.focus(); } catch (_err) { /* ignore */ }
    }
    return;
  }
  openEmailPanelWindow();
}

// Clipboard Panel Functions
function detectClipboardType(text) {
  if (!text || typeof text !== 'string') return 'text';
  const trimmed = text.trim();

  // OTP (4 veya 6 haneli sayı)
  if (/^\d{4}$|^\d{6}$/.test(trimmed)) return 'otp';

  // URL
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return 'url';

  // E-posta
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';

  // Kod belirtileri
  const codeIndicators = ['{', '}', '[', ']', '()', '=>', 'function', 'const ', 'let ', 'var ', 'import ', 'export ', '<?php', 'def ', 'class '];
  if (codeIndicators.some(indicator => trimmed.includes(indicator))) return 'code';

  return 'text';
}

function getCurrentSiteSource() {
  try {
    // Sol veya sağ taraftaki aktif view'den URL al
    const leftView = activeTab.left ? tabViews.left.get(activeTab.left) : null;
    const rightView = activeTab.right ? tabViews.right.get(activeTab.right) : null;
    
    const view = leftView || rightView;
    if (view && view.webContents) {
      const url = view.webContents.getURL();
      if (url) {
        try {
          const hostname = new URL(url).hostname;
          return hostname || 'Bilinmeyen';
        } catch (_err) {
          return 'Bilinmeyen';
        }
      }
    }
  } catch (_err) {
    /* ignore */
  }
  return 'Bilinmeyen';
}

function startClipboardMonitoring() {
  if (clipboardPollInterval) return;
  
  const { clipboard } = require('electron');
  
  clipboardPollInterval = setInterval(() => {
    try {
      const currentText = clipboard.readText();
      
      // Yeni içerik kontrolü
      if (currentText && currentText !== clipboardLastText && currentText.length > 0) {
        clipboardLastText = currentText;
        
        // Yeni clipboard item oluştur
        const newItem = {
          id: Date.now(),
          text: currentText,
          type: detectClipboardType(currentText),
          source: getCurrentSiteSource(),
          timestamp: Date.now()
        };
        
        // History'e ekle (en başa)
        clipboardHistory.unshift(newItem);
        
        // 50 ile sınırla
        if (clipboardHistory.length > MAX_CLIPBOARD_ITEMS) {
          clipboardHistory = clipboardHistory.slice(0, MAX_CLIPBOARD_ITEMS);
        }
        
        // Clipboard penceresine bildir (açıksa)
        if (clipboardWindow && !clipboardWindow.isDestroyed()) {
          try {
            clipboardWindow.webContents.send('clipboard-new', newItem);
          } catch (_err) {
            /* ignore */
          }
        }
      }
    } catch (_err) {
      /* ignore */
    }
  }, 500); // Her 500ms'de kontrol et
}

function stopClipboardMonitoring() {
  if (clipboardPollInterval) {
    clearInterval(clipboardPollInterval);
    clipboardPollInterval = null;
  }
}

function positionClipboardPanelWindow(force = false) {
  if (!clipboardWindow || clipboardWindow.isDestroyed() || !mainWindow) return;
  if (clipboardUserMoved && !force && clipboardPos.x !== null && clipboardPos.y !== null) {
    const desired = { x: clipboardPos.x, y: clipboardPos.y, width: clipboardSize.width, height: clipboardSize.height };
    const safe = ensureBoundsOnScreen(desired);
    try { clipboardWindow.setBounds(safe); } catch (_err) { /* ignore */ }
    if (safe.x !== desired.x || safe.y !== desired.y) {
      clipboardPos = { x: safe.x, y: safe.y };
    }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const width = clipboardSize.width;
  const height = clipboardSize.height;
  try { clipboardWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openClipboardPanelWindow() {
  if (!mainWindow) return;
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    clipboardReady = true;
    try { positionClipboardPanelWindow(false); } catch (_err) { /* ignore */ }
    try { clipboardWindow.show(); } catch (_err) { /* ignore */ }
    try { clipboardWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = clipboardSize.height;
  const width = clipboardSize.width;

  clipboardWindow = new BrowserWindow({
    width,
    height,
    x: clipboardPos.x !== null ? clipboardPos.x : defaultX,
    y: clipboardPos.y !== null ? clipboardPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: 520,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'clipboard-preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  clipboardWindow.on('closed', () => {
    clipboardWindow = null;
    clipboardReady = false;
  });

  clipboardWindow.webContents.on('did-finish-load', () => {
    clipboardReady = true;
    // Initial data gönder
    if (clipboardWindow && !clipboardWindow.isDestroyed()) {
      try {
        clipboardWindow.webContents.send('clipboard-update', clipboardHistory);
      } catch (_err) {
        /* ignore */
      }
    }
  });

  clipboardWindow.on('resize', () => {
    if (!clipboardWindow || clipboardWindow.isDestroyed()) return;
    const b = clipboardWindow.getBounds();
    clipboardSize = { width: b.width, height: b.height };
  });

  clipboardWindow.on('move', () => {
    if (!clipboardWindow || clipboardWindow.isDestroyed()) return;
    const b = clipboardWindow.getBounds();
    clipboardUserMoved = true;
    clipboardPos = { x: b.x, y: b.y };
  });

  clipboardWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    try { clipboardWindow.hide(); } catch (_err) { /* ignore */ }
  });

  clipboardWindow.loadFile(getClipboardPanelHtmlPath());
  
  // Monitoring'i başlat
  startClipboardMonitoring();
}

function hideClipboardPanelWindow() {
  if (clipboardWindow && !clipboardWindow.isDestroyed() && clipboardWindow.isVisible()) {
    try { clipboardWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function toggleClipboardPanelWindow() {
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    if (clipboardWindow.isVisible()) {
      try { clipboardWindow.hide(); } catch (_err) { /* ignore */ }
    } else {
      try { clipboardWindow.show(); } catch (_err) { /* ignore */ }
      try { clipboardWindow.focus(); } catch (_err) { /* ignore */ }
    }
    return;
  }
  openClipboardPanelWindow();
}

// Translator Panel Functions
function setActiveTranslatorProvider(provider, options = {}) {
  if (!translatorWindow || translatorWindow.isDestroyed()) return;
  const nextProvider = normalizeTranslatorProvider(provider);
  const prevProvider = translatorActiveProvider;

  const sendTranslatorStatus = (prov, loading) => {
    try {
      if (translatorWindow && !translatorWindow.isDestroyed()) {
        translatorWindow.webContents.send('translator-status', { provider: prov, loading: !!loading });
      }
    } catch (_e) {
      /* ignore */
    }
  };

  if (!translatorViews || !translatorLoaded) {
    markPartition('temp:translator-google');
    markPartition('temp:translator-deepl');
    markPartition('temp:translator-bing');
    markPartition('temp:translator-yandex');

    translatorViews = {
      google: createTranslatorBrowserView('temp:translator-google'),
      deepl: createTranslatorBrowserView('temp:translator-deepl'),
      bing: createTranslatorBrowserView('temp:translator-bing'),
      yandex: createTranslatorBrowserView('temp:translator-yandex')
    };

    translatorLoaded = { google: false, deepl: false, bing: false, yandex: false };

    for (const prov in translatorViews) {
      const v = translatorViews[prov];
      if (!v) continue;

      v.webContents.on('did-start-loading', () => {
        sendTranslatorStatus(prov, true);
      });

      v.webContents.on('did-stop-loading', () => {
        if (translatorActiveProvider === prov) {
          sendTranslatorStatus(prov, false);
        }
      });

      v.webContents.on('did-fail-load', () => {
        if (translatorActiveProvider === prov) {
          sendTranslatorStatus(prov, false);
        }
      });
    }
  }

  const nextView = getTranslatorView(nextProvider);
  if (!nextView) return;

  sendTranslatorStatus(nextProvider, true);

  try {
    if (prevProvider !== nextProvider) {
      try { translatorWindow.setBrowserView(null); } catch (_e) { /* ignore */ }
    }
    translatorWindow.setBrowserView(nextView);
  } catch (_err) {
    /* ignore */
  }

  translatorActiveProvider = nextProvider;
  updateTranslatorViewBounds();

  const requestedUrl = String(options?.url || '').trim();
  if (requestedUrl) {
    translatorLastUrl[nextProvider] = requestedUrl;
    try { nextView.webContents.loadURL(requestedUrl); } catch (_err) { /* ignore */ }
    translatorLoaded[nextProvider] = true;
    return;
  }

  if (!translatorLoaded[nextProvider]) {
    const url = translatorLastUrl[nextProvider];
    try { nextView.webContents.loadURL(url); } catch (_err) { /* ignore */ }
    translatorLoaded[nextProvider] = true;
    return;
  }

  try {
    const loading = !!nextView.webContents?.isLoading?.();
    sendTranslatorStatus(nextProvider, loading);
  } catch (_err) {
    sendTranslatorStatus(nextProvider, false);
  }
}

function positionTranslatorPanelWindow(force = false) {
  if (!translatorWindow || translatorWindow.isDestroyed() || !mainWindow) return;
  if (translatorUserMoved && !force && translatorPos.x !== null && translatorPos.y !== null) {
    const desired = { x: translatorPos.x, y: translatorPos.y, width: translatorSize.width, height: translatorSize.height };
    const safe = ensureBoundsOnScreen(desired);
    try { translatorWindow.setBounds(safe); } catch (_err) { /* ignore */ }
    if (safe.x !== desired.x || safe.y !== desired.y) {
      translatorPos = { x: safe.x, y: safe.y };
    }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const width = translatorSize.width;
  const height = translatorSize.height;
  try { translatorWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openTranslatorPanelWindow() {
  if (!mainWindow) return;
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorReady = true;
    try { positionTranslatorPanelWindow(false); } catch (_err) { /* ignore */ }
    try { translatorWindow.show(); } catch (_err) { /* ignore */ }
    try { translatorWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = translatorSize.height;
  const width = translatorSize.width;

  translatorWindow = new BrowserWindow({
    width,
    height,
    x: translatorPos.x !== null ? translatorPos.x : defaultX,
    y: translatorPos.y !== null ? translatorPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: 520,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'translator-preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  translatorWindow.on('closed', () => {
    translatorWindow = null;
    translatorViews = null;
    translatorLoaded = null;
    translatorReady = false;
  });

  translatorWindow.webContents.on('did-finish-load', () => {
    translatorReady = true;
  });

  translatorWindow.on('resize', () => {
    if (!translatorWindow || translatorWindow.isDestroyed()) return;
    const b = translatorWindow.getBounds();
    translatorSize = { width: b.width, height: b.height };
    try { updateTranslatorViewBounds(); } catch (_err) { /* ignore */ }
  });

  translatorWindow.on('move', () => {
    if (!translatorWindow || translatorWindow.isDestroyed()) return;
    const b = translatorWindow.getBounds();
    translatorUserMoved = true;
    translatorPos = { x: b.x, y: b.y };
  });

  translatorWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    try { translatorWindow.hide(); } catch (_err) { /* ignore */ }
  });

  translatorWindow.loadFile(getTranslatorPanelHtmlPath());

  try {
    setActiveTranslatorProvider(translatorActiveProvider || 'google');
  } catch (err) {
    console.error('Translator provider init failed', err);
  }
}

function updateTranslatorViewBounds() {
  if (!translatorWindow || translatorWindow.isDestroyed()) return;
  const current = getTranslatorView(translatorActiveProvider) || translatorWindow.getBrowserView?.();
  if (!current) return;
  const bounds = translatorWindow.getContentBounds();
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height - TRANSLATOR_BAR_HEIGHT);
  try {
    current.setBounds({ x: 0, y: TRANSLATOR_BAR_HEIGHT, width, height });
    current.setAutoResize({ width: true, height: true });
  } catch (_err) {
    /* ignore */
  }
}

function hideTranslatorPanelWindow() {
  if (translatorWindow && !translatorWindow.isDestroyed() && translatorWindow.isVisible()) {
    try { translatorWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function toggleTranslatorPanelWindow() {
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    if (translatorWindow.isVisible()) {
      try { translatorWindow.hide(); } catch (_err) { /* ignore */ }
    } else {
      try { translatorWindow.show(); } catch (_err) { /* ignore */ }
      try { translatorWindow.focus(); } catch (_err) { /* ignore */ }
    }
    return;
  }
  openTranslatorPanelWindow();
}

// Calendar Panel Functions
function positionCalendarPanelWindow(force = false) {
  if (!calendarWindow || calendarWindow.isDestroyed() || !mainWindow) return;
  if (calendarUserMoved && !force && calendarPos.x !== null && calendarPos.y !== null) {
    const desired = { x: calendarPos.x, y: calendarPos.y, width: calendarSize.width, height: calendarSize.height };
    const safe = ensureBoundsOnScreen(desired);
    try { calendarWindow.setBounds(safe); } catch (_err) { /* ignore */ }
    if (safe.x !== desired.x || safe.y !== desired.y) {
      calendarPos = { x: safe.x, y: safe.y };
    }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const width = calendarSize.width;
  const height = calendarSize.height;
  try { calendarWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openCalendarPanelWindow() {
  if (!mainWindow) return;
  if (calendarWindow && !calendarWindow.isDestroyed()) {
    calendarReady = true;
    try { positionCalendarPanelWindow(false); } catch (_err) { /* ignore */ }
    try { calendarWindow.show(); } catch (_err) { /* ignore */ }
    try { calendarWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = calendarSize.height;
  const width = calendarSize.width;

  calendarWindow = new BrowserWindow({
    width,
    height,
    x: calendarPos.x !== null ? calendarPos.x : defaultX,
    y: calendarPos.y !== null ? calendarPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: 520,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'calendar-preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  calendarWindow.on('closed', () => {
    calendarWindow = null;
    calendarReady = false;
  });

  calendarWindow.webContents.on('did-finish-load', () => {
    calendarReady = true;
    if (calendarWindow && !calendarWindow.isDestroyed()) {
      try {
        calendarWindow.webContents.send('calendar-update', calendarAlarms);
      } catch (_err) {
        /* ignore */
      }
    }
  });

  calendarWindow.on('resize', () => {
    if (!calendarWindow || calendarWindow.isDestroyed()) return;
    const b = calendarWindow.getBounds();
    calendarSize = { width: b.width, height: b.height };
  });

  calendarWindow.on('move', () => {
    if (!calendarWindow || calendarWindow.isDestroyed()) return;
    const b = calendarWindow.getBounds();
    calendarUserMoved = true;
    calendarPos = { x: b.x, y: b.y };
  });

  calendarWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    try { calendarWindow.hide(); } catch (_err) { /* ignore */ }
  });

  calendarWindow.loadFile(getCalendarPanelHtmlPath());

  // Start alarm checking
  startCalendarAlarmChecking();
}

function hideCalendarPanelWindow() {
  if (calendarWindow && !calendarWindow.isDestroyed() && calendarWindow.isVisible()) {
    try { calendarWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function toggleCalendarPanelWindow() {
  if (calendarWindow && !calendarWindow.isDestroyed()) {
    if (calendarWindow.isVisible()) {
      try { calendarWindow.hide(); } catch (_err) { /* ignore */ }
    } else {
      try { calendarWindow.show(); } catch (_err) { /* ignore */ }
      try { calendarWindow.focus(); } catch (_err) { /* ignore */ }
    }
    return;
  }
  openCalendarPanelWindow();
}

// Status Panel Functions
function positionStatusPanelWindow(force = false) {
  if (!statusWindow || statusWindow.isDestroyed() || !mainWindow) return;
  if (statusUserMoved && !force && statusPos.x !== null && statusPos.y !== null) {
    statusWindow.setBounds({ x: statusPos.x, y: statusPos.y, width: statusSize.width, height: statusSize.height });
    return;
  }
  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const width = statusSize.width;
  const height = statusSize.height;
  try { statusWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openStatusPanelWindow() {
  if (!mainWindow) return;
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusReady = true;
    try { positionStatusPanelWindow(false); } catch (_err) { /* ignore */ }
    try { statusWindow.show(); } catch (_err) { /* ignore */ }
    try { statusWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = statusSize.height;
  const width = statusSize.width;

  statusWindow = new BrowserWindow({
    width,
    height,
    x: statusPos.x !== null ? statusPos.x : defaultX,
    y: statusPos.y !== null ? statusPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 520,
    minHeight: 600,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'status-preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  statusWindow.on('closed', () => {
    statusWindow = null;
    statusReady = false;
  });

  statusWindow.webContents.on('did-finish-load', () => {
    statusReady = true;
  });

  statusWindow.on('resize', () => {
    if (!statusWindow || statusWindow.isDestroyed()) return;
    const b = statusWindow.getBounds();
    statusSize = { width: b.width, height: b.height };
  });

  statusWindow.on('move', () => {
    if (!statusWindow || statusWindow.isDestroyed()) return;
    const b = statusWindow.getBounds();
    statusUserMoved = true;
    statusPos = { x: b.x, y: b.y };
  });

  statusWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    try { statusWindow.hide(); } catch (_err) { /* ignore */ }
  });

  statusWindow.loadFile(getStatusPanelHtmlPath());
}

function hideStatusPanelWindow() {
  if (statusWindow && !statusWindow.isDestroyed() && statusWindow.isVisible()) {
    try { statusWindow.hide(); } catch (_err) { /* ignore */ }
  }
}

function toggleStatusPanelWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    if (statusWindow.isVisible()) {
      try { statusWindow.hide(); } catch (_err) { /* ignore */ }
    } else {
      try { statusWindow.show(); } catch (_err) { /* ignore */ }
      try { statusWindow.focus(); } catch (_err) { /* ignore */ }
    }
    return;
  }
  openStatusPanelWindow();
}

function startCalendarAlarmChecking() {
  if (calendarCheckInterval) return;
  
  calendarCheckInterval = setInterval(() => {
    checkCalendarAlarms();
  }, 10000); // Her 10 saniyede kontrol
  
  checkCalendarAlarms(); // İlk kontrolü hemen yap
}

function stopCalendarAlarmChecking() {
  if (calendarCheckInterval) {
    clearInterval(calendarCheckInterval);
    calendarCheckInterval = null;
  }
}

function checkCalendarAlarms() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const now = new Date();
  const currentDateTime = now.getTime();
  let hasActiveAlarm = false;

  calendarAlarms.forEach(alarm => {
    if (alarm.triggered) return;

    const alarmDateTime = new Date(`${alarm.date}T${alarm.time}`).getTime();
    const diff = alarmDateTime - currentDateTime;

    // 2 dakika kala bildirim göster
    if (diff > 0 && diff <= 120000 && !alarm.notified) {
      alarm.notified = true;
      hasActiveAlarm = true;
      showAlarmNotification(alarm);
    }

    // Tam zamanında trigger
    if (diff <= 0 && !alarm.triggered) {
      alarm.triggered = true;
      hasActiveAlarm = true;
    }
  });

  // Sidebar butonuna alarm durumunu bildir
  try {
    mainWindow.webContents.send('calendar-alarm-active', hasActiveAlarm);
  } catch (_err) {
    /* ignore */
  }

  // Geçmiş alarmları temizle (1 gün öncesi)
  const oneDayAgo = currentDateTime - (24 * 60 * 60 * 1000);
  calendarAlarms = calendarAlarms.filter(alarm => {
    const alarmDateTime = new Date(`${alarm.date}T${alarm.time}`).getTime();
    return alarmDateTime > oneDayAgo || !alarm.triggered;
  });
}

async function showAlarmNotification(alarm) {
  if (!mainWindow) return;

  const alarmDate = new Date(`${alarm.date}T${alarm.time}`);
  const timeStr = `${String(alarmDate.getHours()).padStart(2, '0')}:${String(alarmDate.getMinutes()).padStart(2, '0')}`;

  // Özel bildirim sistemini kullan
  try {
    await createCustomNotification({
      title: '⏰ Alarm Zamanı',
      body: `${timeStr} - ${alarm.text || 'Alarm'}`,
      icon: null,
      iconEmoji: '⏰',
      count: null,
      duration: 10000 // 10 saniye göster
    });
  } catch (err) {
    // Hata durumunda eski sisteme geri dön
    showOldAlarmNotification(alarm);
  }
}

function showOldAlarmNotification(alarm) {
  // Eğer zaten bir bildirim penceresi varsa kapat
  if (calendarAlarmNotificationWindow && !calendarAlarmNotificationWindow.isDestroyed()) {
    try { calendarAlarmNotificationWindow.close(); } catch (_err) { /* ignore */ }
  }

  const parentBounds = mainWindow.getBounds();
  const width = 400;
  const height = 150;
  const x = parentBounds.x + parentBounds.width - width - 20;
  const y = parentBounds.y + 80;

  calendarAlarmNotificationWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const alarmDate = new Date(`${alarm.date}T${alarm.time}`);
  const timeStr = `${String(alarmDate.getHours()).padStart(2, '0')}:${String(alarmDate.getMinutes()).padStart(2, '0')}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: linear-gradient(135deg, #1a1d29 0%, #0f1115 100%);
          color: #e6ecff;
          font-family: "Segoe UI", system-ui, sans-serif;
          padding: 20px;
          display: flex;
          flex-direction: column;
          height: 100vh;
          border: 2px solid #f39c12;
          border-radius: 12px;
        }
        .icon {
          font-size: 36px;
          margin-bottom: 10px;
          text-align: center;
        }
        .title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
          text-align: center;
          color: #f39c12;
        }
        .time {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 10px;
          text-align: center;
        }
        .message {
          font-size: 14px;
          color: #aab3c5;
          text-align: center;
          flex: 1;
        }
      </style>
    </head>
    <body>
      <div class="icon">⏰</div>
      <div class="title">Alarm Zamanı</div>
      <div class="time">${timeStr}</div>
      <div class="message">${alarm.text || 'Alarm'}</div>
    </body>
    </html>
  `;

  calendarAlarmNotificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // 2 dakika sonra otomatik kapat
  setTimeout(() => {
    if (calendarAlarmNotificationWindow && !calendarAlarmNotificationWindow.isDestroyed()) {
      try { calendarAlarmNotificationWindow.close(); } catch (_err) { /* ignore */ }
    }
  }, 120000);
}

// (Eski) AI tek-view event fonksiyonları artık kullanılmıyor.

// Telegram bildirim sistemi
const telegramNotifications = new Map(); // sender -> { count, lastMessage, lastTime, icon }
const MAX_NOTIFICATION_SENDERS = 5;
let notificationTimeout = null;

// Özel Bildirim Sistemi
let notificationWindows = []; // { window, data, resolve, index }
const MAX_NOTIFICATIONS = 5;
const NOTIFICATION_WIDTH = 380;
const NOTIFICATION_HEIGHT = 90;
const NOTIFICATION_MARGIN = 16;
const NOTIFICATION_SPACING = 10;

// Bildirim ayarları
let notificationSettings = {
  position: 'bottom-right', // 'top-right', 'top-left', 'bottom-right', 'bottom-left'
  displayIndex: 0, // Hangi ekran (0 = primary)
  theme: 'modern', // 'modern', 'dark', 'minimal', 'glass', 'neon'
  duration: 5000, // Otomatik kapanma süresi (ms)
  maxNotifications: 5, // Maksimum eşzamanlı bildirim sayısı
  spacing: 15, // Bildirimler arası boşluk (px)
  animationSpeed: 300, // Animasyon hızı (ms)
  stackMode: 'vertical' // 'vertical' (dikey), 'horizontal' (yatay), 'overlap' (üst üste)
};

function getNotificationSettingsPath() {
  return path.join(app.getPath('userData'), 'notification-settings.json');
}

function loadNotificationSettings() {
  try {
    const settingsPath = getNotificationSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      notificationSettings = { ...notificationSettings, ...JSON.parse(data) };
    }
  } catch (err) {
    // Ignore
  }
}

function saveNotificationSettings() {
  try {
    const settingsPath = getNotificationSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(notificationSettings, null, 2), 'utf8');
  } catch (err) {
    // Ignore
  }
}

function getNotificationPosition(displayBounds) {
  const { width: screenWidth, height: screenHeight } = displayBounds;
  const position = notificationSettings.position;
  
  let x, y;
  
  switch (position) {
    case 'top-left':
      x = displayBounds.x + NOTIFICATION_MARGIN;
      y = displayBounds.y + NOTIFICATION_MARGIN;
      break;
    case 'top-right':
      x = displayBounds.x + screenWidth - NOTIFICATION_WIDTH - NOTIFICATION_MARGIN;
      y = displayBounds.y + NOTIFICATION_MARGIN;
      break;
    case 'bottom-left':
      x = displayBounds.x + NOTIFICATION_MARGIN;
      y = displayBounds.y + screenHeight - NOTIFICATION_HEIGHT - NOTIFICATION_MARGIN;
      break;
    case 'bottom-right':
      x = displayBounds.x + screenWidth - NOTIFICATION_WIDTH - NOTIFICATION_MARGIN;
      y = displayBounds.y + screenHeight - NOTIFICATION_HEIGHT - NOTIFICATION_MARGIN;
      break;
    default:
      x = displayBounds.x + screenWidth - NOTIFICATION_WIDTH - NOTIFICATION_MARGIN;
      y = displayBounds.y + NOTIFICATION_MARGIN;
  }
  
  return { x, y };
}

function createCustomNotification(data) {
  return new Promise((resolve) => {
    showNotification(data, resolve);
  });
}

function showNotification(data, resolve) {
  // Maksimum bildirim sayısına ulaşıldıysa, en eskisini kapat
  const maxCount = notificationSettings.maxNotifications || 5;
  if (notificationWindows.length >= maxCount) {
    const oldest = notificationWindows[0];
    if (oldest && oldest.window && !oldest.window.isDestroyed()) {
      try { oldest.window.close(); } catch (_err) { /* ignore */ }
    }
  }

  // Seçilen ekranı al
  const displays = screen.getAllDisplays();
  const displayIndex = Math.min(notificationSettings.displayIndex, displays.length - 1);
  const targetDisplay = displays[displayIndex] || screen.getPrimaryDisplay();
  const displayBounds = targetDisplay.workAreaSize;
  displayBounds.x = targetDisplay.bounds.x;
  displayBounds.y = targetDisplay.bounds.y;

  // İlk bildirimin pozisyonunu hesapla
  const basePosition = getNotificationPosition(displayBounds);
  
  // Pozisyonu hesapla - stackMode'a göre
  const index = notificationWindows.length;
  const spacing = notificationSettings.spacing || 15;
  const stackMode = notificationSettings.stackMode || 'vertical';
  let xPosition = basePosition.x;
  let yPosition = basePosition.y;
  
  if (stackMode === 'horizontal') {
    // Yan yana (yatay)
    if (notificationSettings.position.includes('left')) {
      xPosition = basePosition.x + (index * (NOTIFICATION_WIDTH + spacing));
    } else {
      xPosition = basePosition.x - (index * (NOTIFICATION_WIDTH + spacing));
    }
  } else if (stackMode === 'overlap') {
    // Üst üste (hafif kaydırılarak)
    const overlapOffset = 20; // Her bildirim 20px kaydırılır
    if (notificationSettings.position.includes('bottom')) {
      yPosition = basePosition.y - (index * overlapOffset);
    } else {
      yPosition = basePosition.y + (index * overlapOffset);
    }
    if (notificationSettings.position.includes('left')) {
      xPosition = basePosition.x + (index * overlapOffset);
    } else {
      xPosition = basePosition.x - (index * overlapOffset);
    }
  } else {
    // Vertical (dikey) - varsayılan
    if (notificationSettings.position.includes('bottom')) {
      yPosition = basePosition.y - (index * (NOTIFICATION_HEIGHT + spacing));
    } else {
      yPosition = basePosition.y + (index * (NOTIFICATION_HEIGHT + spacing));
    }
  }

  const notificationWindow = new BrowserWindow({
    width: NOTIFICATION_WIDTH,
    height: NOTIFICATION_HEIGHT,
    x: xPosition,
    y: yPosition,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'notification-preload.js')
    }
  });

  notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notificationWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  const notificationData = {
    title: data.title || 'Bildirim',
    body: data.body || '',
    icon: data.icon || null,
    iconEmoji: data.iconEmoji || '📬',
    count: data.count || null,
    duration: data.duration || notificationSettings.duration || 5000,
    chatId: data.chatId || null,
    theme: notificationSettings.theme || 'modern',
    animationSpeed: notificationSettings.animationSpeed || 300,
    animationType: data.animationType || notificationSettings.animationType || 'slide'
  }

  // Window'a veri ve resolve ekle
  notificationWindow._notificationData = data;
  notificationWindow._notificationResolve = resolve;
  notificationWindow._notificationIndex = index;

  // Array'e ekle
  notificationWindows.push({
    window: notificationWindow,
    data: data,
    resolve: resolve,
    index: index
  });

  notificationWindow.loadFile(path.join(__dirname, 'renderer', 'custom-notification.html'));

  notificationWindow.once('ready-to-show', () => {
    notificationWindow.show();
    notificationWindow.webContents.send('notification-data', notificationData);
  });

  notificationWindow.on('closed', () => {
    // Resolve et
    if (notificationWindow._notificationResolve) {
      notificationWindow._notificationResolve({ action: 'closed' });
      notificationWindow._notificationResolve = null;
    }

    // Array'den kaldır
    const windowIndex = notificationWindows.findIndex(nw => nw.window === notificationWindow);
    if (windowIndex !== -1) {
      notificationWindows.splice(windowIndex, 1);
    }

    // Kalan bildirimleri yukarı kaydır
    repositionNotifications();
  });
}

function repositionNotifications() {
  // Seçilen ekranı al
  const displays = screen.getAllDisplays();
  const displayIndex = Math.min(notificationSettings.displayIndex, displays.length - 1);
  const targetDisplay = displays[displayIndex] || screen.getPrimaryDisplay();
  const displayBounds = targetDisplay.workAreaSize;
  displayBounds.x = targetDisplay.bounds.x;
  displayBounds.y = targetDisplay.bounds.y;

  const basePosition = getNotificationPosition(displayBounds);
  const spacing = notificationSettings.spacing || 15;
  const stackMode = notificationSettings.stackMode || 'vertical';

  notificationWindows.forEach((nw, index) => {
    if (nw.window && !nw.window.isDestroyed()) {
      let newX = basePosition.x;
      let newY = basePosition.y;
      
      if (stackMode === 'horizontal') {
        // Yan yana (yatay)
        if (notificationSettings.position.includes('left')) {
          newX = basePosition.x + (index * (NOTIFICATION_WIDTH + spacing));
        } else {
          newX = basePosition.x - (index * (NOTIFICATION_WIDTH + spacing));
        }
      } else if (stackMode === 'overlap') {
        // Üst üste (hafif kaydırılarak)
        const overlapOffset = 20;
        if (notificationSettings.position.includes('bottom')) {
          newY = basePosition.y - (index * overlapOffset);
        } else {
          newY = basePosition.y + (index * overlapOffset);
        }
        if (notificationSettings.position.includes('left')) {
          newX = basePosition.x + (index * overlapOffset);
        } else {
          newX = basePosition.x - (index * overlapOffset);
        }
      } else {
        // Vertical (dikey)
        if (notificationSettings.position.includes('bottom')) {
          newY = basePosition.y - (index * (NOTIFICATION_HEIGHT + spacing));
        } else {
          newY = basePosition.y + (index * (NOTIFICATION_HEIGHT + spacing));
        }
      }
      
      nw.window.setBounds({
        x: newX,
        y: newY,
        width: NOTIFICATION_WIDTH,
        height: NOTIFICATION_HEIGHT
      });
      nw.index = index;
      nw.window._notificationIndex = index;
    }
  });
}

// Bildirim event handler'ları (global, bir kez tanımlanır)
ipcMain.on('notification-clicked', (event) => {
  // Hangi window'dan geldiğini bul
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) return;

  const data = senderWindow._notificationData;
  const resolve = senderWindow._notificationResolve;
  
  if (resolve) {
    resolve({ action: 'clicked', chatId: data?.chatId });
    senderWindow._notificationResolve = null;
  }
  
  try { senderWindow.close(); } catch (_err) { /* ignore */ }
});

ipcMain.on('close-notification', (event) => {
  // Hangi window'dan geldiğini bul
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow) return;

  const resolve = senderWindow._notificationResolve;
  
  if (resolve) {
    resolve({ action: 'closed' });
    senderWindow._notificationResolve = null;
  }
  
  try { senderWindow.close(); } catch (_err) { /* ignore */ }
});
const userAllowedHosts = new Set();
const BASE_COOKIE_HOSTS = [
  't.me',
  '.t.me',
  'telegram.org',
  '.telegram.org',
  'web.telegram.org'
];
const CHATGPT_COOKIE_HOSTS = [
  'chatgpt.com',
  '.chatgpt.com',
  'openai.com',
  '.openai.com',
  'auth0.openai.com',
  'auth.openai.com'
];
const DOWNLOAD_DIR = path.join(app.getPath('downloads'), 'gdow');
const APP_NAME = 'OGame';

// Capture the default/legacy userData path (typically under AppData\Roaming) so we can
// remove leftovers from older runs/versions as part of "sıfır iz".
let LEGACY_USER_DATA = '';
try { LEGACY_USER_DATA = app.getPath('userData'); } catch (_err) { LEGACY_USER_DATA = ''; }

// Use an ephemeral per-run profile under TEMP to avoid leaving data in Roaming.
// This is the most reliable way to keep AppData clean even if cleanup is interrupted.
try {
  const runId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const runUserData = path.join(os.tmpdir(), 'OGameTarayici', 'profile', runId);
  app.setPath('userData', runUserData);
  try { app.setPath('cache', path.join(runUserData, 'Cache')); } catch (_err) { /* ignore */ }
  try { app.setPath('logs', path.join(runUserData, 'logs')); } catch (_err) { /* ignore */ }
  try { app.setPath('crashDumps', path.join(runUserData, 'Crashpad')); } catch (_err) { /* ignore */ }
  try { app.setPath('sessionData', path.join(runUserData, 'SessionData')); } catch (_err) { /* ignore */ }

  // Best-effort: remove legacy Roaming profile right away (keeps AppData clean even
  // if the previous run was killed/crashed before the post-exit wipe ran).
  try {
    const currentUserData = app.getPath('userData');
    if (LEGACY_USER_DATA && LEGACY_USER_DATA !== currentUserData && fs.existsSync(LEGACY_USER_DATA)) {
      fs.rmSync(LEGACY_USER_DATA, { recursive: true, force: true });
    }
  } catch (_err) {
    /* ignore */
  }
} catch (_err) {
  /* ignore */
}

// Track only the partitions we actually used in this run (to avoid creating new ones
// during cleanup). This helps achieve "çıkışta sıfır iz" more reliably.
const usedPartitions = new Set();

function markPartition(partition) {
  if (!partition) return;
  try { usedPartitions.add(String(partition)); } catch (_err) { /* ignore */ }
}

try { app.setName(APP_NAME); } catch (_err) { /* ignore */ }
try { if (process.platform === 'win32') app.setAppUserModelId(APP_NAME); } catch (_err) { /* ignore */ }
let exiting = false;
let exitingPromise = null;
let exitOverlay = null;
let exitConfirmed = false;
let exitConfirmPromise = null;

function escapePsSingleQuoted(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function schedulePostExitWipe() {
  // Always best-effort; never block exit.
  if (process.platform !== 'win32') return;
  try {
    const pid = process.pid;
    const tempDir = app.getPath('temp');
    const userData = app.getPath('userData');
    let cacheDir = '';
    let logsDir = '';
    let crashDir = '';
    let sessionData = '';
    try {
      // Available on newer Electron; if missing, ignore.
      sessionData = app.getPath('sessionData');
    } catch (_err) {
      sessionData = '';
    }

    try { cacheDir = app.getPath('cache'); } catch (_err) { cacheDir = ''; }
    try { logsDir = app.getPath('logs'); } catch (_err) { logsDir = ''; }
    try { crashDir = app.getPath('crashDumps'); } catch (_err) { crashDir = ''; }

    const targets = [userData, LEGACY_USER_DATA, sessionData, cacheDir, logsDir, crashDir, DOWNLOAD_DIR].filter(Boolean);
    const psTargets = targets.map((t) => `'${escapePsSingleQuoted(t)}'`).join(', ');
    const scriptPath = path.join(tempDir, `ogame-wipe-${pid}-${Date.now()}.ps1`);
    const script = `param([int]$Pid)
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Milliseconds 350
while (Get-Process -Id $Pid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 350 }

$targets = @(${psTargets})
foreach ($t in $targets) {
  if (-not $t) { continue }
  if (Test-Path -LiteralPath $t) {
    try { Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue } catch { }
  }
}

# Also cleanup any leftover temp notification icons (best-effort)
try {
  $tmp = $env:TEMP
  if ($tmp -and (Test-Path -LiteralPath $tmp)) {
    Get-ChildItem -LiteralPath $tmp -Filter 'tg-*.png' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  }
} catch { }

# Self-delete
try { Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue } catch { }
`;
    try { fs.writeFileSync(scriptPath, script, 'utf8'); } catch (_err) { return; }

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      scriptPath,
      '-Pid',
      String(pid)
    ], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (_err) {
    // ignore
  }
}

function getErrorName(errorCode) {
  const errors = {
    '-1': 'ERR_FAILED',
    '-2': 'ERR_ABORTED',
    '-3': 'ERR_INVALID_ARGUMENT',
    '-4': 'ERR_INVALID_HANDLE',
    '-5': 'ERR_FILE_NOT_FOUND',
    '-6': 'ERR_TIMED_OUT',
    '-7': 'ERR_FILE_TOO_BIG',
    '-100': 'ERR_CONNECTION_CLOSED',
    '-101': 'ERR_CONNECTION_RESET',
    '-102': 'ERR_CONNECTION_REFUSED',
    '-103': 'ERR_CONNECTION_ABORTED',
    '-104': 'ERR_CONNECTION_FAILED',
    '-105': 'ERR_NAME_NOT_RESOLVED',
    '-106': 'ERR_INTERNET_DISCONNECTED',
    '-107': 'ERR_SSL_PROTOCOL_ERROR',
    '-109': 'ERR_ADDRESS_INVALID',
    '-110': 'ERR_ADDRESS_UNREACHABLE',
    '-118': 'ERR_CONNECTION_TIMED_OUT',
    '-200': 'ERR_CERT_COMMON_NAME_INVALID',
    '-201': 'ERR_CERT_DATE_INVALID',
    '-202': 'ERR_CERT_AUTHORITY_INVALID',
    '-300': 'ERR_INVALID_URL',
    '-310': 'ERR_TOO_MANY_REDIRECTS',
    '-324': 'ERR_EMPTY_RESPONSE',
    '-501': 'ERR_INSECURE_RESPONSE'
  };
  return errors[String(errorCode)] || `ERR_UNKNOWN (${errorCode})`;
}

function normalizeUrl(raw) {
  if (!raw) return '';
  if (/^file:\/\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function ensureDownloadDir() {
  try { fs.mkdirSync(DOWNLOAD_DIR, { recursive: true }); } catch (_err) { /* ignore */ }
}

function resolveDownloadPath(filename) {
  const base = filename || 'download';
  const ext = path.extname(base);
  const name = path.basename(base, ext);
  let candidate = path.join(DOWNLOAD_DIR, base);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(DOWNLOAD_DIR, `${name} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

function listDownloadDir() {
  ensureDownloadDir();
  const files = [];
  try {
    const entries = fs.readdirSync(DOWNLOAD_DIR);
    for (const entry of entries) {
      const full = path.join(DOWNLOAD_DIR, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) {
          files.push({
            id: full,
            filename: entry,
            receivedBytes: stat.size,
            totalBytes: stat.size,
            state: 'completed',
            savePath: full,
            canResume: false,
            speed: 0
          });
        }
      } catch (_err) {
        /* ignore bad entry */
      }
    }
  } catch (_err) {
    /* ignore dir read */
  }
  return files;
}

function getMergedDownloads() {
  const merged = [];
  const seen = new Set();
  const activePaths = new Set();
  for (const item of downloadItems.values()) {
    try {
      const p = item.getSavePath?.();
      if (p) activePaths.add(p);
    } catch (_err) {
      /* ignore */
    }
  }

  for (const entry of recentDownloads) {
    if (entry?.state === 'removed') continue;
    const key = entry.savePath || entry.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  for (const fileEntry of listDownloadDir()) {
    const key = fileEntry.savePath || fileEntry.id;
    if (!key || seen.has(key)) continue;
    if (activePaths.has(key)) continue;
    seen.add(key);
    merged.push(fileEntry);
  }

  return merged;
}

function getHostFromUrl(raw) {
  try {
    const u = new URL(raw);
    return u.hostname || '';
  } catch (_err) {
    return '';
  }
}

function getPermissionDecision(kind, host) {
  const cleanHost = String(host || '').toLowerCase();
  const bucket = permissionStore[kind];
  if (!bucket || !cleanHost) return 'ask';
  if (bucket.allow.has(cleanHost)) return 'allow';
  if (bucket.deny.has(cleanHost)) return 'deny';
  return 'ask';
}

function isPopupsAllowedForWebContents(wc) {
  try {
    const host = getHostFromUrl(wc?.getURL?.() || '');
    const decision = getPermissionDecision('popups', host);
    // Default: behave like current browser behavior (allow via hidden bridge) unless explicitly denied.
    return decision !== 'deny';
  } catch (_err) {
    return true;
  }
}

function updatePermissionStore(kind, host, action) {
  const bucket = permissionStore[kind];
  if (!bucket || !host) return;
  if (action === 'allow') {
    bucket.allow.add(host);
    bucket.deny.delete(host);
  } else if (action === 'deny') {
    bucket.deny.add(host);
    bucket.allow.delete(host);
  } else if (action === 'forget') {
    bucket.allow.delete(host);
    bucket.deny.delete(host);
  }
}

function serializePermissionStore() {
  const out = {};
  for (const [key, val] of Object.entries(permissionStore)) {
    out[key] = {
      allow: Array.from(val.allow),
      deny: Array.from(val.deny)
    };
  }
  return out;
}

function loadPermissionStore(serialized) {
  if (!serialized) return;
  for (const [key, val] of Object.entries(serialized)) {
    if (!permissionStore[key]) continue;
    const allow = Array.isArray(val.allow) ? val.allow : [];
    const deny = Array.isArray(val.deny) ? val.deny : [];
    permissionStore[key].allow = new Set(allow);
    permissionStore[key].deny = new Set(deny);
  }
}

function positionPanelWindow(force = false) {
  if (!panelWindow || panelWindow.isDestroyed() || !mainWindow) return;
  if (panelUserMoved && !force && panelPos.x !== null && panelPos.y !== null) {
    panelWindow.setBounds({ x: panelPos.x, y: panelPos.y, width: panelSize.width, height: panelSize.height });
    return;
  }
  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH; // align after expanded sidebar baseline
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT;
  const height = panelSize.height;
  const width = panelSize.width;
  panelWindow.setBounds({ x, y, width, height });
}

function positionNotesWindow(force = false) {
  if (!notesWindow || notesWindow.isDestroyed() || !mainWindow) return;
  if (notesUserMoved && !force && notesPos.x !== null && notesPos.y !== null) {
    notesWindow.setBounds({ x: notesPos.x, y: notesPos.y, width: notesSize.width, height: notesSize.height });
    return;
  }
  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const height = notesSize.height;
  const width = notesSize.width;
  notesWindow.setBounds({ x, y, width, height });
}

function stopTelegramTitlePolling() {
  if (telegramTitlePoll) {
    clearInterval(telegramTitlePoll);
    telegramTitlePoll = null;
  }
}

async function confirmExit() {
  if (exitConfirmed) return true;
  if (exitConfirmPromise) return exitConfirmPromise;
  const win = mainWindow;
  exitConfirmPromise = (async () => {
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Çıkış',
      message: 'Uygulamadan çıkmak istiyor musunuz?',
      detail: 'Tüm sekmeler ve pencereler kapatılacak.',
      buttons: ['Evet', 'İptal'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    exitConfirmPromise = null;
    if (result.response === 0) {
      exitConfirmed = true;
      return true;
    }
    return false;
  })();
  return exitConfirmPromise;
}

function createOverlayIcon(count) {
  if (!count || process.platform !== 'win32') return null;
  const text = count > 99 ? '99+' : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="32" fill="#d7263d"/>` +
    `<text x="32" y="42" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${text}</text>` +
    `</svg>`;
  try {
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  } catch (_err) {
    return null;
  }
}

function getSenderIcon(senderName) {
  // Gönderenin ilk harfinden veya özel karakterlerden simge oluştur
  if (!senderName) return '💬';
  
  const firstChar = senderName.trim()[0]?.toLowerCase();
  
  // Özel grup/kanal isimleri için simgeler
  const specialIcons = {
    'saved': '⭐',
    'telegram': '✈️',
    'channel': '📢',
    'group': '👥',
    'bot': '🤖'
  };
  
  const lowerName = senderName.toLowerCase();
  for (const [key, icon] of Object.entries(specialIcons)) {
    if (lowerName.includes(key)) return icon;
  }
  
  // Harf bazlı renkli simgeler
  const letterIcons = {
    'a': '🔴', 'b': '🟠', 'c': '🟡', 'd': '🟢', 'e': '🔵',
    'f': '🟣', 'g': '🟤', 'h': '⚫', 'i': '⚪', 'j': '🔴',
    'k': '🟠', 'l': '🟡', 'm': '🟢', 'n': '🔵', 'o': '🟣',
    'p': '🟤', 'q': '⚫', 'r': '⚪', 's': '🔴', 't': '🟠',
    'u': '🟡', 'v': '🟢', 'w': '🔵', 'x': '🟣', 'y': '🟤',
    'z': '⚫'
  };
  
  return letterIcons[firstChar] || '💬';
}

function showTelegramNotification(data) {
  if (!data) return;
  
  const { title, body, tag, icon } = data;
  const displayTitle = title || 'Telegram';
  const displayBody = body || 'Yeni mesaj';
  const chatId = tag || '';
  const iconUrl = icon || '';
  
  // Grup/Kullanıcı adını başlıktan çıkar
  let sender = displayTitle;
  
  // Örnek formatlar:
  // "Grup Adı (5)" -> "Grup Adı"
  // "Kullanıcı Adı" -> "Kullanıcı Adı"
  const cleanTitle = sender.replace(/\s*\(\d+\)\s*$/, '').trim();
  
  // Bildirim geçmişine ekle
  if (!telegramNotifications.has(cleanTitle)) {
    // Maksimum 5 gönderen takip et
    if (telegramNotifications.size >= MAX_NOTIFICATION_SENDERS) {
      // En eski olanı sil
      const firstKey = telegramNotifications.keys().next().value;
      telegramNotifications.delete(firstKey);
    }
    
    telegramNotifications.set(cleanTitle, {
      count: 0,
      lastMessage: '',
      lastTime: Date.now(),
      icon: getSenderIcon(cleanTitle),
      chatId: chatId,
      iconUrl: iconUrl
    });
  }
  
  const senderData = telegramNotifications.get(cleanTitle);
  senderData.count++;
  senderData.lastMessage = displayBody;
  senderData.lastTime = Date.now();
  senderData.chatId = chatId;
  if (iconUrl) senderData.iconUrl = iconUrl;
  
  // Her bildirim için direkt ayrı notification göster
  showSingleNotification(cleanTitle, displayBody, chatId, iconUrl);
}

async function cleanupTempIcons() {
  try {
    const tempDir = app.getPath('temp');
    const files = fs.readdirSync(tempDir);
    const tgFiles = files.filter(f => f.startsWith('tg-') && f.endsWith('.png'));
    
    for (const file of tgFiles) {
      try {
        fs.unlinkSync(path.join(tempDir, file));
      } catch (_e) {
        // Dosya silinemiyor, atla
      }
    }
  } catch (_err) {
    // Temizlik hatası, sessizce geç
  }
}

async function showSingleNotification(senderName, message, chatId, iconUrl) {
  try {
    let iconPath = null;
    
    // Data URL geliyorsa icon'u ayarla
    if (iconUrl && iconUrl.startsWith('data:')) {
      try {
        const img = nativeImage.createFromDataURL(iconUrl);
        if (!img.isEmpty()) {
          // Windows için dosyaya yaz ve path ile kullan
          const resized = img.resize({ width: 48, height: 48 });
          const tempIconPath = path.join(app.getPath('temp'), `tg-${Date.now()}.png`);
          fs.writeFileSync(tempIconPath, resized.toPNG());
          iconPath = tempIconPath;
          // 10 saniye sonra temizle
          setTimeout(() => {
            try { fs.unlinkSync(tempIconPath); } catch (_e) {}
          }, 10000);
        }
      } catch (err) {
        // Icon yüklenemezse null kullan
      }
    }
    
    // Özel bildirim sistemini kullan
    const result = await createCustomNotification({
      title: senderName,
      body: message,
      icon: iconPath,
      iconEmoji: '💬',
      count: null,
      duration: 5000,
      chatId: chatId
    });
    
    // Bildirim tıklandıysa
    if (result.action === 'clicked') {
      // Telegram penceresini göster
      if (telegramWindow && !telegramWindow.isDestroyed()) {
        if (!telegramWindow.isVisible()) {
          positionTelegramWindow(false);
          telegramWindow.show();
        }
        telegramWindow.focus();
        
        // İlgili sohbete git
        if (chatId) {
          setTimeout(() => {
            openTelegramChat(chatId);
          }, 300);
        }
      } else {
        openTelegramWindow();
        // Pencere açıldıktan sonra sohbete git
        if (chatId) {
          setTimeout(() => {
            openTelegramChat(chatId);
          }, 1500);
        }
      }
    }
  } catch (err) {
    // Hata durumunda sessizce geç
  }
}

async function openTelegramChat(chatId) {
  if (!telegramWindow || telegramWindow.isDestroyed() || !chatId) return;
  
  try {
    // Telegram Web'de sohbeti açmak için chat ID'yi kullan
    const script = `
      (function() {
        // Chat ID'den sohbeti açma - Telegram Web K versiyonu için
        const chatTag = "${chatId}";
        
        // Sohbet listesinden chat'i bul ve tıkla
        const chatElements = document.querySelectorAll('[data-peer-id], .chat-list-item, .chatlist-chat');
        for (const elem of chatElements) {
          const peerId = elem.getAttribute('data-peer-id') || elem.getAttribute('data-chat-id') || '';
          if (peerId && chatTag.includes(peerId)) {
            elem.click();
            return true;
          }
        }
        
        // Alternatif: URL hash ile açma
        const chatNum = chatTag.match(/\\d+/)?.[0];
        if (chatNum) {
          window.location.hash = '#-' + chatNum;
          return true;
        }
        
        return false;
      })();
    `;
    
    await telegramWindow.webContents.executeJavaScript(script);
  } catch (err) {
    console.error('Telegram sohbet açma hatası:', err);
  }
}

async function showGroupedNotification() {
  try {
    const senders = Array.from(telegramNotifications.entries())
      .sort((a, b) => b[1].lastTime - a[1].lastTime) // En yeni önce
      .slice(0, 5); // Maksimum 5 gönderen
    
    if (senders.length === 0) return;
    
    let notificationTitle = '';
    let notificationBody = '';
    let targetChatId = null;
    let notificationIcon = nativeImage.createFromPath(path.join(__dirname, 'resources', 'icons', 'ogame.png'));
    
    if (senders.length === 1) {
      // Tek gönderen
      const [name, data] = senders[0];
      targetChatId = data.chatId;
      
      
      // Data URL geliyorsa icon'u ayarla
      if (data.iconUrl && data.iconUrl.startsWith('data:')) {
        try {
          const img = nativeImage.createFromDataURL(data.iconUrl);
          if (!img.isEmpty()) {
            // 256x256 boyutunda resize et (Windows toast notifications için optimal)
            notificationIcon = img.resize({ width: 256, height: 256 });
          }
        } catch (err) {
          // Icon yüklenemezse default icon kullan
        }
      }
      
      // Profil resmi varsa emoji gösterme, sadece isim
      notificationTitle = name;
      notificationBody = data.count > 1 
        ? `${data.count} yeni mesaj: ${data.lastMessage}`
        : data.lastMessage;
    } else {
      // Birden fazla gönderen - ilkinin profil resmini kullan
      const firstSender = senders[0][1];
      if (firstSender.iconUrl && firstSender.iconUrl.startsWith('data:')) {
        try {
          const img = nativeImage.createFromDataURL(firstSender.iconUrl);
          if (!img.isEmpty()) {
            // 256x256 boyutunda resize et (Windows toast notifications için optimal)
            notificationIcon = img.resize({ width: 256, height: 256 });
          }
        } catch (err) {
          // Icon yüklenemezse default icon kullan
        }
      }
      
      notificationTitle = `Telegram`;
      const lines = senders.map(([name, data]) => 
        `${name}: ${data.count} mesaj`
      );
      notificationBody = lines.join('\n');
      // Birden fazla gönderende ilkinin chat'ini aç
      targetChatId = senders[0][1].chatId;
    }
    
    const notif = new Notification({
      title: notificationTitle,
      body: notificationBody,
      silent: false,
      icon: notificationIcon,
      timeoutType: 'default',
      urgency: 'normal'
    });
    
    notif.on('click', async () => {
      // Bildirme tıklandığında Telegram penceresini göster
      if (telegramWindow && !telegramWindow.isDestroyed()) {
        if (!telegramWindow.isVisible()) {
          positionTelegramWindow(false);
          telegramWindow.show();
        }
        telegramWindow.focus();
        
        // İlgili sohbete git
        if (targetChatId) {
          setTimeout(() => {
            openTelegramChat(targetChatId);
          }, 300); // Pencere açılmasını bekle
        }
      } else {
        openTelegramWindow();
        // Pencere açıldıktan sonra sohbete git
        if (targetChatId) {
          setTimeout(() => {
            openTelegramChat(targetChatId);
          }, 1500); // Telegram yüklenmesini bekle
        }
      }
      
      // Bildirimleri temizle
      telegramNotifications.clear();
    });
    
    notif.show();
  } catch (err) {
    console.error('Bildirim gösterme hatası:', err);
  }
}

function updateTelegramBadge(count) {
  const prev = telegramBadgeCount;
  const next = Number.isFinite(count) ? count : 0;
  telegramBadgeCount = next;
  
  // Okunmamış mesaj sayısı 0'a düştüğünde bildirim geçmişini temizle
  if (next === 0 && prev > 0) {
    telegramNotifications.clear();
  }
  
  try { mainWindow?.webContents.send('telegram-badge', next); } catch (_err) { /* ignore */ }
  try { telegramWindow?.setTitle(next > 0 ? `Telegram (${next})` : 'Telegram'); } catch (_err) { /* ignore */ }
  try { app.setBadgeCount(next); } catch (_err) { /* ignore */ }
  try {
    telegramWindow?.webContents.executeJavaScript(
      `(() => { const el = document.getElementById('tg-title'); if (!el) return; const c = ${next}; el.textContent = c > 0 ? 'Telegram (' + c + ')' : 'Telegram'; })();`,
      true
    );
  } catch (_err) { /* ignore */ }
  try {
    if (process.platform === 'win32') {
      if (next > 0) {
        const icon = createOverlayIcon(next);
        mainWindow?.setOverlayIcon(icon, `Telegram unread: ${next}`);
      } else {
        mainWindow?.setOverlayIcon(null, '');
      }
    }
  } catch (_err) { /* ignore */ }
}

function startTelegramTitlePolling() {
  stopTelegramTitlePolling();
  telegramTitlePoll = setInterval(async () => {
    if (!telegramWindow || telegramWindow.isDestroyed()) {
      stopTelegramTitlePolling();
      return;
    }
    try {
      const count = await telegramWindow.webContents.executeJavaScript(TELEGRAM_UNREAD_JS, { timeout: 1500 });
      updateTelegramBadge(count);
    } catch (_err) {
      /* ignore */
    }
  }, 4000);
}

function positionTelegramWindow(force = false) {
  if (!telegramWindow || telegramWindow.isDestroyed() || !mainWindow) return;
  if (telegramUserMoved && !force && telegramPos.x !== null && telegramPos.y !== null) {
    const desired = { x: telegramPos.x, y: telegramPos.y, width: telegramSize.width, height: telegramSize.height };
    const safe = ensureBoundsOnScreen(desired);
    try { telegramWindow.setBounds(safe); } catch (_err) { /* ignore */ }
    // If we had to clamp to screen, update stored pos.
    if (safe.x !== desired.x || safe.y !== desired.y) {
      telegramPos = { x: safe.x, y: safe.y };
    }
    return;
  }
  const parentBounds = mainWindow.getContentBounds();
  const x = parentBounds.x + SIDEBAR_WIDTH + 20;
  const y = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const height = telegramSize.height;
  const width = telegramSize.width;
  try { telegramWindow.setBounds(ensureBoundsOnScreen({ x, y, width, height })); } catch (_err) { /* ignore */ }
}

function openPanelWindow() {
  if (!mainWindow) return;
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelReady = true;
    positionPanelWindow(false);
    panelWindow.show();
    panelWindow.focus();
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH;
  const height = panelSize.height;
  const width = panelSize.width;

  panelWindow = new BrowserWindow({
    width,
    height,
    x: panelPos.x !== null ? panelPos.x : defaultX,
    y: panelPos.y !== null ? panelPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 100,
    minHeight: 100,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
    panelReady = false;
  });

  panelWindow.webContents.on('did-finish-load', () => {
    panelReady = true;
  });

  panelWindow.on('resize', () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;
    const b = panelWindow.getBounds();
    panelSize = { width: b.width, height: b.height };
  });

  panelWindow.on('move', () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;
    const b = panelWindow.getBounds();
    panelUserMoved = true;
    panelPos = { x: b.x, y: b.y };
  });

  panelWindow.on('focus', () => {
    hideNotesWindow();
  });

  panelWindow.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
}

function togglePanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    if (panelWindow.isVisible()) {
      panelWindow.hide();
    } else {
      panelReady = true;
      positionPanelWindow(false);
      panelWindow.show();
      panelWindow.focus();
    }
    return;
  }
  openPanelWindow();
}

function openNotesWindow() {
  if (!mainWindow) return;
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesReady = true;
    positionNotesWindow(false);
    notesWindow.show();
    notesWindow.focus();
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  // Responsive yükseklik: parent window yüksekliğinin %80'i
  const maxHeight = Math.floor((parentBounds.height - TABBAR_HEIGHT - TOOLBAR_HEIGHT - 40) * 0.8);
  const height = Math.min(notesSize.height, maxHeight);
  const width = notesSize.width;

  notesWindow = new BrowserWindow({
    width,
    height,
    x: notesPos.x !== null ? notesPos.x : defaultX,
    y: notesPos.y !== null ? notesPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: true,
    minWidth: 240,
    minHeight: 240,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'notes-preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  notesWindow.on('close', (event) => {
    // Uygulama kapanıyorsa gerçekten kapat
    if (exiting) return;
    // Normal kapanma isteklerinde sadece gizle
    event.preventDefault();
    hideNotesWindow();
  });

  notesWindow.on('closed', () => {
    notesWindow = null;
    notesReady = false;
  });

  notesWindow.webContents.on('did-finish-load', () => {
    notesReady = true;
  });

  // Notlar için context menu
  notesWindow.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Kopyala',
        role: 'copy',
        enabled: params.editFlags?.canCopy || params.selectionText?.length > 0
      },
      {
        label: 'Kes',
        role: 'cut',
        enabled: params.editFlags?.canCut
      },
      {
        label: 'Yapıştır',
        role: 'paste',
        enabled: params.editFlags?.canPaste
      },
      { type: 'separator' },
      {
        label: 'Tümünü Seç',
        role: 'selectAll'
      },
      { type: 'separator' },
      {
        label: 'DevTools',
        click: () => notesWindow.webContents.openDevTools({ mode: 'detach' })
      }
    ]);
    menu.popup({ window: notesWindow });
  });

  notesWindow.on('resize', () => {
    if (!notesWindow || notesWindow.isDestroyed()) return;
    const b = notesWindow.getBounds();
    notesSize = { width: b.width, height: b.height };
  });

  notesWindow.on('move', () => {
    if (!notesWindow || notesWindow.isDestroyed()) return;
    const b = notesWindow.getBounds();
    notesUserMoved = true;
    notesPos = { x: b.x, y: b.y };
  });

  notesWindow.loadFile(path.join(__dirname, 'renderer', 'notlar.html'));
}

function toggleNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) {
    if (notesWindow.isVisible()) {
      notesWindow.hide();
    } else {
      notesReady = true;
      positionNotesWindow(false);
      notesWindow.show();
      notesWindow.focus();
    }
    return;
  }
  openNotesWindow();
}

function openTelegramWindow() {
  if (!mainWindow) return;
  if (!allowTelegramSession) return;
  if (panelWindow && !panelWindow.isDestroyed()) {
    try { panelWindow.close(); } catch (_err) { /* ignore */ }
  }
  if (telegramWindow && !telegramWindow.isDestroyed()) {
    telegramReady = true;
    try { positionTelegramWindow(false); } catch (_err) { /* ignore */ }
    try { telegramWindow.show(); } catch (_err) { /* ignore */ }
    try { telegramWindow.focus(); } catch (_err) { /* ignore */ }
    return;
  }

  const parentBounds = mainWindow.getContentBounds();
  const defaultY = parentBounds.y + TABBAR_HEIGHT + TOOLBAR_HEIGHT + 20;
  const defaultX = parentBounds.x + SIDEBAR_WIDTH + 20;
  const height = telegramSize.height;
  const width = telegramSize.width;

  telegramWindow = new BrowserWindow({
    width,
    height,
    x: telegramPos.x !== null ? telegramPos.x : defaultX,
    y: telegramPos.y !== null ? telegramPos.y : defaultY,
    parent: mainWindow,
    modal: false,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b0d10',
      symbolColor: '#e6ecff',
      height: 32
    },
    resizable: true,
    minWidth: 320,
    minHeight: 480,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1115',
    show: true,
    webPreferences: {
      partition: 'temp:telegram',
      preload: path.join(__dirname, 'telegram-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      allowRunningInsecureContent: true,
      webSecurity: false,
      devTools: false
    }
  });

  telegramWindow.webContents.on('devtools-opened', () => {
    telegramWindow.webContents.closeDevTools();
  });

  telegramWindow.on('unresponsive', () => {
    // Telegram web bazen renderer'i kilitleyebiliyor; yeniden oluştur.
    forceRecreateTelegramWindow('unresponsive');
  });

  telegramWindow.webContents.on('render-process-gone', (_event, details) => {
    forceRecreateTelegramWindow(`render-process-gone:${details?.reason || 'unknown'}`);
  });

  telegramWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      event.preventDefault();
    }
  });

  try {
    telegramWindow.webContents.setUserAgent(TELEGRAM_UA);
  } catch (_err) {
    /* ignore */
  }

  try {
    telegramWindow.webContents.setUserAgent(TELEGRAM_UA);
  } catch (_err) {
    /* ignore */
  }

  telegramWindow.on('close', (event) => {
    // Hide instead of destroying so it stays active/quick to reopen.
    if (exiting) return;
    event.preventDefault();
    telegramWindow.hide();
  });

  telegramWindow.webContents.on('did-finish-load', () => {
    telegramReady = true;
    startTelegramTitlePolling();
    try { telegramWindow.webContents.insertCSS(TELEGRAM_DRAG_CSS); } catch (_err) { /* ignore */ }
    const insertBar = `(() => {
      const bar = document.createElement('div');
      bar.className = 'tg-drag-bar';
      const title = document.createElement('div');
      title.className = 'tg-title';
      title.id = 'tg-title';
      title.textContent = 'Telegram';
      bar.appendChild(title);
      document.body.appendChild(bar);
    })();`;
    try { telegramWindow.webContents.executeJavaScript(insertBar); } catch (_err) { /* ignore */ }
  });

  telegramWindow.webContents.on('page-title-updated', (_event, title) => {
    const count = parseTelegramCount(title);
    updateTelegramBadge(count);
  });

  // Telegram Web'in kendi bildirimlerini yakala ve özelleştir
  telegramWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'notifications') {
      callback(true); // Bildirimlere izin ver
    } else {
      callback(false);
    }
  });

  // Web Notification API'sini intercept et - grup simgesi ve chatId ile
  telegramWindow.webContents.on('did-finish-load', () => {
    telegramWindow.webContents.executeJavaScript(`
      (function() {
        const OriginalNotification = window.Notification;
        
        window.Notification = function(title, options) {
          
          // Chat ID'yi tag'den çıkar
          const chatId = options?.tag || '';
          const iconUrl = options?.icon || '';
          
          // Resmi background'da data URL'ye çevir (http, https veya blob URL'leri için)
          if (iconUrl && (iconUrl.startsWith('http') || iconUrl.startsWith('blob:'))) {
            fetch(iconUrl)
              .then(response => response.blob())
              .then(blob => {
                return new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.readAsDataURL(blob);
                });
              })
              .then(dataUrl => {
                if (window.electron?.ipcRenderer) {
                  window.electron.ipcRenderer.send('telegram-notification', {
                    title: title || 'Telegram',
                    body: options?.body || '',
                    tag: chatId,
                    icon: dataUrl
                  });
                }
              })
              .catch(err => {
                console.error('❌ Resim yükleme hatası:', err);
                // Resim yüklenemezse URL'yi gönder
                if (window.electron?.ipcRenderer) {
                  window.electron.ipcRenderer.send('telegram-notification', {
                    title: title || 'Telegram',
                    body: options?.body || '',
                    tag: chatId,
                    icon: iconUrl
                  });
                }
              });
          } else {
            // Icon URL yoksa direkt gönder
            if (window.electron?.ipcRenderer) {
              window.electron.ipcRenderer.send('telegram-notification', {
                title: title || 'Telegram',
                body: options?.body || '',
                tag: chatId,
                icon: iconUrl
              });
            }
          }
          
          // Orijinal bildirimi gösterme (kendi bildirimlerimizi gösteriyoruz)
          // return new OriginalNotification(title, options);
        };
        
        window.Notification.permission = OriginalNotification.permission;
        window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
        
      })();
    `).catch(err => console.error('Bildirim script hatası:', err));
  });

  // Her sayfa yüklendiğinde script'i tekrar enjekte et
  telegramWindow.webContents.on('did-navigate-in-page', () => {
    telegramWindow.webContents.executeJavaScript(`
      if (!window.NotificationIntercepted) {
        const OriginalNotification = window.Notification;
        window.Notification = function(title, options) {
          const chatId = options?.tag || '';
          const iconUrl = options?.icon || '';
          
          // Resmi background'da yükle
          if (iconUrl && iconUrl.startsWith('http') && window.electron?.ipcRenderer) {
            fetch(iconUrl)
              .then(response => response.blob())
              .then(blob => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              }))
              .then(dataUrl => {
                window.electron.ipcRenderer.send('telegram-notification', {
                  title: title || 'Telegram',
                  body: options?.body || '',
                  tag: chatId,
                  icon: dataUrl
                });
              })
              .catch(() => {
                window.electron.ipcRenderer.send('telegram-notification', {
                  title: title || 'Telegram',
                  body: options?.body || '',
                  tag: chatId,
                  icon: iconUrl
                });
              });
          } else if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('telegram-notification', {
              title: title || 'Telegram',
              body: options?.body || '',
              tag: chatId,
              icon: iconUrl
            });
          }
        };
        window.Notification.permission = OriginalNotification.permission;
        window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
        window.NotificationIntercepted = true;
      }
    `).catch(() => {});
  });

  telegramWindow.on('closed', () => {
    stopTelegramTitlePolling();
    telegramWindow = null;
    telegramReady = false;
    updateTelegramBadge(telegramBadgeCount);
  });

  telegramWindow.on('resize', () => {
    if (!telegramWindow || telegramWindow.isDestroyed()) return;
    const b = telegramWindow.getBounds();
    telegramSize = { width: b.width, height: b.height };
  });

  telegramWindow.on('move', () => {
    if (!telegramWindow || telegramWindow.isDestroyed()) return;
    const b = telegramWindow.getBounds();
    telegramUserMoved = true;
    telegramPos = { x: b.x, y: b.y };
  });

  // Telegram içinde açılan yeni pencereleri ana tarayıcı gibi handle et
  telegramWindow.webContents.setWindowOpenHandler((details) => {
    const targetUrl = String(details?.url || '').trim();
    const disposition = details?.disposition;
    const frameName = String(details?.frameName || '').toLowerCase();
    const features = String(details?.features || '').toLowerCase();
    
    // OAuth, ödeme, query parametreli popup'lar için gerçek görünür pencere aç
    const needsRealPopup = 
      /oauth|auth|login|signin|authorize|payment|pay|checkout|verify|2fa|mfa|code=|commonCode=/i.test(targetUrl) ||
      /oauth|auth|login|payment/i.test(frameName) ||
      disposition === 'new-popup' ||
      /popup=/.test(features);

    if (needsRealPopup) {
      // Gerçek popup penceresi - görünür, küçük boyutlu
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 700,
          center: true,
          modal: false,
          minimizable: true,
          maximizable: true,
          closable: true,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          webPreferences: {
            partition: 'temp:telegram',
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    }

    // Normal tab/window açma istekleri için ana tarayıcıda yeni tab aç
    installPopupRedirectBridge(telegramWindow.webContents, (u) => sendOpenNewTab('left', u));
    const shouldNewTab = disposition === 'foreground-tab' || disposition === 'background-tab' || disposition === 'new-window' || disposition === 'default';

    if (shouldNewTab) {
      // Allow a hidden popup so window.open() returns a handle; then bridge its navigation into a new tab.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          webPreferences: {
            partition: 'temp:telegram',
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    }

    // Diğer durumlar: URL'i ana tarayıcıda aç
    if (targetUrl) sendOpenNewTab('left', targetUrl);
    return { action: 'deny' };
  });

  telegramWindow.loadURL(TELEGRAM_URL);
  updateTelegramBadge(telegramBadgeCount);
}


function getActiveView(side) {
  const id = activeTab[side];
  if (!id) return null;
  return tabViews[side].get(id) || null;
}

function getPartitionForSide(side) {
  return side === 'left' ? 'temp:left' : 'temp:right';
}

function setupFindListeners(view) {
  if (!view?.webContents) return;
  
  view.webContents.on('found-in-page', (event, result) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('find-result', result);
    }
  });
}

function sendOpenNewTab(side, url) {
  try {
    mainWindow?.webContents.send('open-new-tab', { side, url });
  } catch (_err) {
    /* ignore */
  }
}

function installPopupRedirectBridge(openerWebContents, onUrl) {
  if (!openerWebContents) return;
  if (openerWebContents.__ghostPopupBridgeInstalled) return;
  openerWebContents.__ghostPopupBridgeInstalled = true;

  const stripHash = (u) => {
    const s = String(u || '').trim();
    if (!s) return '';
    const idx = s.indexOf('#');
    return idx >= 0 ? s.slice(0, idx) : s;
  };

  let openerUrl = '';
  try { openerUrl = stripHash(openerWebContents.getURL?.()); } catch (_err) { openerUrl = ''; }

  openerWebContents.on('did-create-window', (childWindow) => {
    if (!childWindow || childWindow.isDestroyed?.()) return;

    // Keep popups hidden; we will forward the final navigation to our UI.
    try { childWindow.setMenuBarVisibility(false); } catch (_err) { /* ignore */ }
    try { childWindow.hide(); } catch (_err) { /* ignore */ }

    const wc = childWindow.webContents;
    let forwarded = false;

    const maybeForward = (rawUrl) => {
      if (forwarded) return;
      const url = String(rawUrl || '').trim();
      if (!url) return;
      // Ignore placeholder URLs; popups often start with about:blank and later redirect.
      if (/^about:/i.test(url) || /^javascript:/i.test(url)) return;

      // Some sites first open a popup at the *same* URL as the opener (or do an initial
      // navigate to the opener URL) and only later redirect to the real target.
      // If we forward too early, the user sees "same page" in the new tab.
      const comparable = stripHash(url);
      if (openerUrl && comparable && comparable === openerUrl) return;

      forwarded = true;
      try { onUrl(url); } catch (_err) { /* ignore */ }
      try { setTimeout(() => { try { childWindow.close(); } catch (_e) { /* ignore */ } }, 50); } catch (_err) { /* ignore */ }
    };

    try {
      wc.on('will-redirect', (_e, url) => maybeForward(url));
      wc.on('did-navigate', (_e, url) => maybeForward(url));
      wc.on('did-navigate-in-page', (_e, url) => maybeForward(url));
    } catch (_err) {
      /* ignore */
    }

    // Failsafe: if nothing happens quickly, forward whatever URL the popup ended up at.
    setTimeout(() => {
      if (forwarded) return;
      try { maybeForward(wc.getURL?.()); } catch (_err) { /* ignore */ }
    }, 1500);

    // Hard close in case of stuck popups.
    setTimeout(() => {
      try { childWindow.close(); } catch (_err) { /* ignore */ }
    }, 12000);
  });
}

function openStandaloneWindow(side, url) {
  const titlePrefix = side === 'left' ? 'Sol Pencere' : 'Sağ Pencere';
  const initialUrl = normalizeUrl(url) || 'https://www.google.com';
  const partition = getPartitionForSide(side);

  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    frame: false,
    title: `${titlePrefix} - ${initialUrl}`,
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, 'resources', 'icons', 'ogame.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  // Ana tarayıcıdaki gibi toolbar yükle
  win.loadFile(path.join(__dirname, 'renderer', 'standalone-toolbar.html'));

  // URL'i script'e aktarmak için
  win.webContents.once('did-finish-load', () => {
    // Home veya error sayfaları için URL bar'ı boş bırak
    const isSpecialPage = initialUrl.includes('/home.html') || initialUrl.includes('/error.html');
    if (!isSpecialPage) {
      win.webContents.executeJavaScript(`
        if (document.getElementById('url')) {
          document.getElementById('url').value = '${initialUrl.replace(/'/g, "\\'")}';
          if (typeof updateSSL === 'function') updateSSL('${initialUrl.replace(/'/g, "\\'")}');
          if (typeof updateFavicon === 'function') updateFavicon('${initialUrl.replace(/'/g, "\\'")}');
        }
      `).catch(() => {});
    }
  });

  const TOOLBAR_HEIGHT = 82; // 36px titlebar + 46px toolbar
  
  // BrowserView kullan (webview yerine) - aynı session/cookie paylaşımı için
  const view = createBrowserView(partition);
  setupFindListeners(view);
  win.setBrowserView(view);
  
  const updateBounds = () => {
    const bounds = win.getContentBounds();
    view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: bounds.width, height: bounds.height - TOOLBAR_HEIGHT });
  };
  
  updateBounds();
  win.on('resize', updateBounds);
  
  // IPC handlers for toolbar controls
  const standaloneHandlers = {
    back: () => {
      if (view.webContents.canGoBack()) view.webContents.goBack();
    },
    forward: () => {
      if (view.webContents.canGoForward()) view.webContents.goForward();
    },
    reload: () => {
      view.webContents.reload();
    },
    windowMinimize: () => {
      if (win && !win.isDestroyed()) win.minimize();
    },
    windowMaximize: () => {
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      }
    },
    windowClose: () => {
      if (win && !win.isDestroyed()) win.close();
    },
    loadUrl: (_event, url) => {
      view.webContents.loadURL(normalizeUrl(url));
    },
    zoomIn: () => {
      const current = view.webContents.getZoomFactor();
      const newZoom = Math.min(3, current + 0.1);
      view.webContents.setZoomFactor(newZoom);
      win.webContents.send('standalone-zoom-update', newZoom);
    },
    zoomOut: () => {
      const current = view.webContents.getZoomFactor();
      const newZoom = Math.max(0.25, current - 0.1);
      view.webContents.setZoomFactor(newZoom);
      win.webContents.send('standalone-zoom-update', newZoom);
    },
    zoomReset: () => {
      view.webContents.setZoomFactor(1);
      win.webContents.send('standalone-zoom-update', 1);
    }
  };
  
  // Standalone window için zoom menüsü penceresi
  let standaloneZoomWin = null;
  const openStandaloneZoomMenu = () => {
    if (standaloneZoomWin && !standaloneZoomWin.isDestroyed()) {
      if (standaloneZoomWin.isVisible()) {
        standaloneZoomWin.hide();
        return;
      }
    } else {
      standaloneZoomWin = new BrowserWindow({
        width: 250,
        height: 165,
        parent: win,
        modal: false,
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      standaloneZoomWin.setMenu(null);
      standaloneZoomWin.loadFile(path.join(__dirname, 'renderer', 'standalone-zoom-menu.html'));
      
      standaloneZoomWin.on('blur', () => {
        if (standaloneZoomWin && !standaloneZoomWin.isDestroyed()) {
          standaloneZoomWin.hide();
        }
      });
    }
    
    // Konumu ayarla - zoom butonunun altında
    const winBounds = win.getBounds();
    const zoomBtnX = winBounds.width - 300;
    standaloneZoomWin.setBounds({
      x: winBounds.x + zoomBtnX,
      y: winBounds.y + 50,
      width: 250,
      height: 165
    });
    
    standaloneZoomWin.show();
    
    // Mevcut zoom değerini gönder
    setTimeout(() => {
      if (standaloneZoomWin && !standaloneZoomWin.isDestroyed()) {
        const currentZoom = view.webContents.getZoomFactor();
        standaloneZoomWin.webContents.send('standalone-zoom-update', currentZoom);
      }
    }, 100);
  };
  
  standaloneHandlers.openZoomMenu = openStandaloneZoomMenu;
  
  // Standalone window için site info penceresi
  let standaloneSiteInfoWin = null;
  const openStandaloneSiteInfo = (_event, payload) => {
    if (standaloneSiteInfoWin && !standaloneSiteInfoWin.isDestroyed()) {
      if (standaloneSiteInfoWin.isVisible()) {
        standaloneSiteInfoWin.hide();
        return;
      }
    } else {
      standaloneSiteInfoWin = new BrowserWindow({
        width: 340,
        height: 480,
        parent: win,
        modal: false,
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      standaloneSiteInfoWin.setMenu(null);
      standaloneSiteInfoWin.loadFile(path.join(__dirname, 'renderer', 'standalone-site-info.html'));
      
      standaloneSiteInfoWin.on('blur', () => {
        if (standaloneSiteInfoWin && !standaloneSiteInfoWin.isDestroyed()) {
          standaloneSiteInfoWin.hide();
        }
      });
    }
    
    // Konumu ayarla - SSL butonunun altında
    const rect = payload?.rect || {};
    const winBounds = win.getBounds();
    const btnLeft = Number(rect.left) || 50;
    const btnBottom = Number(rect.bottom) || 50;
    
    standaloneSiteInfoWin.setBounds({
      x: winBounds.x + btnLeft,
      y: winBounds.y + btnBottom + 5,
      width: 340,
      height: 480
    });
    
    standaloneSiteInfoWin.show();
    
    // Site info'yu refresh et
    setTimeout(() => {
      if (standaloneSiteInfoWin && !standaloneSiteInfoWin.isDestroyed()) {
        try {
          standaloneSiteInfoWin.webContents.send('standalone-site-info-refresh');
        } catch (err) {
          console.error('Site info refresh error:', err);
        }
      }
    }, 100);
  };
  
  standaloneHandlers.openSiteInfo = openStandaloneSiteInfo;
  
  // Standalone window için get-site-info handler
  const getSiteInfoHandler = async () => {
    const url = view?.webContents?.getURL?.() || '';
    let host = '';
    let protocol = '';
    try {
      const u = new URL(url);
      host = u.hostname || '';
      protocol = u.protocol || '';
    } catch (_err) {
      host = '';
      protocol = '';
    }

    const isSecure = typeof url === 'string' && url.startsWith('https://');
    let certSummary = null;
    try {
      const cert = view?.webContents?.getCertificate?.();
      if (cert) {
        certSummary = {
          subjectName: String(cert.subjectName || ''),
          issuerName: String(cert.issuerName || ''),
          validStart: cert.validStart ? String(cert.validStart) : '',
          validExpiry: cert.validExpiry ? String(cert.validExpiry) : '',
          fingerprint: String(cert.fingerprint || ''),
          serialNumber: String(cert.serialNumber || '')
        };
      }
    } catch (_err) {
      certSummary = null;
    }

    const permissions = {};
    const cleanHost = sanitizeHostForAllowList(host);
    for (const kind of Object.keys(permissionStore)) {
      const bucket = permissionStore[kind];
      if (!cleanHost) {
        permissions[kind] = 'ask';
        continue;
      }
      if (bucket?.allow?.has?.(cleanHost)) permissions[kind] = 'allow';
      else if (bucket?.deny?.has?.(cleanHost)) permissions[kind] = 'deny';
      else permissions[kind] = 'ask';
    }

    let cookieCount = 0;
    let cookieBytes = 0;
    if (cleanHost) {
      try {
        const cookies = await getCookiesForHost(cleanHost);
        cookieCount = cookies.length;
        cookieBytes = cookies.reduce((sum, c) => sum + Buffer.byteLength(`${c.name || ''}=${c.value || ''}`, 'utf8'), 0);
      } catch (_err) {
        cookieCount = 0;
        cookieBytes = 0;
      }
    }

    return {
      url,
      host,
      protocol,
      isSecure,
      certificate: certSummary,
      cookies: { count: cookieCount, bytes: cookieBytes },
      permissions
    };
  };
  
  standaloneHandlers.getSiteInfo = getSiteInfoHandler;
  
  ipcMain.on('standalone-go-back', standaloneHandlers.back);
  ipcMain.on('standalone-go-forward', standaloneHandlers.forward);
  ipcMain.on('standalone-reload', standaloneHandlers.reload);
  ipcMain.on('standalone-load-url', standaloneHandlers.loadUrl);
  ipcMain.on('standalone-zoom-in', standaloneHandlers.zoomIn);
  ipcMain.on('standalone-zoom-out', standaloneHandlers.zoomOut);
  ipcMain.on('standalone-zoom-reset', standaloneHandlers.zoomReset);
  ipcMain.on('open-standalone-zoom-menu', standaloneHandlers.openZoomMenu);
  ipcMain.on('open-standalone-site-info', standaloneHandlers.openSiteInfo);
  ipcMain.handle('get-standalone-site-info', standaloneHandlers.getSiteInfo);
  ipcMain.on('standalone-window-minimize', standaloneHandlers.windowMinimize);
  ipcMain.on('standalone-window-maximize', standaloneHandlers.windowMaximize);
  ipcMain.on('standalone-window-close', standaloneHandlers.windowClose);
  
  // Cleanup on close
  win.on('closed', () => {
    if (standaloneZoomWin && !standaloneZoomWin.isDestroyed()) {
      standaloneZoomWin.close();
    }
    if (standaloneSiteInfoWin && !standaloneSiteInfoWin.isDestroyed()) {
      standaloneSiteInfoWin.close();
    }
    ipcMain.removeListener('standalone-go-back', standaloneHandlers.back);
    ipcMain.removeListener('standalone-go-forward', standaloneHandlers.forward);
    ipcMain.removeListener('standalone-reload', standaloneHandlers.reload);
    ipcMain.removeListener('standalone-load-url', standaloneHandlers.loadUrl);
    ipcMain.removeListener('standalone-zoom-in', standaloneHandlers.zoomIn);
    ipcMain.removeListener('standalone-zoom-out', standaloneHandlers.zoomOut);
    ipcMain.removeListener('standalone-zoom-reset', standaloneHandlers.zoomReset);
    ipcMain.removeListener('open-standalone-zoom-menu', standaloneHandlers.openZoomMenu);
    ipcMain.removeListener('open-standalone-site-info', standaloneHandlers.openSiteInfo);
    ipcMain.removeHandler('get-standalone-site-info');
    ipcMain.removeListener('standalone-window-minimize', standaloneHandlers.windowMinimize);
    ipcMain.removeListener('standalone-window-maximize', standaloneHandlers.windowMaximize);
    ipcMain.removeListener('standalone-window-close', standaloneHandlers.windowClose);
  });
  
  // Navigation events - update toolbar
  const sendNavState = () => {
    win.webContents.send('standalone-nav-state', {
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward()
    });
  };
  
  view.webContents.on('did-navigate', (_event, url) => {
    const fullTitle = `${titlePrefix} - ${url}`;
    win.setTitle(fullTitle);
    win.webContents.send('standalone-title-update', fullTitle);
    win.webContents.send('standalone-navigate', url);
    sendNavState();
    // Site info penceresini güncelle
    if (standaloneSiteInfoWin && !standaloneSiteInfoWin.isDestroyed() && standaloneSiteInfoWin.isVisible()) {
      try {
        standaloneSiteInfoWin.webContents.send('standalone-site-info-refresh');
      } catch (_err) {}
    }
  });
  
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    win.webContents.send('standalone-navigate', url);
    sendNavState();
    // Site info penceresini güncelle
    if (standaloneSiteInfoWin && !standaloneSiteInfoWin.isDestroyed() && standaloneSiteInfoWin.isVisible()) {
      try {
        standaloneSiteInfoWin.webContents.send('standalone-site-info-refresh');
      } catch (_err) {}
    }
  });
  
  view.webContents.on('page-title-updated', (_event, title) => {
    const fullTitle = title ? `${titlePrefix} - ${title}` : titlePrefix;
    win.setTitle(fullTitle);
    win.webContents.send('standalone-title-update', fullTitle);
  });
  
  // Loading state events
  view.webContents.on('did-start-loading', () => {
    win.webContents.send('standalone-load-start');
  });
  
  view.webContents.on('did-stop-loading', () => {
    win.webContents.send('standalone-load-stop');
  });
  
  // Sayfa yüklenme hataları için error sayfası
  let lastValidUrl = initialUrl;
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    
    // Frame hataları veya iptal edilenler için hata sayfası gösterme
    if (errorCode === -3) return; // ERR_ABORTED
    if (errorCode === -27) return; // ERR_BLOCKED_BY_CLIENT
    if (errorCode === 0) return; // Başarılı
    if (validatedURL && validatedURL.startsWith('chrome-error://')) return;
    if (validatedURL && validatedURL.startsWith('file://')) return; // Kendi error sayfamız
    
    console.log('Standalone page load failed:', errorCode, errorDescription, validatedURL);
    
    // Başarısız URL'i kaydet
    if (validatedURL) lastValidUrl = validatedURL;
    
    const errorPagePath = path.join(__dirname, 'renderer', 'error.html').replace(/\\/g, '/');
    const errorPageUrl = `file:///${errorPagePath}?code=${encodeURIComponent(getErrorName(errorCode))}&desc=${encodeURIComponent(errorDescription || 'Sayfa yüklenirken hata oluştu')}&url=${encodeURIComponent(validatedURL || lastValidUrl)}&validated=${encodeURIComponent(validatedURL || '')}`;
    
    view.webContents.loadURL(errorPageUrl).catch((err) => {
      console.error('Failed to load error page:', err);
    });
  });
  
  // Context menu - Standalone window için özel menü
  view.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Geri',
        enabled: view.webContents.canGoBack(),
        click: () => view.webContents.goBack()
      },
      {
        label: 'İleri',
        enabled: view.webContents.canGoForward(),
        click: () => view.webContents.goForward()
      },
      { type: 'separator' },
      {
        label: 'Yenile',
        click: () => view.webContents.reload()
      },
      { type: 'separator' },
      {
        label: view.webContents.isAudioMuted() ? 'Sesi Aç' : 'Sessize Al',
        click: () => view.webContents.setAudioMuted(!view.webContents.isAudioMuted())
      },
      { type: 'separator' },
      {
        label: 'Sayfayı Yeni Pencerede Aç',
        click: () => {
          try { openStandaloneWindow(side, view.webContents.getURL()); } catch (err) { console.error('open new window failed', err); }
        }
      },
      {
        label: 'Sayfayı Sol Pencerede Aç',
        click: () => sendOpenNewTab('left', view.webContents.getURL())
      },
      {
        label: 'Sayfayı Sağ Pencerede Aç',
        click: () => sendOpenNewTab('right', view.webContents.getURL())
      },
      ...(params.linkURL ? [
        { type: 'separator' },
        {
          label: 'Bağlantıyı Yeni Pencerede Aç',
          click: () => {
            try { openStandaloneWindow(side, params.linkURL); } catch (err) { console.error('open new window failed', err); }
          }
        },
        {
          label: 'Bağlantıyı Sol Pencerede Aç',
          click: () => sendOpenNewTab('left', params.linkURL)
        },
        {
          label: 'Bağlantıyı Sağ Pencerede Aç',
          click: () => sendOpenNewTab('right', params.linkURL)
        }
      ] : []),
      { type: 'separator' },
      {
        label: 'Kopyala',
        role: 'copy',
        enabled: params.editFlags?.canCopy || params.selectionText?.length > 0
      },
      {
        label: 'Kes',
        role: 'cut',
        enabled: params.editFlags?.canCut
      },
      {
        label: 'Yapıştır',
        role: 'paste',
        enabled: params.editFlags?.canPaste
      },
      {
        label: 'Tümünü Seç',
        role: 'selectAll'
      },
      ...(params.linkURL ? [
        { type: 'separator' },
        {
          label: 'Bağlantıyı Harici Tarayıcıda Aç',
          click: () => {
            try { shell.openExternal(params.linkURL); } catch (err) { console.error('open link failed', err); }
          }
        }
      ] : [])
    ]);
    menu.popup({ window: win });
  });
  
  // Yeni pencere açma isteklerini engelle veya yeni tab olarak aç
  view.webContents.setWindowOpenHandler((details) => {
    if (!isPopupsAllowedForWebContents(view.webContents)) {
      return { action: 'deny' };
    }

    const targetUrl = String(details?.url || '').trim();
    const disposition = details?.disposition;
    const frameName = String(details?.frameName || '').toLowerCase();
    const features = String(details?.features || '').toLowerCase();
    
    // Permission store'da açıkça allow edilmiş mi kontrol et
    const host = getHostFromUrl(view.webContents?.getURL?.() || '');
    const popupDecision = getPermissionDecision('popups', host);
    const explicitlyAllowed = popupDecision === 'allow';
    
    // OAuth, ödeme, query parametreli ve açıkça izin verilmiş popup'lar için gerçek görünür pencere aç
    const needsRealPopup = 
      explicitlyAllowed ||
      /oauth|auth|login|signin|authorize|payment|pay|checkout|verify|2fa|mfa|code=|commonCode=/i.test(targetUrl) ||
      /oauth|auth|login|payment/i.test(frameName) ||
      disposition === 'new-popup' ||
      /popup=/.test(features);

    if (needsRealPopup) {
      // Gerçek popup penceresi - görünür, küçük boyutlu
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 700,
          center: true,
          modal: false,
          minimizable: true,
          maximizable: true,
          closable: true,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    }

    // Normal popup'lar için mevcut hidden popup + tab redirect sistemi
    installPopupRedirectBridge(view.webContents, (u) => sendOpenNewTab(side, u));
    const shouldNewTab = disposition === 'foreground-tab' || disposition === 'background-tab' || disposition === 'new-window' || disposition === 'default';

    if (shouldNewTab) {
      // Allow a hidden popup so window.open() returns a handle; then bridge its navigation into a new tab.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    }

    // Non-tab dispositions: keep old behavior (block popups).
    if (targetUrl) sendOpenNewTab(side, targetUrl);
    return { action: 'deny' };
  });
  
  // URL'yi yükle
  view.webContents.loadURL(initialUrl);
  
  // Cleanup on close
  win.on('closed', () => {
    ipcMain.removeAllListeners('standalone-go-back');
    ipcMain.removeAllListeners('standalone-go-forward');
    ipcMain.removeAllListeners('standalone-reload');
    ipcMain.removeAllListeners('standalone-load-url');
  });
}

function wireNavigationEvents(view, side, tabId) {
  const channel = `url-updated-${side}`;
  const titleChannel = `title-updated-${side}`;
  const zoomChannel = `zoom-updated-${side}`;
  
  // Son başarılı URL'i sakla (hata sayfası için)
  let lastValidUrl = '';
  
  const sendUrl = (url) => {
    try {
      // Hata sayfası URL'i ise address bar'ı güncelleme
      if (url && url.includes('/error.html')) {
        return;
      }
      // Geçerli URL'i sakla
      lastValidUrl = url;
      mainWindow?.webContents.send(channel, { tabId, url });
    } catch (err) {
      console.error('send url failed', err);
    }
  };
  const sendZoom = (zoomFactor) => {
    try {
      const z = Number.isFinite(zoomFactor) ? zoomFactor : (view?.webContents?.getZoomFactor?.() || 1);
      mainWindow?.webContents.send(zoomChannel, { tabId, zoomFactor: z });
    } catch (err) {
      console.error('send zoom failed', err);
    }
  };
  const clampViewZoom = (f) => {
    const n = Number(f);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(0.25, n));
  };
  const stepZoom = (dir) => {
    try {
      const current = view?.webContents?.getZoomFactor?.() || 1;
      const next = clampViewZoom(Number((current + (dir * 0.1)).toFixed(2)));
      view?.webContents?.setZoomFactor?.(next);
      sendZoom(next);
    } catch (_err) {
      /* ignore */
    }
  };
  const sendTitle = (title) => {
    try {
      mainWindow?.webContents.send(titleChannel, { tabId, title });
    } catch (err) {
      console.error('send title failed', err);
    }
  };

  view.webContents.on('did-navigate', (_event, url) => sendUrl(url));
  view.webContents.on('did-navigate-in-page', (_event, url) => sendUrl(url));
  view.webContents.on('did-start-loading', () => {
    sendUrl(view.webContents.getURL());
    try {
      mainWindow?.webContents.send(`loading-start-${side}`, { tabId });
    } catch (err) {
      console.error('send loading-start failed', err);
    }
  });
  view.webContents.on('did-stop-loading', () => {
    try {
      mainWindow?.webContents.send(`loading-stop-${side}`, { tabId });
    } catch (err) {
      console.error('send loading-stop failed', err);
    }
  });
  view.webContents.on('page-title-updated', (_event, title) => sendTitle(title));

  // Sayfa yüklenme hataları
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // Sadece ana frame hataları için göster
    if (!isMainFrame) return;
    
    // Frame hataları veya iptal edilenler için hata sayfası gösterme
    if (errorCode === -3) return; // ERR_ABORTED (kullanıcı iptal etti)
    if (errorCode === -27) return; // ERR_BLOCKED_BY_CLIENT (extension tarafından engellendi)
    if (errorCode === 0) return; // Başarılı
    if (validatedURL && validatedURL.startsWith('chrome-error://')) return;
    if (validatedURL && validatedURL.startsWith('file://')) return; // Kendi error sayfamız
    
    console.log('Page load failed:', errorCode, errorDescription, validatedURL);
    
    // Başarısız URL'i kaydet (address bar'da göstermeye devam etmek için)
    if (validatedURL) lastValidUrl = validatedURL;
    
    const errorPagePath = path.join(__dirname, 'renderer', 'error.html').replace(/\\/g, '/');
    const errorPageUrl = `file:///${errorPagePath}?code=${encodeURIComponent(getErrorName(errorCode))}&desc=${encodeURIComponent(errorDescription || 'Sayfa yüklenirken hata oluştu')}&url=${encodeURIComponent(validatedURL || lastValidUrl)}&validated=${encodeURIComponent(validatedURL || '')}`;
    
    console.log('Loading error page:', errorPageUrl);
    view.webContents.loadURL(errorPageUrl).catch((err) => {
      console.error('Failed to load error page:', err);
    });
  });

  // Zoom değişimlerini UI'ya bildir
  view.webContents.on('zoom-changed', () => {
    try { sendZoom(view.webContents.getZoomFactor()); } catch (_err) { /* ignore */ }
  });

  // Ctrl + Mouse Teker / Ctrl + +/- / Ctrl+0 zoom
  view.webContents.on('before-input-event', (event, input) => {
    try {
      if (!input) return;
      if (input.type === 'mouseWheel' && input.control) {
        event.preventDefault();
        const deltaY = Number(input.deltaY || 0);
        stepZoom(deltaY < 0 ? 1 : -1);
        return;
      }
      if (input.type === 'keyDown' && input.control) {
        const key = String(input.key || '');
        if (key === '+' || key === '=' ) { event.preventDefault(); stepZoom(1); return; }
        if (key === '-' || key === '_' ) { event.preventDefault(); stepZoom(-1); return; }
        if (key === '0') { event.preventDefault(); try { view.webContents.setZoomFactor(1); sendZoom(1); } catch (_e) {} return; }
      }
    } catch (_err) {
      /* ignore */
    }
  });

  // İlk değer
  try { sendZoom(view.webContents.getZoomFactor()); } catch (_err) { /* ignore */ }

  // Video fullscreen desteği
  let isFullscreen = false;
  const toggleFullscreen = (enabled) => {
    isFullscreen = !!enabled;
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(isFullscreen);
        if (isFullscreen) {
          // Fullscreen'de view'i tüm pencereyi kaplasın
          const bounds = mainWindow.getContentBounds();
          view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
        } else {
          // Normal layout'a geri dön
          if (layout?.updateLayout) layout.updateLayout();
        }
      }
    } catch (_err) { /* ignore */ }
  };

  view.webContents.on('enter-full-screen', () => toggleFullscreen(true));
  view.webContents.on('leave-full-screen', () => toggleFullscreen(false));
  view.webContents.on('enter-html-full-screen', () => toggleFullscreen(true));
  view.webContents.on('leave-html-full-screen', () => toggleFullscreen(false));
}

function attachContextMenu(view, side) {
  view.webContents.on('context-menu', (event, params) => {
    // Native menu kullan - DevTools seçenekleri olmadan
    const menu = Menu.buildFromTemplate([
      {
        label: 'Geri',
        enabled: view.webContents.canGoBack(),
        click: () => view.webContents.goBack()
      },
      {
        label: 'İleri',
        enabled: view.webContents.canGoForward(),
        click: () => view.webContents.goForward()
      },
      { type: 'separator' },
      {
        label: 'Yenile',
        click: () => view.webContents.reload()
      },
      { type: 'separator' },
      {
        label: view.webContents.isAudioMuted() ? 'Sesi Aç' : 'Sessize Al',
        click: () => view.webContents.setAudioMuted(!view.webContents.isAudioMuted())
      },
      { type: 'separator' },
      {
        label: 'Sayfayı Yeni Pencerede Aç',
        click: () => {
          try { openStandaloneWindow(side, view.webContents.getURL()); } catch (err) { console.error('open new window failed', err); }
        }
      },
      {
        label: 'Sayfayı Yeni Sekmede Aç',
        click: () => sendOpenNewTab(side, view.webContents.getURL())
      },
      ...(params.linkURL
        ? [
            {
              label: 'Bağlantıyı Yeni Pencerede Aç',
              click: () => {
                try { openStandaloneWindow(side, params.linkURL); } catch (err) { console.error('open new window failed', err); }
              }
            },
            {
              label: 'Bağlantıyı Yeni Sekmede Aç',
              click: () => sendOpenNewTab(side, params.linkURL)
            }
          ]
        : []),
      { type: 'separator' },
      {
        label: 'Kopyala',
        role: 'copy',
        enabled: params.editFlags?.canCopy || params.selectionText?.length > 0
      },
      {
        label: 'Kes',
        role: 'cut',
        enabled: params.editFlags?.canCut
      },
      {
        label: 'Yapıştır',
        role: 'paste',
        enabled: params.editFlags?.canPaste
      },
      {
        label: 'Tümünü Seç',
        role: 'selectAll'
      },
      ...(params.linkURL
        ? [
            { type: 'separator' },
            {
              label: 'Bağlantıyı Harici Tarayıcıda Aç',
              click: () => {
                try { shell.openExternal(params.linkURL); } catch (err) { console.error('open link failed', err); }
              }
            }
          ]
        : [])
    ]);

    menu.popup({ window: mainWindow });
  });
}

function attachUserKioskContextMenu(view, popupWindow) {
  if (!view?.webContents) return;
  view.webContents.on('context-menu', (_event, params) => {
    const wc = view.webContents;
    const menu = Menu.buildFromTemplate([
      { label: 'Geri', enabled: wc.canGoBack(), click: () => wc.goBack() },
      { label: 'İleri', enabled: wc.canGoForward(), click: () => wc.goForward() },
      { type: 'separator' },
      { label: 'Yenile', click: () => wc.reload() },
      {
        label: (popupWindow || userWindow)?.isFullScreen?.() ? 'Tam Ekrandan Çık' : 'Tam Ekran',
        click: () => {
          try {
            const win = popupWindow || userWindow;
            if (win && !win.isDestroyed()) {
              const next = !win.isFullScreen();
              win.setFullScreen(next);
            }
          } catch (_err) { /* ignore */ }
        }
      },
      { type: 'separator' },
      { label: 'Kopyala', role: 'copy', enabled: params.editFlags?.canCopy || (params.selectionText || '').length > 0 },
      { label: 'Kes', role: 'cut', enabled: params.editFlags?.canCut },
      { label: 'Yapıştır', role: 'paste', enabled: params.editFlags?.canPaste },
      { label: 'Tümünü Seç', role: 'selectAll' }
    ]);

    menu.popup({ window: popupWindow || userWindow || mainWindow });
  });
}

function attachWebviewContextMenu(wc, side) {
  if (!wc) return;
  wc.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Geri', enabled: wc.canGoBack?.(), click: () => wc.goBack?.() },
      { label: 'İleri', enabled: wc.canGoForward?.(), click: () => wc.goForward?.() },
      { type: 'separator' },
      { label: 'Yenile', click: () => wc.reload?.() },
      { type: 'separator' },
      { label: 'Sayfayı Yeni Pencerede Aç', click: () => openStandaloneWindow(side, wc.getURL?.()) },
      { label: 'Sayfayı Yeni Sekmede Aç', click: () => sendOpenNewTab(side, wc.getURL?.()) },
      ...(params.linkURL
        ? [
            { label: 'Bağlantıyı Yeni Pencerede Aç', click: () => openStandaloneWindow(side, params.linkURL) },
            { label: 'Bağlantıyı Yeni Sekmede Aç', click: () => sendOpenNewTab(side, params.linkURL) }
          ]
        : []),
      { type: 'separator' },
      { label: 'Kopyala', role: 'copy', enabled: params.editFlags?.canCopy || params.selectionText?.length > 0 },
      { label: 'Kes', role: 'cut', enabled: params.editFlags?.canCut },
      { label: 'Yapıştır', role: 'paste', enabled: params.editFlags?.canPaste },
      { label: 'Tümünü Seç', role: 'selectAll' }
    ]);
    menu.popup({ window: BrowserWindow.fromWebContents(wc) || mainWindow });
  });

  try {
    wc.setWindowOpenHandler((details) => {
      if (!isPopupsAllowedForWebContents(wc)) {
        return { action: 'deny' };
      }

      const targetUrl = String(details?.url || '').trim();
      const disposition = details?.disposition;
      const frameName = String(details?.frameName || '').toLowerCase();
      const features = String(details?.features || '').toLowerCase();
      
      // Permission store'da açıkça allow edilmiş mi kontrol et
      const host = getHostFromUrl(wc?.getURL?.() || '');
      const popupDecision = getPermissionDecision('popups', host);
      const explicitlyAllowed = popupDecision === 'allow';
      
      // OAuth, ödeme, query parametreli ve açıkça izin verilmiş popup'lar için gerçek görünür pencere aç
      const needsRealPopup = 
        explicitlyAllowed ||
        /oauth|auth|login|signin|authorize|payment|pay|checkout|verify|2fa|mfa|code=|commonCode=/i.test(targetUrl) ||
        /oauth|auth|login|payment/i.test(frameName) ||
        disposition === 'new-popup' ||
        /popup=/.test(features);

      if (needsRealPopup) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 600,
            height: 700,
            center: true,
            modal: false,
            minimizable: true,
            maximizable: true,
            closable: true,
            autoHideMenuBar: true,
            backgroundColor: '#0f1115',
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              webSecurity: true,
              allowRunningInsecureContent: false
            }
          }
        };
      }

      installPopupRedirectBridge(wc, (u) => sendOpenNewTab(side, u));
      const shouldNewTab = disposition === 'foreground-tab' || disposition === 'background-tab' || disposition === 'new-window' || disposition === 'default';

      if (shouldNewTab) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            show: false,
            autoHideMenuBar: true,
            backgroundColor: '#0f1115',
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              webSecurity: true,
              allowRunningInsecureContent: false
            }
          }
        };
      }

      if (targetUrl) {
        try { openStandaloneWindow(side, targetUrl); } catch (err) { console.error('webview window.open failed', err); }
      }
      return { action: 'deny' };
    });
  } catch (_err) {
    /* ignore */
  }
}

function detachView(view) {
  try { mainWindow?.removeBrowserView(view); } catch (err) { console.error('remove view failed', err); }
}

function destroyView(view) {
  try { view.webContents.stop(); } catch (err) { console.error('stop view failed', err); }
  try { view.webContents.destroy(); } catch (err) { console.error('destroy wc failed', err); }
}

function showExitOverlay(stats, sessionInfo = {}) {
  if (exitOverlay && !exitOverlay.isDestroyed()) {
    exitOverlay.show();
    return;
  }

  exitOverlay = new BrowserWindow({
    width: 480,
    height: 520,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    modal: true,
    parent: mainWindow,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  const totalCookies = stats?.entries?.reduce((sum, e) => sum + (e.count || 0), 0) || 0;
  const totalBytes = stats?.totalBytes || 0;
  const fmtSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const leftTabs = Number(sessionInfo.leftTabs || 0);
  const rightTabs = Number(sessionInfo.rightTabs || 0);
  const partitions = sessionInfo.partitions || ['temp:left', 'temp:right'];
  const telegramText = sessionInfo.telegramOpen
    ? `Telegram: ${sessionInfo.telegramVisible ? 'açık' : 'arka planda'} (bölüm: ${sessionInfo.telegramPartition || 'temp:telegram'})`
    : 'Telegram: kapalı';
  
  // Temp dosya bilgisi
  let tempIconCount = 0;
  let tempIconSize = 0;
  try {
    const tempDir = app.getPath('temp');
    const files = fs.readdirSync(tempDir);
    const tgFiles = files.filter(f => f.startsWith('tg-') && f.endsWith('.png'));
    tempIconCount = tgFiles.length;
    for (const file of tgFiles) {
      try {
        const stats = fs.statSync(path.join(tempDir, file));
        tempIconSize += stats.size;
      } catch (_e) {}
    }
  } catch (_e) {}
  const tempIconText = `Geçici Bildirim: ${tempIconCount} adet • Boyut: ${fmtSize(tempIconSize)}`;

  const html = `<!doctype html>
  <html><head><style>
  :root { 
    color-scheme: dark;
    --bg-start: #000408;
    --bg-end: #0a1628;
    --text: #e0f7ff;
    --text-muted: #7dd3fc;
    --accent: #00ffff;
    --neon-cyan: #00ffff;
    --neon-blue: #0ea5e9;
    --border: rgba(0, 255, 255, 0.15);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    margin:0; 
    width:100%; 
    min-height:100vh; 
    overflow:hidden;
    display:flex; 
    align-items:center; 
    justify-content:center;
    padding: 20px;
    font-family: 'Courier New', 'Consolas', monospace; 
    background: transparent;
    position: relative;
    color: var(--text);
  }
  body::before {
    display: none;
  }
  body::after {
    display: none;
  }
  @keyframes gridMove {
    0% { transform: translateY(0); }
    100% { transform: translateY(50px); }
  }
  @keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
    50% { transform: translate(-20px, 20px) scale(1.05); opacity: 0.5; }
  }
  .box { 
    padding: 24px 28px; 
    border-radius: 20px; 
    background: linear-gradient(135deg, rgba(0,255,255,0.05), rgba(14,165,233,0.03));
    border: 2px solid var(--border); 
    box-shadow: 0 0 40px rgba(0,255,255,0.3), inset 0 1px 0 rgba(0,255,255,0.2); 
    backdrop-filter: blur(20px);
    display: flex; 
    flex-direction: column; 
    gap: 14px; 
    align-items: center; 
    width: 100%;
    max-width: 420px;
    position: relative;
    z-index: 1;
  }
  .spin-container {
    position: relative;
    width: 48px;
    height: 48px;
    margin-bottom: 2px;
  }
  .spin { 
    width: 48px; 
    height: 48px; 
    border: 3px solid rgba(0, 255, 255, 0.2); 
    border-top-color: var(--neon-cyan);
    border-right-color: rgba(0, 255, 255, 0.6);
    border-radius: 50%; 
    animation: s 1s linear infinite;
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
  }
  @keyframes s { 
    from { transform: rotate(0deg); } 
    to { transform: rotate(360deg); } 
  }
  .title { 
    font-weight: 700; 
    font-size: 18px; 
    color: var(--text);
    letter-spacing: 1.5px;
    text-shadow: 0 0 12px var(--neon-cyan);
    text-transform: uppercase;
  }
  .desc { 
    font-size: 13px; 
    color: var(--text-muted); 
    text-align: center;
    line-height: 1.5;
    margin-top: -4px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    width: 100%;
    margin-top: 4px;
  }
  .stats { 
    font-size: 11px; 
    color: var(--text-muted); 
    background: rgba(0, 255, 255, 0.05);
    padding: 10px 14px;
    border-radius: 10px;
    border: 2px solid rgba(0, 255, 255, 0.2);
    text-align: center;
    line-height: 1.4;
    transition: all 0.3s ease;
  }
  .stats:hover {
    background: rgba(0, 255, 255, 0.1);
    border-color: var(--neon-cyan);
    transform: translateY(-2px);
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
  }
  .stats strong {
    color: var(--neon-cyan);
    font-weight: 700;
    text-shadow: 0 0 8px var(--neon-cyan);
  }
  </style></head>
  <body>
    <div class="box">
      <div class="spin-container">
        <div class="spin"></div>
      </div>
      <div class="title">Çıkış Yapılıyor</div>
      <div class="desc">Tüm verileriniz güvenli şekilde temizleniyor.<br>Lütfen bekleyin...</div>
      <div class="stats-grid">
        <div class="stats"><strong>Çerez:</strong> ${totalCookies} adet • <strong>Boyut:</strong> ${fmtSize(totalBytes)}</div>
        <div class="stats"><strong>Oturum:</strong> Sol ${leftTabs} sekme, Sağ ${rightTabs} sekme</div>
        <div class="stats"><strong>Bölümler:</strong> ${partitions.join(', ')}</div>
        <div class="stats">${telegramText}</div>
        <div class="stats"><strong>Geçici Bildirim:</strong> ${tempIconCount} adet • ${fmtSize(tempIconSize)}</div>
      </div>
    </div>
  </body>
  </html>`;

  exitOverlay.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  exitOverlay.setIgnoreMouseEvents(false);
}

function closeExitOverlay() {
  if (exitOverlay && !exitOverlay.isDestroyed()) {
    try { exitOverlay.close(); } catch (_err) { /* ignore */ }
  }
  exitOverlay = null;
}

function showTab(side, tabId) {
  if (!mainWindow) return;
  if (viewsHidden) return;
  const target = tabViews[side].get(tabId);
  if (!target) return;

  const currentId = activeTab[side];
  const current = currentId ? tabViews[side].get(currentId) : null;
  if (current && current !== target) {
    detachView(current);
  }

  if (current !== target) {
    mainWindow.addBrowserView(target);
  }

  activeTab[side] = tabId;
  layout?.setActiveViews(getActiveView('left'), getActiveView('right'));

  // URL bar zoom göstergesi aktif sekmeyle senkron kalsın
  try {
    const channel = `zoom-updated-${side}`;
    const z = target?.webContents?.getZoomFactor?.() || 1;
    mainWindow?.webContents.send(channel, { tabId, zoomFactor: z });
  } catch (_err) {
    /* ignore */
  }
}

function hideActiveViews() {
  for (const side of ['left', 'right']) {
    const currentId = activeTab[side];
    const current = currentId ? tabViews[side].get(currentId) : null;
    if (current) detachView(current);
  }
}

function showActiveViews() {
  for (const side of ['left', 'right']) {
    const currentId = activeTab[side];
    const current = currentId ? tabViews[side].get(currentId) : null;
    if (current) mainWindow.addBrowserView(current);
  }
  layout?.setActiveViews(getActiveView('left'), getActiveView('right'));
}

async function startExitCleanup() {
  if (exitingPromise) return exitingPromise;
  exiting = true;
  exitingPromise = (async () => {
    const start = Date.now();
    let stats = null;
    const sessionInfo = {
      leftTabs: tabViews.left.size,
      rightTabs: tabViews.right.size,
      partitions: ['temp:left', 'temp:right', 'temp:telegram'],
      telegramOpen: !!telegramWindow && !telegramWindow.isDestroyed(),
      telegramVisible: !!(telegramWindow && !telegramWindow.isDestroyed() && telegramWindow.isVisible()),
      telegramPartition: 'temp:telegram'
    };
    try {
      stats = await collectCookieStats();
    } catch (_err) {
      /* ignore */
    }

    try {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.setAlwaysOnTop(true, 'modal-panel');
    } catch (_err) {
      /* ignore */
    }
    showExitOverlay(stats, sessionInfo);
    try {
      mainWindow?.webContents?.send('exit-progress', { state: 'show', stats });
    } catch (_err) {
      /* ignore */
    }

    await cleanup();

    const elapsed = Date.now() - start;
    const minDuration = 3200;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    try {
      mainWindow?.webContents?.send('exit-progress', { state: 'done' });
    } catch (_err) {
      /* ignore */
    }
    try {
      mainWindow?.setAlwaysOnTop(false);
    } catch (_err) {
      /* ignore */
    }
    closeExitOverlay();

    try {
      schedulePostExitWipe();
    } catch (_err) {
      /* ignore */
    }
    app.exit(0);
  })();
  return exitingPromise;
}

function createTabView(side, tabId, url) {
  const partition = getPartitionForSide(side);
  const view = createBrowserView(partition);
  setupFindListeners(view);
  tabViews[side].set(tabId, view);
  viewToTab.set(view, { side, tabId }); // Track for error handling
  wireNavigationEvents(view, side, tabId);
  attachContextMenu(view, side);
  // Some sites use window.open for navigation/redirect; load in-place instead of blocking.
  view.webContents.setWindowOpenHandler((details) => {
    if (!isPopupsAllowedForWebContents(view.webContents)) {
      return { action: 'deny' };
    }

    const targetUrl = String(details?.url || '').trim();
    const disposition = details?.disposition;
    const frameName = String(details?.frameName || '').toLowerCase();
    const features = String(details?.features || '').toLowerCase();
    
    // Permission store'da açıkça allow edilmiş mi kontrol et
    const host = getHostFromUrl(view.webContents?.getURL?.() || '');
    const popupDecision = getPermissionDecision('popups', host);
    const explicitlyAllowed = popupDecision === 'allow';
    
    // OAuth, ödeme, query parametreli ve açıkça izin verilmiş popup'lar için gerçek görünür pencere aç
    const needsRealPopup = 
      explicitlyAllowed ||
      /oauth|auth|login|signin|authorize|payment|pay|checkout|verify|2fa|mfa|code=|commonCode=/i.test(targetUrl) ||
      /oauth|auth|login|payment/i.test(frameName) ||
      disposition === 'new-popup' ||
      /popup=/.test(features);

    if (needsRealPopup) {
      // Gerçek popup penceresi - görünür, küçük boyutlu
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 700,
          center: true,
          modal: false,
          minimizable: true,
          maximizable: true,
          closable: true,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    }

    installPopupRedirectBridge(view.webContents, (u) => sendOpenNewTab(side, u));
    const shouldNewTab = disposition === 'foreground-tab' || disposition === 'background-tab' || disposition === 'new-window' || disposition === 'default';

    if (shouldNewTab) {
      // Allow hidden popup (keeps window.open reference), then bridge its final URL into a new tab.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    }

    if (targetUrl) {
      try {
        view.webContents.loadURL(normalizeUrl(targetUrl));
      } catch (err) {
        console.error('window.open redirect failed', err);
      }
    }
    return { action: 'deny' };
  });
  view.webContents.loadURL(normalizeUrl(url));

  // If first tab on this side, show it.
  if (!activeTab[side]) {
    showTab(side, tabId);
  }
}

function closeTabView(side, tabId) {
  const view = tabViews[side].get(tabId);
  if (!view) return;
  const wasActive = activeTab[side] === tabId;
  detachView(view);
  tabViews[side].delete(tabId);
  destroyView(view);

  if (wasActive) {
    const next = tabViews[side].keys().next();
    const nextId = next && !next.done ? next.value : null;
    activeTab[side] = null;
    if (nextId) showTab(side, nextId);
    else layout?.setActiveViews(getActiveView('left'), getActiveView('right'));
  }
}

function registerIpcHandlers() {
  // Genel bildirim gösterme handler'ı
  ipcMain.handle('show-custom-notification', async (_event, options) => {
    try {
      const result = await createCustomNotification({
        title: options.title || 'Bildirim',
        body: options.body || '',
        icon: options.icon || null,
        iconEmoji: options.iconEmoji || '📬',
        count: options.count || null,
        duration: options.duration || 5000
      });
      return result;
    } catch (err) {
      return { action: 'error', error: err.message };
    }
  });

  // Bildirim ayarları handler'ları
  ipcMain.handle('get-notification-settings', () => {
    return notificationSettings;
  });

  ipcMain.handle('set-notification-settings', (_event, settings) => {
    notificationSettings = { ...notificationSettings, ...settings };
    saveNotificationSettings();
    // Mevcut bildirimleri yeni pozisyona taşı
    repositionNotifications();
    return notificationSettings;
  });

  ipcMain.handle('get-displays', () => {
    const displays = screen.getAllDisplays();
    return displays.map((display, index) => ({
      id: display.id,
      index: index,
      label: display.label || `Ekran ${index + 1}`,
      bounds: display.bounds,
      workArea: display.workAreaSize,
      scaleFactor: display.scaleFactor,
      isPrimary: display.bounds.x === 0 && display.bounds.y === 0
    }));
  });

  ipcMain.handle('get-settings', () => ({
    allowChatgptCookies,
    allowTelegramSession,
    blockThirdPartyCookies,
    trackingProtection,
    persistentSession,
    allowAllCookies,
    storageEnabled,
    memoryCookies,
    cacheEnabled,
    permissionStore: serializePermissionStore()
  }));

  ipcMain.on('set-allow-telegram-session', (_event, enabled) => {
    allowTelegramSession = !!enabled;
    if (!allowTelegramSession) {
      hideTelegramWindow();
      clearSessionData(sessions.telegram).catch(() => {});
    }
  });

  ipcMain.on('toggle-telegram-window', () => {
    toggleTelegramWindow();
  });

  ipcMain.on('hide-telegram-window', () => {
    hideTelegramWindow();
  });

  ipcMain.on('set-allow-chatgpt-cookies', (_event, enabled) => {
    allowChatgptCookies = !!enabled;
    refreshCookieAllowList();
  });

  ipcMain.on('set-privacy-options', (_event, options) => {
    blockThirdPartyCookies = !!options?.blockThirdPartyCookies;
    trackingProtection = !!options?.trackingProtection;
  });

  ipcMain.on('set-session-options', (_event, options) => {
    let needsRestart = false;
    
    if (typeof options?.persistentSession === 'boolean') {
      if (persistentSession !== options.persistentSession) {
        persistentSession = options.persistentSession;
        needsRestart = true;
      }
    }
    if (typeof options?.allowAllCookies === 'boolean') {
      if (allowAllCookies !== options.allowAllCookies) {
        allowAllCookies = options.allowAllCookies;
        needsRestart = true;
      }
    }
    if (typeof options?.storageEnabled === 'boolean') {
      if (storageEnabled !== options.storageEnabled) {
        storageEnabled = options.storageEnabled;
        needsRestart = true;
      }
    }
    if (typeof options?.memoryCookies === 'boolean') {
      memoryCookies = options.memoryCookies;
    }
    if (typeof options?.cacheEnabled === 'boolean') {
      if (cacheEnabled !== options.cacheEnabled) {
        cacheEnabled = options.cacheEnabled;
        needsRestart = true;
      }
    }
    
    // Ayarlar değiştiğinde session'ları yeniden yapılandır
    if (needsRestart) {
      // UI session'ını yeniden oluştur
      try {
        sessions.ui = createTempSession('temp:ui', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
      } catch (err) {
        console.error('UI session yeniden yapılandırılamadı:', err);
      }
      
      // Left, Right ve ana session'ları da yeniden yapılandır
      try {
        sessions.left = createTempSession('temp:left', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
        sessions.right = createTempSession('temp:right', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
        sessions.main = createTempSession('persist:main', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
      } catch (err) {
        console.error('Browser session\'ları yeniden yapılandırılamadı:', err);
      }
      
      // Telegram session (her zaman permissive)
      if (allowTelegramSession) {
        try {
          sessions.telegram = createPermissiveSession('temp:telegram', { persistent: persistentSession, cache: cacheEnabled });
        } catch (err) {
          console.error('Telegram session yeniden yapılandırılamadı:', err);
        }
      }
      
      // Tarayıcı pencerelerini bilgilendir (storage engellemesi için)
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.webContents.send('session-options-updated', { persistentSession, allowAllCookies, storageEnabled, cacheEnabled });
        } catch (_err) {}
      }
      
      // BrowserView'leri de bilgilendir
      const leftView = activeTab.left ? tabViews.left.get(activeTab.left) : null;
      const rightView = activeTab.right ? tabViews.right.get(activeTab.right) : null;
      
      if (leftView?.webContents) {
        try {
          leftView.webContents.send('session-options-updated', { persistentSession, allowAllCookies, storageEnabled, cacheEnabled });
        } catch (_err) {}
      }
      if (rightView?.webContents) {
        try {
          rightView.webContents.send('session-options-updated', { persistentSession, allowAllCookies, storageEnabled, cacheEnabled });
        } catch (_err) {}
      }
    }
  });

  ipcMain.handle('get-permissions', () => serializePermissionStore());

  ipcMain.on('update-permission', (_event, payload) => {
    const { kind, host, action } = payload || {};
    if (kind && host && action) {
      const cleanHost = sanitizeHostForAllowList(host);
      if (cleanHost) {
        updatePermissionStore(kind, cleanHost, action);
        const serialized = serializePermissionStore();
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.webContents.send('permissions-updated', serialized);
          } catch (_err) {
            /* ignore */
          }
        }
      }
    }
  });

  ipcMain.handle('get-downloads', () => getMergedDownloads());

  ipcMain.handle('open-download', (_event, savePath) => {
    if (!savePath || !fs.existsSync(savePath)) return false;
    shell.openPath(savePath);
    return true;
  });

  ipcMain.handle('open-download-folder', (_event, savePath) => {
    if (!savePath || !fs.existsSync(savePath)) return false;
    shell.showItemInFolder(savePath);
    return true;
  });

  ipcMain.handle('download-action', async (_event, payload) => {
    const { id, action } = payload || {};
    const item = downloadItems.get(id);
    if (item) {
      if (action === 'pause') {
        try { item.pause(); } catch (_err) { /* ignore */ }
      } else if (action === 'resume') {
        try { item.resume(); } catch (_err) { /* ignore */ }
      } else if (action === 'cancel') {
        try { item.cancel(); } catch (_err) { /* ignore */ }
      }
      return { ok: true };
    }
    if (action === 'remove-file') {
      const entry = recentDownloads.find((d) => d.id === id) || recentDownloads.find((d) => d.savePath === id);
      const targetPath = entry?.savePath || id;
      if (targetPath) {
        try { fs.unlinkSync(targetPath); } catch (_err) { /* ignore */ }
      }
      if (entry) {
        entry.state = 'removed';
        rememberDownload({ ...entry });
      } else {
        const merged = getMergedDownloads();
        try { mainWindow?.webContents.send('downloads-updated', merged); } catch (_err) { /* ignore */ }
        try { settingsWindow?.webContents.send('downloads-updated', merged); } catch (_err) { /* ignore */ }
      }
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.on('open-settings', (_event, section) => {
    if (currentRole !== 'admin') return;
    openSettingsWindow(section);
  });

  // Auth management (admin only)
  ipcMain.handle('auth-get', () => {
    return {
      ok: true,
      admin: { username: authConfig?.admin?.username || 'admin' },
      user: { username: authConfig?.user?.username || 'user' },
      userModeSite: authConfig?.userModeSite || 'https://www.hdfilmizle.life/'
    };
  });

  ipcMain.handle('auth-set', (_event, payload) => {
    if (currentRole !== 'admin') return { ok: false, message: 'Yetkisiz' };
    
    const next = {
      admin: {
        username: String(payload?.admin?.username || '').trim() || authConfig.admin.username,
        password: payload?.admin?.password !== undefined && String(payload?.admin?.password).trim() !== '' 
          ? String(payload?.admin?.password).trim() 
          : authConfig.admin.password
      },
      user: {
        username: String(payload?.user?.username || '').trim() || authConfig.user.username,
        password: payload?.user?.password !== undefined && String(payload?.user?.password).trim() !== '' 
          ? String(payload?.user?.password).trim() 
          : authConfig.user.password
      },
      userModeSite: String(payload?.userModeSite || '').trim() || authConfig.userModeSite
    };
    
    authConfig = saveAuthConfig(next);
    
    return { ok: true };
  });

  ipcMain.handle('get-cookie-stats', async () => {
    return collectCookieStats();
  });

  ipcMain.handle('get-telegram-session-info', async () => {
    const session = sessions.telegram;
    if (!session) return { cookies: 0, size: 0 };
    try {
      const cookies = await session.cookies.get({});
      const size = cookies.reduce((sum, c) => sum + Buffer.byteLength(`${c.name || ''}=${c.value || ''}`, 'utf8'), 0);
      return { cookies: cookies.length, size };
    } catch (_err) {
      return { cookies: 0, size: 0 };
    }
  });

  ipcMain.handle('get-telegram-storage-data', async () => {
    if (!telegramWindow || telegramWindow.isDestroyed()) {
      return { error: 'Telegram penceresi açık değil' };
    }
    try {
      const result = await telegramWindow.webContents.executeJavaScript(`
        (function() {
          try {
            const localStorage = {};
            const sessionStorage = {};
            
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              localStorage[key] = window.localStorage.getItem(key);
            }
            
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const key = window.sessionStorage.key(i);
              sessionStorage[key] = window.sessionStorage.getItem(key);
            }
            
            return {
              localStorage,
              sessionStorage,
              origin: window.location.origin,
              url: window.location.href
            };
          } catch (e) {
            return { error: e.message };
          }
        })()
      `);
      return result;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('clear-telegram-session', async () => {
    try {
      await clearSessionData(sessions.telegram);
      return { ok: true };
    } catch (_err) {
      return { ok: false };
    }
  });

  ipcMain.handle('clear-cookies-for-host', async (_event, host) => {
    return clearCookiesForHost(host);
  });

  ipcMain.handle('get-cookies-for-host', async (_event, host) => {
    return getCookiesForHost(host);
  });

  ipcMain.handle('get-allow-hosts', () => ({
    hosts: getAllowListHosts(),
    userHosts: Array.from(userAllowedHosts),
    allowChatgptCookies
  }));

  ipcMain.handle('add-allow-host', (_event, host) => {
    const clean = sanitizeHostForAllowList(host);
    if (!clean) return { error: 'Geçersiz host', hosts: getAllowListHosts(), userHosts: Array.from(userAllowedHosts) };
    userAllowedHosts.add(clean);
    refreshCookieAllowList();
    return { hosts: getAllowListHosts(), userHosts: Array.from(userAllowedHosts) };
  });

  ipcMain.handle('remove-allow-host', (_event, host) => {
    const clean = sanitizeHostForAllowList(host);
    if (clean) {
      userAllowedHosts.delete(clean);
      refreshCookieAllowList();
    }
    return { hosts: getAllowListHosts(), userHosts: Array.from(userAllowedHosts) };
  });

  ipcMain.handle('get-active-hosts', () => getActiveHosts());

  ipcMain.handle('get-site-info', async (_event, payload) => {
    const side = payload?.side === 'right' ? 'right' : 'left';
    const view = getActiveView(side);
    const url = view?.webContents?.getURL?.() || '';
    let host = '';
    let protocol = '';
    try {
      const u = new URL(url);
      host = u.hostname || '';
      protocol = u.protocol || '';
    } catch (_err) {
      host = '';
      protocol = '';
    }

    const isSecure = typeof url === 'string' && url.startsWith('https://');
    let certSummary = null;
    try {
      const cert = view?.webContents?.getCertificate?.();
      if (cert) {
        certSummary = {
          subjectName: String(cert.subjectName || ''),
          issuerName: String(cert.issuerName || ''),
          validStart: cert.validStart ? String(cert.validStart) : '',
          validExpiry: cert.validExpiry ? String(cert.validExpiry) : '',
          fingerprint: String(cert.fingerprint || ''),
          serialNumber: String(cert.serialNumber || '')
        };
      }
    } catch (_err) {
      certSummary = null;
    }

    const permissions = {};
    const cleanHost = sanitizeHostForAllowList(host);
    for (const kind of Object.keys(permissionStore)) {
      const bucket = permissionStore[kind];
      if (!cleanHost) {
        permissions[kind] = 'ask';
        continue;
      }
      if (bucket?.allow?.has?.(cleanHost)) permissions[kind] = 'allow';
      else if (bucket?.deny?.has?.(cleanHost)) permissions[kind] = 'deny';
      else permissions[kind] = 'ask';
    }

    let cookieCount = 0;
    let cookieBytes = 0;
    if (cleanHost) {
      try {
        const cookies = await getCookiesForHost(cleanHost);
        cookieCount = cookies.length;
        cookieBytes = cookies.reduce((sum, c) => sum + Buffer.byteLength(`${c.name || ''}=${c.value || ''}`, 'utf8'), 0);
      } catch (_err) {
        cookieCount = 0;
        cookieBytes = 0;
      }
    }

    return {
      side,
      url,
      host,
      protocol,
      isSecure,
      certificate: certSummary,
      cookies: { count: cookieCount, bytes: cookieBytes },
      permissions
    };
  });

  ipcMain.on('toggle-site-info', (_event, payload) => {
    if (!mainWindow) return;
    const side = payload?.side === 'right' ? 'right' : 'left';
    const rect = payload?.rect || {};
    const left = Number(rect.left);
    const bottom = Number(rect.bottom);
    const prevSide = siteInfoAnchor?.side || null;
    siteInfoAnchor = {
      side,
      left: Number.isFinite(left) ? left : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0
    };

    const win = ensureSiteInfoWindow();
    const shouldToggleOff = win.isVisible() && prevSide === side;
    if (shouldToggleOff) {
      hideSiteInfoWindow();
      return;
    }

    try {
      // Update query side so the window reads the correct side.
      win.loadFile(getSiteInfoHtmlPath(), { query: { side } });
    } catch (_err) {
      /* ignore */
    }
    positionSiteInfoWindow();
    try { win.showInactive(); } catch (_err) { try { win.show(); } catch (_err2) { /* ignore */ } }
    try { win.webContents.send('site-info-refresh', { side }); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('close-site-info', () => {
    hideSiteInfoWindow();
  });

  ipcMain.on('toggle-zoom-menu', (_event, payload) => {
    if (!mainWindow) return;
    const side = payload?.side === 'right' ? 'right' : 'left';
    const rect = payload?.rect || {};
    const left = Number(rect.left);
    const bottom = Number(rect.bottom);
    const prevSide = zoomMenuAnchor?.side || null;
    zoomMenuAnchor = {
      side,
      left: Number.isFinite(left) ? left : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0
    };

    const win = ensureZoomMenuWindow();
    const shouldToggleOff = win.isVisible() && prevSide === side;
    if (shouldToggleOff) {
      hideZoomMenuWindow();
      return;
    }

    try {
      win.loadFile(getZoomMenuHtmlPath(), { query: { side } });
    } catch (_err) {
      /* ignore */
    }
    positionZoomMenuWindow();
    try { win.showInactive(); } catch (_err) { try { win.show(); } catch (_err2) { /* ignore */ } }
    try { win.webContents.send('zoom-menu-refresh', { side }); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('close-zoom-menu', () => {
    hideZoomMenuWindow();
  });

  ipcMain.on('toggle-tab-overflow', (_event, payload) => {
    if (!mainWindow) return;
    const side = payload?.side === 'right' ? 'right' : 'left';
    const rect = payload?.rect || {};
    const left = Number(rect.left);
    const bottom = Number(rect.bottom);
    const prevSide = tabOverflowAnchor?.side || null;
    tabOverflowAnchor = {
      side,
      left: Number.isFinite(left) ? left : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0
    };

    const win = ensureTabOverflowWindow();
    const shouldToggleOff = win.isVisible() && prevSide === side;
    if (shouldToggleOff) {
      hideTabOverflowWindow();
      return;
    }

    try {
      win.loadFile(getTabOverflowHtmlPath(), { query: { side } });
    } catch (_err) {
      /* ignore */
    }
    positionTabOverflowWindow();
    try { win.showInactive(); } catch (_err) { try { win.show(); } catch (_err2) { /* ignore */ } }
    try { win.webContents.send('tab-overflow-refresh', { side }); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('close-tab-overflow', () => {
    hideTabOverflowWindow();
  });

  ipcMain.on('activate-tab-from-overflow', (_event, payload) => {
    const { side, tabId } = payload || {};
    if (!mainWindow || !side || !tabId) return;
    try {
      mainWindow.webContents.executeJavaScript(`
        if (typeof setActiveTab === 'function') {
          setActiveTab('${side}', '${tabId}');
        }
      `);
    } catch (err) {
      /* ignore */
    }
  });

  ipcMain.on('close-tab-from-overflow', (_event, payload) => {
    const { side, tabId } = payload || {};
    if (!mainWindow || !side || !tabId) return;
    try {
      mainWindow.webContents.executeJavaScript(`
        if (typeof closeTab === 'function') {
          closeTab('${side}', '${tabId}');
        }
      `);
    } catch (err) {
      /* ignore */
    }
  });

  ipcMain.on('reorder-overflow-tab', (_event, payload) => {
    const { side, sourceId, targetId } = payload || {};
    if (!mainWindow || !side || !sourceId || !targetId) return;
    try {
      mainWindow.webContents.executeJavaScript(`
        if (typeof reorderTab === 'function') {
          reorderTab('${side}', '${sourceId}', '${targetId}');
        }
      `);
      // Overflow menüsünü güncelle
      const win = tabOverflowWindow;
      if (win && win.isVisible()) {
        try {
          win.webContents.send('tab-overflow-refresh', { side });
        } catch (err) {
          /* ignore */
        }
      }
    } catch (err) {
      /* ignore */
    }
  });

  ipcMain.handle('get-overflow-tabs', async (_event, side) => {
    const s = side === 'right' ? 'right' : 'left';
    try {
      // Main window'dan tab listesini al
      const result = await mainWindow.webContents.executeJavaScript(`
        (function() {
          if (typeof tabs === 'undefined' || typeof active === 'undefined') {
            return { tabs: [], activeTabId: null };
          }
          const side = '${s}';
          const allTabs = tabs[side] || [];
          const overflowTabs = allTabs.slice(5);
          const activeTabId = active[side];
          return { tabs: overflowTabs, activeTabId };
        })()
      `);
      return { side: s, ...result };
    } catch (err) {
      return { side: s, tabs: [], activeTabId: null };
    }
  });

  ipcMain.handle('ai-reset-sessions', async () => {
    try {
      await resetAiSessions();
      return { ok: true };
    } catch (_err) {
      return { ok: false };
    }
  });

  ipcMain.handle('ai-clear-cookies', async () => {
    try {
      await clearAiCookiesOnly();
      return { ok: true };
    } catch (err) {
      console.error('AI clear cookies failed', err);
      return { ok: false, error: String(err?.message || err || 'Unknown error') };
    }
  });

  ipcMain.handle('get-panel-size', () => panelSize);

  ipcMain.handle('set-panel-size', (_event, size) => {
    const next = {
      width: Number(size?.width) || panelSize.width,
      height: Number(size?.height) || panelSize.height
    };
    panelSize = next;
    positionPanelWindow(true);
    return panelSize;
  });

  ipcMain.on('open-notes-window', () => {
    openNotesWindow();
  });

  ipcMain.on('toggle-notes-window', () => {
    toggleNotesWindow();
  });

  ipcMain.on('close-notes-window', () => {
    hideNotesWindow();
  });

  ipcMain.on('open-panel-window', () => {
    openPanelWindow();
  });

  ipcMain.on('toggle-panel-window', () => {
    togglePanelWindow();
  });

  ipcMain.on('open-telegram-panel', () => {
    toggleTelegramWindow();
  });

  ipcMain.on('hide-telegram-window', () => {
    hideTelegramWindow();
  });

  ipcMain.on('open-ai-panel', () => {
    toggleAiPanelWindow();
  });

  ipcMain.on('hide-ai-panel', () => {
    hideAiPanelWindow();
  });

  ipcMain.on('ai-load-url', (_event, rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    // Aktif provider içinde URL yükle (diğer provider sohbetlerini bozmaz)
    aiLastUrl[aiActiveProvider] = url;
    if (!aiWindow || aiWindow.isDestroyed()) {
      openAiPanelWindow();
    }
    try { setActiveAiProvider(aiActiveProvider, { url }); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('ai-switch-provider', (_event, provider) => {
    const p = normalizeAiProvider(provider);
    if (!aiWindow || aiWindow.isDestroyed()) {
      aiActiveProvider = p;
      openAiPanelWindow();
      return;
    }
    try { setActiveAiProvider(p); } catch (_err) { /* ignore */ }
  });

  // Email Panel IPC handlers
  ipcMain.on('open-email-panel', () => {
    toggleEmailPanelWindow();
  });

  ipcMain.on('hide-email-panel', () => {
    hideEmailPanelWindow();
  });

  ipcMain.on('email-load-url', (_event, rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    emailLastUrl[emailActiveProvider] = url;
    if (!emailWindow || emailWindow.isDestroyed()) {
      openEmailPanelWindow();
    }
    try { setActiveEmailProvider(emailActiveProvider, { url }); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('email-switch-provider', (_event, provider) => {
    const p = normalizeEmailProvider(provider);
    if (!emailWindow || emailWindow.isDestroyed()) {
      emailActiveProvider = p;
      openEmailPanelWindow();
      return;
    }
    try { setActiveEmailProvider(p); } catch (_err) { /* ignore */ }
  });

  // Clipboard Panel IPC handlers
  ipcMain.on('open-clipboard-panel', () => {
    toggleClipboardPanelWindow();
  });

  ipcMain.on('hide-clipboard-panel', () => {
    hideClipboardPanelWindow();
  });

  ipcMain.handle('clipboard-load', () => {
    return clipboardHistory || [];
  });

  ipcMain.on('clipboard-save', (_event, items) => {
    clipboardHistory = items || [];
  });

  ipcMain.on('clipboard-copy', (_event, text) => {
    try {
      const { clipboard } = require('electron');
      clipboard.writeText(text);
      clipboardLastText = text; // Tekrar algılanmasını önle
    } catch (_err) {
      /* ignore */
    }
  });

  ipcMain.on('clipboard-clear-all', () => {
    try {
      const { clipboard } = require('electron');
      // Clipboard'ı temizle
      clipboard.clear();
      clipboardLastText = '';
      clipboardHistory = [];
      
      // Clipboard penceresini güncelle
      if (clipboardWindow && !clipboardWindow.isDestroyed()) {
        try {
          clipboardWindow.webContents.send('clipboard-update', []);
        } catch (_err) {
          /* ignore */
        }
      }
    } catch (_err) {
      /* ignore */
    }
  });

  // Error Page IPC handlers
  ipcMain.on('error-retry-load', (_event, url) => {
    const view = BrowserView.fromWebContents(_event.sender);
    if (!view) return;
    const tabInfo = viewToTab.get(view);
    if (!tabInfo) return;
    
    try {
      view.webContents.loadURL(url);
    } catch (err) {
      console.error('Error retry load failed:', err);
    }
  });

  ipcMain.on('error-go-back', (_event) => {
    const view = BrowserView.fromWebContents(_event.sender);
    if (!view) return;
    
    try {
      if (view.webContents.canGoBack()) {
        view.webContents.goBack();
      }
    } catch (err) {
      console.error('Error go back failed:', err);
    }
  });

  // Translator Panel IPC handlers
  ipcMain.on('open-translator-panel', () => {
    toggleTranslatorPanelWindow();
  });

  ipcMain.on('hide-translator-panel', () => {
    hideTranslatorPanelWindow();
  });

  ipcMain.on('translator-load-url', (_event, rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    translatorLastUrl[translatorActiveProvider] = url;
    if (!translatorWindow || translatorWindow.isDestroyed()) {
      openTranslatorPanelWindow();
    }
    try { setActiveTranslatorProvider(translatorActiveProvider, { url }); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('translator-switch-provider', (_event, provider) => {
    const p = normalizeTranslatorProvider(provider);
    if (!translatorWindow || translatorWindow.isDestroyed()) {
      translatorActiveProvider = p;
      openTranslatorPanelWindow();
      return;
    }
    try { setActiveTranslatorProvider(p); } catch (_err) { /* ignore */ }
  });

  // Calendar Panel IPC handlers
  ipcMain.on('open-calendar-panel', () => {
    toggleCalendarPanelWindow();
  });

  ipcMain.on('hide-calendar-panel', () => {
    hideCalendarPanelWindow();
  });

  ipcMain.handle('calendar-load-alarms', () => {
    return calendarAlarms || [];
  });

  ipcMain.on('calendar-save-alarms', (_event, alarms) => {
    calendarAlarms = alarms || [];
  });

  ipcMain.on('calendar-alarm-notify', (_event, alarm) => {
    // 2 dakika kala bildirim
    showAlarmNotification(alarm);
  });

  ipcMain.on('calendar-alarm-trigger', (_event, alarm) => {
    // Alarm tam zamanında trigger oldu
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('calendar-alarm-active', true);
      } catch (_err) {
        /* ignore */
      }
    }
  });

  // Status Panel IPC handlers
  ipcMain.on('open-status-panel', () => {
    toggleStatusPanelWindow();
  });

  ipcMain.on('hide-status-panel', () => {
    hideStatusPanelWindow();
  });

  ipcMain.handle('status-get-session-info', async () => {
    try {
      const sessionDetails = [];
      let totalCacheSize = 0;

      // Ana session'ı kontrol et
      const mainSes = session.fromPartition('persist:main');
      if (mainSes) {
        try {
          const cacheSize = await mainSes.getCacheSize();
          sessionDetails.push({
            partition: 'persist:main',
            isPersistent: true,
            cacheSize: cacheSize
          });
          totalCacheSize += cacheSize;
        } catch (_err) { /* ignore */ }
      }

      // Temp session'ları kontrol et
      const tempPartitions = ['temp:left', 'temp:right', 'temp:telegram', 'temp:ui'];
      for (const part of tempPartitions) {
        try {
          const ses = session.fromPartition(part);
          if (ses) {
            const cacheSize = await ses.getCacheSize();
            sessionDetails.push({
              partition: part,
              isPersistent: false,
              cacheSize: cacheSize
            });
            totalCacheSize += cacheSize;
          }
        } catch (_err) { /* ignore */ }
      }

      return {
        activeSessions: sessionDetails.length,
        sessions: sessionDetails,
        cacheSize: totalCacheSize
      };
    } catch (err) {
      return { activeSessions: 0, sessions: [], cacheSize: 0 };
    }
  });

  ipcMain.handle('status-get-cookies', async () => {
    try {
      const allCookies = [];
      const partitions = ['persist:main', 'temp:left', 'temp:right', 'temp:telegram'];
      
      for (const part of partitions) {
        try {
          const ses = session.fromPartition(part);
          if (ses) {
            const cookies = await ses.cookies.get({});
            allCookies.push(...cookies);
          }
        } catch (_err) { /* ignore */ }
      }

      return allCookies;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('clear-all-cookies', async () => {
    try {
      let totalCleared = 0;
      
      // Mevcut session objeleri üzerinden temizle (collectCookieStats ile aynı kaynak)
      const targets = getAllTempSessions();
      
      for (const ses of targets) {
        if (!ses) continue;
        try {
          const cookiesBefore = await ses.cookies.get({});
          console.log(`Session has ${cookiesBefore.length} cookies before clear`);
          
          // Flush store first
          await ses.cookies.flushStore();
          
          // Clear all storage data
          await ses.clearStorageData({ 
            storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
          });
          
          // Verify cookies are cleared
          const cookiesAfter = await ses.cookies.get({});
          const actualCleared = cookiesBefore.length - cookiesAfter.length;
          totalCleared += actualCleared;
          console.log(`Cleared ${actualCleared} cookies from session (${cookiesAfter.length} remaining)`);
        } catch (err) {
          console.error('Session clear error:', err);
        }
      }

      console.log(`Total cleared: ${totalCleared} cookies`);
      return { success: true, cleared: totalCleared };
    } catch (err) {
      console.error('Clear all cookies error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('status-get-localstorage', async () => {
    try {
      // Bu bilgi renderer'dan toplanmalı
      // Main process'te localStorage'a doğrudan erişim yok
      const storage = [];
      
      // Left view
      const leftView = activeTab.left ? tabViews.left.get(activeTab.left) : null;
      if (leftView && leftView.webContents) {
        try {
          const result = await leftView.webContents.executeJavaScript(`
            (() => {
              const items = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                items.push({ key, value: localStorage.getItem(key), origin: location.origin });
              }
              return items;
            })();
          `);
          storage.push(...result);
        } catch (_err) { /* ignore */ }
      }

      // Right view
      const rightView = activeTab.right ? tabViews.right.get(activeTab.right) : null;
      if (rightView && rightView.webContents) {
        try {
          const result = await rightView.webContents.executeJavaScript(`
            (() => {
              const items = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                items.push({ key, value: localStorage.getItem(key), origin: location.origin });
              }
              return items;
            })();
          `);
          storage.push(...result);
        } catch (_err) { /* ignore */ }
      }

      return storage;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('status-get-indexeddb', async () => {
    try {
      const databases = [];
      
      // Left view
      const leftView = activeTab.left ? tabViews.left.get(activeTab.left) : null;
      if (leftView && leftView.webContents) {
        try {
          const result = await leftView.webContents.executeJavaScript(`
            (async () => {
              const dbs = await indexedDB.databases();
              return dbs.map(db => ({ name: db.name, version: db.version, origin: location.origin }));
            })();
          `);
          databases.push(...result);
        } catch (_err) { /* ignore */ }
      }

      // Right view
      const rightView = activeTab.right ? tabViews.right.get(activeTab.right) : null;
      if (rightView && rightView.webContents) {
        try {
          const result = await rightView.webContents.executeJavaScript(`
            (async () => {
              const dbs = await indexedDB.databases();
              return dbs.map(db => ({ name: db.name, version: db.version, origin: location.origin }));
            })();
          `);
          databases.push(...result);
        } catch (_err) { /* ignore */ }
      }

      return databases;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('status-get-cache-info', async () => {
    try {
      let totalSize = 0;
      const partitions = ['persist:main', 'temp:left', 'temp:right'];
      
      for (const part of partitions) {
        try {
          const ses = session.fromPartition(part);
          if (ses) {
            const size = await ses.getCacheSize();
            totalSize += size;
          }
        } catch (_err) { /* ignore */ }
      }

      return { size: totalSize };
    } catch (err) {
      return { size: 0 };
    }
  });

  ipcMain.handle('status-get-security-info', async () => {
    try {
      let isSecure = false;
      let hasMixedContent = false;
      let securityState = 'unknown';

      // Aktif view'in güvenlik durumunu kontrol et
      const leftView = activeTab.left ? tabViews.left.get(activeTab.left) : null;
      if (leftView && leftView.webContents) {
        const url = leftView.webContents.getURL();
        isSecure = url.startsWith('https://');
        
        try {
          // Certificate bilgisini al
          const cert = await leftView.webContents.executeJavaScript(`
            (() => {
              return {
                protocol: location.protocol,
                isSecure: location.protocol === 'https:'
              };
            })();
          `);
          
          if (cert.isSecure) {
            securityState = 'secure';
          } else {
            securityState = 'insecure';
          }
        } catch (_err) {
          securityState = 'unknown';
        }
      }

      return {
        isSecure,
        hasMixedContent,
        securityState
      };
    } catch (err) {
      return {
        isSecure: false,
        hasMixedContent: false,
        securityState: 'unknown'
      };
    }
  });

  // Telegram bildirimlerini yakala
  ipcMain.on('telegram-notification', (event, data) => {
    showTelegramNotification(data);
  });

  ipcMain.handle('tab-context-menu', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return;
    const { side, tabId, muted, pinned, x, y } = payload || {};
    const sendCmd = (command) => {
      try { win.webContents.send('tab-menu-command', { side, tabId, command }); } catch (_err) { /* ignore */ }
    };
    const menu = Menu.buildFromTemplate([
      {
        label: muted ? 'Sesi Aç' : 'Sessize Al',
        click: () => sendCmd('mute')
      },
      {
        label: pinned ? 'Sabitlemeyi Kaldır' : 'Sekmeyi Sabitle',
        click: () => sendCmd('pin')
      },
      {
        label: 'Sekmeyi Kapat',
        click: () => sendCmd('close')
      }
    ]);
    menu.popup({ window: win, x: Math.round(x || 0), y: Math.round(y || 0) });
  });

  ipcMain.on('set-ui-zoom', (_event, factor) => {
    const f = clampZoom(factor);
    try { mainWindow?.webContents.setZoomFactor(f); } catch (_err) { /* ignore */ }
  });

  ipcMain.on('close-panel-window', () => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.close();
    }
  });

  ipcMain.on('set-views-visible', (_event, visible) => {
    const next = !!visible;
    if (next === !viewsHidden) return;
    viewsHidden = !next;
    if (viewsHidden) hideActiveViews();
    else showActiveViews();
  });

  ipcMain.on('create-tab', (_event, side, tabId, url) => {
    createTabView(side, tabId, url || (side === 'left' ? LEFT_HOME : RIGHT_HOME));
  });

  ipcMain.on('activate-tab', (_event, side, tabId) => {
    if (!tabViews[side].has(tabId)) return;
    showTab(side, tabId);
  });

  ipcMain.on('close-tab', (_event, side, tabId) => {
    closeTabView(side, tabId);
  });

  ipcMain.on('mute-tab', (_event, side, tabId, mute) => {
    const view = tabViews[side].get(tabId);
    if (view?.webContents) {
      try { view.webContents.setAudioMuted(!!mute); } catch (err) { console.error('mute failed', err); }
    }
  });

  ipcMain.on('load-left', (_event, url) => {
    const view = getActiveView('left');
    if (view?.webContents) view.webContents.loadURL(normalizeUrl(url));
  });
  ipcMain.on('load-right', (_event, url) => {
    const view = getActiveView('right');
    if (view?.webContents) view.webContents.loadURL(normalizeUrl(url));
  });

  ipcMain.on('back-left', () => {
    const view = getActiveView('left');
    if (view?.webContents?.canGoBack()) view.webContents.goBack();
  });
  ipcMain.on('back-right', () => {
    const view = getActiveView('right');
    if (view?.webContents?.canGoBack()) view.webContents.goBack();
  });

  ipcMain.on('forward-left', () => {
    const view = getActiveView('left');
    if (view?.webContents?.canGoForward()) view.webContents.goForward();
  });
  ipcMain.on('forward-right', () => {
    const view = getActiveView('right');
    if (view?.webContents?.canGoForward()) view.webContents.goForward();
  });

  ipcMain.on('reload-left', () => {
    const view = getActiveView('left');
    if (view?.webContents) {
      try {
        view.webContents.reload();
      } catch (err) {
        console.error('❌ Sol taraf yenileme hatası:', err);
      }
    } else {
    }
  });
  ipcMain.on('reload-right', () => {
    const view = getActiveView('right');
    if (view?.webContents) {
      try {
        view.webContents.reload();
      } catch (err) {
        console.error('❌ Sağ taraf yenileme hatası:', err);
      }
    } else {
    }
  });

  const clampViewZoom = (f) => {
    const n = Number(f);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(0.25, n));
  };

  const sendActiveZoom = (side) => {
    try {
      const tabId = activeTab[side];
      const view = getActiveView(side);
      if (!tabId || !view?.webContents) return;
      const z = view.webContents.getZoomFactor?.() || 1;
      mainWindow?.webContents.send(`zoom-updated-${side}`, { tabId, zoomFactor: z });
    } catch (_err) {
      /* ignore */
    }
  };

  const stepActiveZoom = (side, dir) => {
    const view = getActiveView(side);
    if (!view?.webContents) return;
    try {
      const current = view.webContents.getZoomFactor?.() || 1;
      const next = clampViewZoom(Number((current + (dir * 0.1)).toFixed(2)));
      view.webContents.setZoomFactor(next);
      sendActiveZoom(side);
    } catch (_err) {
      /* ignore */
    }
  };

  ipcMain.on('zoom-in', (_event, side) => {
    const s = String(side || '').toLowerCase();
    if (s !== 'left' && s !== 'right') return;
    stepActiveZoom(s, 1);
  });
  ipcMain.on('zoom-out', (_event, side) => {
    const s = String(side || '').toLowerCase();
    if (s !== 'left' && s !== 'right') return;
    stepActiveZoom(s, -1);
  });

  // ==================== Find In Page ====================
  ipcMain.on('find-in-page', (_event, side, query, options) => {
    const view = getActiveView(side);
    if (!view?.webContents || !query) return;
    
    try {
      view.webContents.findInPage(query, {
        forward: options?.forward !== false,
        findNext: options?.findNext === true,
        matchCase: options?.matchCase === true
      });
    } catch (err) {
      console.error('Find in page error:', err);
    }
  });

  ipcMain.on('stop-find-in-page', (_event, side) => {
    const view = getActiveView(side);
    if (!view?.webContents) return;

    try {
      view.webContents.stopFindInPage('clearSelection');
    } catch (err) {
      console.error('Stop find in page error:', err);
    }
  });
  ipcMain.on('zoom-reset', (_event, side) => {
    const s = String(side || '').toLowerCase();
    if (s !== 'left' && s !== 'right') return;
    const view = getActiveView(s);
    if (!view?.webContents) return;
    try { view.webContents.setZoomFactor(1); } catch (_err) { /* ignore */ }
    sendActiveZoom(s);
  });
  ipcMain.handle('zoom-get', (_event, side) => {
    const s = String(side || '').toLowerCase();
    if (s !== 'left' && s !== 'right') return 1;
    const view = getActiveView(s);
    try { return view?.webContents?.getZoomFactor?.() || 1; } catch (_err) { return 1; }
  });

  ipcMain.on('set-split', (_event, ratio) => {
    currentSplit = Number.isFinite(ratio) ? ratio : currentSplit;
    layout?.setRatio(currentSplit);
    // Broadcast split changes to all renderers (main UI + panel window)
    try { mainWindow?.webContents.send('split-updated', currentSplit); } catch (_err) { /* ignore */ }
    try { panelWindow?.webContents.send('split-updated', currentSplit); } catch (_err) { /* ignore */ }
  });

  ipcMain.handle('get-split', () => currentSplit);

  ipcMain.on('set-sidebar-width', (_event, width) => {
    layout?.setSidebarWidth?.(Number(width));
  });
}

let authHandlersRegistered = false;

function registerAuthOnlyHandlers() {
  // Zaten kayıtlıysa tekrar kaydetme
  if (authHandlersRegistered) return;
  authHandlersRegistered = true;
  
  ipcMain.handle('auth-login', async (_event, payload) => {
    // Refresh auth config from disk on each login attempt (only persisted data)
    authConfig = loadAuthConfig();
    
    const role = verifyLogin(payload?.username, payload?.password);
    
    if (!role) return { ok: false, message: 'Kullanıcı adı veya şifre hatalı.' };

    // Sadece admin girişi kabul et (user mode zaten açık)
    if (role !== 'admin') {
      return { ok: false, message: 'Sadece yönetici girişi yapabilirsiniz.' };
    }

    try {
      const blocked = await isGeoBlockedForAdminLogin();
      if (blocked) {
        return {
          ok: false,
          code: 'GEO_BLOCK_TR',
          message: GEO_BLOCK.message,
          downloadUrl: GEO_BLOCK.downloadUrl
        };
      }
    } catch (_err) {
      // Geo kontrol hatasında login'i bozmayalım.
    }

    currentRole = role;

    // Admin mode açılacak, user mode'u kapat
    try {
      if (userWindow && !userWindow.isDestroyed()) {
        userWindow.close();
      }
    } catch (_err) { /* ignore */ }
    userWindow = null;

    try {
      await createWindow();
    } catch (err) {
      console.error('admin createWindow failed', err);
      return { ok: false, message: 'Başlatma hatası.' };
    }

    try {
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    } catch (_err) { /* ignore */ }
    loginWindow = null;
    return { ok: true, role };
  });
}

// User mode'dan admin login penceresini aç
async function openAdminLoginWindow() {
  // Zaten login penceresi açıksa öne getir
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  
  await createLoginWindow();
}

async function createLoginWindow() {
  registerAuthOnlyHandlers();

  markPartition('temp:login');

  loginWindow = new BrowserWindow({
    width: 520,
    height: 560,
    resizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, 'resources', 'icons', 'ogame.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'temp:login',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true,
      devTools: false
    }
  });

  loginWindow.webContents.on('devtools-opened', () => {
    loginWindow.webContents.closeDevTools();
  });

  loginWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      event.preventDefault();
    }
  });

  // Login window controls
  ipcMain.removeHandler('login-window-minimize');
  ipcMain.removeHandler('login-window-close');
  
  ipcMain.handle('login-window-minimize', () => {
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.minimize();
  });
  
  ipcMain.handle('login-window-close', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
    }
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
    // User mode açıksa veya admin mode açıksa uygulamayı kapatma
    // Sadece hiçbir pencere yoksa kapat
    if (!currentRole && (!userWindow || userWindow.isDestroyed()) && (!mainWindow || mainWindow.isDestroyed())) {
      app.quit();
    }
  });

  const loginHtmlPath = path.join(__dirname, 'renderer', 'login.html');
  try {
    await loginWindow.loadFile(loginHtmlPath);
  } catch (err) {
    // Eğer pencere yükleme sırasında kapandıysa sessizce geç.
    try { if (!loginWindow || loginWindow.isDestroyed()) return; } catch (_e) { /* ignore */ }
    console.error('loginWindow loadFile failed', err);
    // Fallback: file URL ile dene (Windows path format sorunlarına karşı)
    try {
      const { pathToFileURL } = require('url');
      await loginWindow.loadURL(pathToFileURL(loginHtmlPath).toString());
    } catch (err2) {
      console.error('loginWindow loadURL fallback failed', err2);
    }
  }
}

async function createUserKioskWindow() {
  const TARGET = authConfig?.userModeSite || 'https://lobby.ogame.gameforge.com/tr_TR/';

  // Player bazı filmlerde 3. parti iframe (örn. rapidvid.net) üzerinden çalışıyor.
  // Fullscreen akışı bozulmasın diye sadece bilinen embed domain'lerine izin veriyoruz.
  const USER_ALLOWED_HOST_SUFFIXES = [
    'ogame.gameforge.com',
    'gameforge.com',
    'ogame.org'
  ];

  // Force ephemeral session regardless of any settings.
  markPartition('temp:user');
  markPartition('temp:user-ui');
  const userSession = createTempSession('temp:user', { persistent: false, cache: false, allowAllCookies: true });
  sessions.user = userSession;
  try {
    attachPrivacyHandlers(userSession);
    attachPermissionHandlers(userSession);
    attachDownloadHandlers(userSession);
  } catch (_err) { /* ignore */ }

  // Custom title bar HTML
  const titleBarHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          margin: 0; 
          padding: 0; 
          background: linear-gradient(135deg, #1a1d24 0%, #0f1115 100%); 
          overflow: hidden;
          font-family: 'Segoe UI', sans-serif;
          -webkit-app-region: drag;
          user-select: none;
        }
        .titlebar {
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px 0 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(135deg, rgba(26, 29, 36, 0.98) 0%, rgba(15, 17, 21, 0.98) 100%);
        }
        .title {
          font-size: 13px;
          color: #e7eaf0;
          font-weight: 500;
          letter-spacing: 0.3px;
          flex: 1;
        }
        .window-controls {
          display: flex;
          gap: 1px;
          -webkit-app-region: no-drag;
        }
        .control-btn {
          width: 46px;
          height: 32px;
          border: none;
          background: transparent;
          color: #e7eaf0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          transition: background 120ms ease;
          position: relative;
        }
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .control-btn.close:hover {
          background: #e81123;
          color: #fff;
        }
        .control-btn svg {
          width: 10px;
          height: 10px;
          fill: currentColor;
        }
      </style>
    </head>
    <body>
      <div class="titlebar">
        <div class="title" id="title">OGame</div>
        <div class="window-controls">
          <button class="control-btn minimize" id="btn-minimize" title="Küçült">
            <svg viewBox="0 0 10 1"><path d="M 0,0.5 L 10,0.5" stroke="currentColor" stroke-width="1"/></svg>
          </button>
          <button class="control-btn maximize" id="btn-maximize" title="Büyüt">
            <svg viewBox="0 0 10 10"><path d="M 0,0 L 0,10 L 10,10 L 10,0 Z M 1,1 L 9,1 L 9,9 L 1,9 Z" /></svg>
          </button>
          <button class="control-btn close" id="btn-close" title="Kapat">
            <svg viewBox="0 0 10 10"><path d="M 0,0 L 10,10 M 10,0 L 0,10" stroke="currentColor" stroke-width="1.2"/></svg>
          </button>
        </div>
      </div>
      <script>
        document.getElementById('btn-minimize').onclick = () => window.userWindowAPI.minimize();
        document.getElementById('btn-maximize').onclick = () => window.userWindowAPI.maximize();
        document.getElementById('btn-close').onclick = () => window.userWindowAPI.close();
        window.userWindowAPI.onTitleUpdate((title) => {
          document.getElementById('title').textContent = title || 'OGame';
        });
      </script>
    </body>
    </html>
  `;

  userWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, 'resources', 'icons', 'ogame.ico'),
    autoHideMenuBar: true,
    fullscreenable: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'temp:user-ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true,
      devTools: false
    }
  });

  userWindow.webContents.on('devtools-opened', () => {
    userWindow.webContents.closeDevTools();
  });

  userWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))) {
      event.preventDefault();
    }
  });

  userWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(titleBarHTML)}`);

  const TITLEBAR_HEIGHT = 32;
  let titlebarHeight = TITLEBAR_HEIGHT;
  // Embedded player'lar (farklı domain/CDN) sıkça CORS/mixed-content/sandbox kısıtlarına takılabiliyor.
  // User modunda sadece bu view için daha permissive ayar kullanıyoruz.
  const view = createBrowserView('temp:user', {
    webSecurity: false,
    sandbox: false,
    allowRunningInsecureContent: true
  });
  setupFindListeners(view);
  userWindow.setBrowserView(view);

  // User modunda sağ tık menüsü + DevTools
  attachUserKioskContextMenu(view, userWindow);

  const updateBounds = () => {
    // Minimize edilmiş veya gizli pencerede bounds güncellemesi yapma
    if (userWindow.isMinimized() || !userWindow.isVisible()) return;
    try {
      const bounds = userWindow.getContentBounds();
      view.setBounds({ x: 0, y: titlebarHeight, width: bounds.width, height: bounds.height - titlebarHeight });
    } catch (_err) {
      // Pencere geçersiz durumda olabilir, hata yutuyoruz
    }
  };
  updateBounds();
  userWindow.on('resize', updateBounds);
  userWindow.on('move', updateBounds);
  // Window restore edildiğinde bounds'ı güncelle
  userWindow.on('restore', () => {
    setTimeout(updateBounds, 50);
  });
  // Window gösterildiğinde bounds'ı güncelle
  userWindow.on('show', updateBounds);

  // Title bar window controls
  ipcMain.removeHandler('user-window-minimize');
  ipcMain.removeHandler('user-window-maximize');
  ipcMain.removeHandler('user-window-close');
  
  ipcMain.handle('user-window-minimize', () => {
    if (userWindow && !userWindow.isDestroyed()) userWindow.minimize();
  });
  
  ipcMain.handle('user-window-maximize', () => {
    if (userWindow && !userWindow.isDestroyed()) {
      setKioskFullscreen(!userWindow.isFullScreen());
    }
  });
  
  ipcMain.handle('user-window-close', () => {
    if (userWindow && !userWindow.isDestroyed()) {
      userWindow.close();
    }
  });

  // Sitenin başlığını title bar'da göster
  view.webContents.on('page-title-updated', (_event, title) => {
    if (title && userWindow && !userWindow.isDestroyed()) {
      userWindow.webContents.send('user-title-update', title);
    }
  });

  // Bazı siteler videoyu iframe içinde açıp fullscreen'i allow/allowfullscreen ile kısıtlıyor.
  // User modunda fullscreen çalışsın diye iframe izinlerini sayfa yüklenince güçlendir.
  view.webContents.on('did-finish-load', () => {
    view.webContents.executeJavaScript(`
      (() => {
        const patchIframes = () => {
          const frames = Array.from(document.querySelectorAll('iframe'));
          for (const f of frames) {
            try {
              f.setAttribute('allowfullscreen', 'true');
              const allow = (f.getAttribute('allow') || '').trim();
              if (!/\bfullscreen\b/i.test(allow)) {
                f.setAttribute('allow', (allow ? (allow + '; ') : '') + 'fullscreen *');
              }

              // Bazı embed player'lar sandbox ile fullscreen'i tamamen kısıtlıyor.
              // DOM'dan kaldırıp tarayıcı davranışına yaklaştırıyoruz.
              if (f.hasAttribute('sandbox')) f.removeAttribute('sandbox');
            } catch (_e) { /* ignore */ }
          }
        };

        patchIframes();
        try {
          const obs = new MutationObserver(() => patchIframes());
          obs.observe(document.documentElement, { childList: true, subtree: true });
        } catch (_e) { /* ignore */ }

        // FAKE FULLSCREEN için ESC desteği (ultra-agresif yakalama)
        let fakeFullscreenActive = false;
        
        // ESC tuşunu yakalamak için multiple dinleyici
        const escapeHandlers = [];
        const registerEscapeHandler = () => {
          const handler = (e) => {
            if ((e.key === 'Escape' || e.keyCode === 27) && fakeFullscreenActive) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              
              // Electron'a fullscreen'den çık diyoruz
              if (document.fullscreenElement) {
                try { document.exitFullscreen(); } catch (_err) {}
              }
              
              // Fake fullscreen iframe'i temizle
              const fakeFs = document.querySelector('[data-fake-fullscreen="true"]');
              if (fakeFs) {
                fakeFs.removeAttribute('data-fake-fullscreen');
                fakeFs.style.cssText = '';
              }
              
              document.body.style.overflow = '';
              fakeFullscreenActive = false;
              
              return false;
            }
          };
          return handler;
        };
        
        // ESC handler'ları kaydet ve dinle
        for (let i = 0; i < 3; i++) {
          const h1 = registerEscapeHandler();
          const h2 = registerEscapeHandler();
          document.addEventListener('keydown', h1, true);
          document.addEventListener('keyup', h2, true);
          window.addEventListener('keydown', h1, true);
          window.addEventListener('keyup', h2, true);
          escapeHandlers.push(h1, h2);
        }
        
        // Fake fullscreen durumunu izle
        const observer = new MutationObserver(() => {
          const fakeFs = document.querySelector('[data-fake-fullscreen="true"]');
          fakeFullscreenActive = !!fakeFs;
        });
        observer.observe(document.documentElement, { 
          attributes: true, 
          subtree: true, 
          attributeFilter: ['data-fake-fullscreen', 'style'] 
        });
        
      })();
    `).catch(() => {});
  });

  // Video tam ekran desteği
  const setKioskFullscreen = (enabled) => {
    try {
      titlebarHeight = enabled ? 0 : TITLEBAR_HEIGHT;
      userWindow.setFullScreen(!!enabled);
    } catch (_err) { /* ignore */ }
    updateBounds();
  };

  // Bazı siteler 'enter-html-full-screen' kullanır (video player requestFullscreen)
  view.webContents.on('enter-full-screen', () => setKioskFullscreen(true));
  view.webContents.on('leave-full-screen', () => setKioskFullscreen(false));
  view.webContents.on('enter-html-full-screen', () => setKioskFullscreen(true));
  view.webContents.on('leave-html-full-screen', () => setKioskFullscreen(false));

  // Fallback: Bazı player'lar gerçek fullscreen API'sini tetikleyemez.
  // Bu durumda kullanıcı F11 ile pencereyi tam ekrana alabilir.
  view.webContents.on('before-input-event', (event, input) => {
    if (!input) return;
    const key = String(input.key || '').toLowerCase();
    
    // CTRL+SHIFT+A ile yönetici girişi
    if (input.control && input.shift && key === 'a') {
      event.preventDefault();
      openAdminLoginWindow();
      return;
    }
    
    if (key === 'f11') {
      event.preventDefault();
      setKioskFullscreen(!userWindow.isFullScreen());
      return;
    }
    // ESC tuşu ile fake fullscreen ve window fullscreen'den çık
    if (key === 'escape' || input.keyCode === 27) {
      event.preventDefault();
      
      // ÖNCE window fullscreen'i kapat
      if (userWindow && userWindow.isFullScreen()) {
        setKioskFullscreen(false);
      }
      
      // Fake fullscreen iframe'leri ZORLA temizle (tüm iframe'leri tara)
      view.webContents.executeJavaScript(`
        (() => {
          
          // 1) data-fake-fullscreen attribute'u olanları temizle
          const markedIframes = document.querySelectorAll('[data-fake-fullscreen="true"]');
          markedIframes.forEach((iframe, i) => {
            iframe.removeAttribute('data-fake-fullscreen');
            iframe.style.cssText = '';
          });
          
          // 2) Şüpheli stillere sahip tüm iframe'leri temizle
          const allIframes = document.querySelectorAll('iframe');
          allIframes.forEach((iframe, i) => {
            const computed = window.getComputedStyle(iframe);
            if (computed.position === 'fixed' && 
                parseInt(computed.zIndex) > 99999 &&
                computed.width.includes('100') && 
                computed.height.includes('100')) {
              iframe.removeAttribute('data-fake-fullscreen');
              iframe.style.position = '';
              iframe.style.top = '';
              iframe.style.left = '';
              iframe.style.width = '';
              iframe.style.height = '';
              iframe.style.zIndex = '';
              iframe.style.transform = '';
            }
          });
          
          document.body.style.overflow = '';
          
          // Native fullscreen varsa onu da kapat
          if (document.fullscreenElement) {
            try { document.exitFullscreen(); } catch (_err) {}
          }
          
        })();
      `).catch((err) => {
      });
    }
  });

  const isAllowed = (raw) => {
    try {
      const u = new URL(raw);
      const host = (u.hostname || '').toLowerCase();
      return USER_ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    } catch (_err) {
      return false;
    }
  };

  // Bazı video player'lar tam ekran için window.open kullanabiliyor.
  // OGame için popup pencerelerini görünür şekilde aç.
  view.webContents.setWindowOpenHandler((details) => {
    const targetUrl = String(details?.url || '').trim();
    const isBlankish = !targetUrl || /^about:/i.test(targetUrl) || /^javascript:/i.test(targetUrl);

    if (isBlankish || isAllowed(targetUrl)) {
      // Popup pencere aç
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: true,
          width: 1200,
          height: 800,
          autoHideMenuBar: true,
          backgroundColor: '#0f1115',
          icon: path.join(__dirname, 'resources', 'icons', 'ogame.ico'),
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: false,
            allowRunningInsecureContent: true
          }
        }
      };
    }

    // İzin verilmeyen URL'lere yeni pencere açma engelle
    return { action: 'deny' };
  });

  // Debug: Tam ekran butonu tepkisizse hangi akış tetikleniyor görmek için.
  view.webContents.on('console-message', (_event, _level, message) => {
    if (message && String(message).includes('fullscreen')) {
    }
  });
  view.webContents.on('will-navigate', (e, url) => {
    if (!isAllowed(url)) {
      // İzin verilmeyen domain'e gitmeye çalışıldı, engelle
      e.preventDefault();
      try { view.webContents.loadURL(TARGET); } catch (_err) { /* ignore */ }
    }
  });
  view.webContents.on('will-redirect', (e, url) => {
    if (!isAllowed(url)) {
      // İzin verilmeyen domain'e redirect engelle
      e.preventDefault();
      try { view.webContents.loadURL(TARGET); } catch (_err) { /* ignore */ }
    }
  });

  userWindow.webContents.on('before-input-event', (event, input) => {
    if (!input) return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = !!input.control;
    const meta = !!input.meta;
    if ((ctrl || meta) && ['l', 't', 'n', 'w', 'r'].includes(key)) event.preventDefault();
    if (key === 'f12') event.preventDefault();
  });

  view.webContents.loadURL(TARGET);
}

async function cleanup() {
  const targets = getAllTempSessions();
  for (const side of ['left', 'right']) {
    for (const view of tabViews[side].values()) {
      destroyView(view);
    }
    tabViews[side].clear();
    activeTab[side] = null;
  }

  await Promise.all(targets.map((session) => clearSessionData(session)));
}

function refreshCookieAllowList() {
  setCookieAllowList(getAllowListHosts());
}

function getAllowListHosts() {
  const systemHosts = allowChatgptCookies ? CHATGPT_COOKIE_HOSTS : [];
  const combined = new Set([...BASE_COOKIE_HOSTS, ...systemHosts, ...userAllowedHosts]);
  return Array.from(combined);
}

function isThirdParty(details) {
  try {
    const targetHost = new URL(details.url).hostname;
    const initiator = details.initiator || details.referrer || '';
    if (!initiator) return false;
    const initHost = new URL(initiator).hostname;

    const toSite = (host) => {
      const h = String(host || '').toLowerCase();
      if (!h) return '';
      // IP/localhost gibi durumlarda host'u direkt kullan.
      if (h === 'localhost') return h;
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return h;
      const parts = h.split('.').filter(Boolean);
      if (parts.length <= 2) return h;
      // Basit eTLD+1: son 2 label. (Bu projede hedef domain'ler için yeterli.)
      return parts.slice(-2).join('.');
    };

    const initSite = toSite(initHost);
    const targetSite = toSite(targetHost);
    // Aynı site (ebetlab.com gibi) ise third-party sayma.
    if (initSite && targetSite && initSite === targetSite) return false;

    return initHost && targetHost && initHost !== targetHost && !targetHost.endsWith(`.${initHost}`) && !initHost.endsWith(`.${targetHost}`);
  } catch (_err) {
    return false;
  }
}

const TRACKER_HOST_PATTERNS = [
  'doubleclick.net',
  'googletagmanager.com',
  'google-analytics.com',
  'facebook.com',
  'fbcdn.net',
  'ads-twitter.com',
  'scorecardresearch.com',
  'adservice.google.com'
];

function isTrackerHost(host) {
  const h = (host || '').toLowerCase();
  return TRACKER_HOST_PATTERNS.some((pat) => h === pat || h.endsWith(`.${pat}`));
}

function attachPrivacyHandlers(tempSession) {
  if (!tempSession) return;

  tempSession.webRequest.onHeadersReceived((details, callback) => {
    let headers = details.responseHeaders || {};

    // Third-party cookie blocking (optional)
    if (blockThirdPartyCookies && isThirdParty(details)) {
      headers = { ...headers };
      delete headers['Set-Cookie'];
      delete headers['set-cookie'];
    }

    // Fullscreen compatibility (some sites disable it via Permissions-Policy/Feature-Policy)
    // Be permissive here; kiosk mode relies on fullscreen for video playback.
    headers = { ...headers };
    delete headers['Permissions-Policy'];
    delete headers['permissions-policy'];
    headers['Permissions-Policy'] = ['fullscreen=*'];
    delete headers['Feature-Policy'];
    delete headers['feature-policy'];

    callback({ responseHeaders: headers });
  });

  tempSession.webRequest.onBeforeRequest((details, callback) => {
    if (!trackingProtection) {
      callback({ cancel: false });
      return;
    }
    let host = '';
    try { host = new URL(details.url).hostname; } catch (_err) { /* ignore */ }
    if (host && isTrackerHost(host) && isThirdParty(details)) {
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });
}

function permissionFromRequest(permission, details) {
  if (permission === 'notifications') return 'notifications';
  if (permission === 'geolocation') return 'geolocation';
  if (permission === 'media') {
    const types = details?.mediaTypes || [];
    if (types.includes('video')) return 'camera';
    if (types.includes('audio')) return 'microphone';
    return 'microphone';
  }
  return null;
}

function attachPermissionHandlers(tempSession) {
  if (!tempSession) return;
  tempSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    // Clipboard write should work like Chrome (no prompt) for common "Kopyala" buttons.
    if (permission === 'clipboard-sanitized-write' || permission === 'clipboard-write') {
      callback(true);
      return;
    }
    // Clipboard read (paste/readback) is more sensitive; keep it blocked by default.
    if (permission === 'clipboard-read') {
      callback(false);
      return;
    }

    const kind = permissionFromRequest(permission, details);
    if (!kind) {
      callback(false);
      return;
    }
    const host = getHostFromUrl(details?.requestingUrl || details?.securityOrigin || '');
    if (!host) {
      callback(false);
      return;
    }
    const store = permissionStore[kind];
    if (store.allow.has(host)) {
      callback(true);
      return;
    }
    if (store.deny.has(host)) {
      callback(false);
      return;
    }

    const message = `${host} ${kind} izni istiyor.`;
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'İzin isteği',
      message,
      buttons: ['İzin ver', 'Engelle'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      detail: 'Ayarlar > İzinler bölümünden kalıcı tercih yapabilirsiniz.'
    }).then((result) => {
      const allow = result.response === 0;
      updatePermissionStore(kind, host, allow ? 'allow' : 'deny');
      callback(allow);
    }).catch(() => callback(false));
  });
}

function rememberDownload(entry) {
  if (entry?.state === 'removed') {
    const key = entry.savePath || entry.id;
    for (let i = recentDownloads.length - 1; i >= 0; i -= 1) {
      const e = recentDownloads[i];
      const k = e.savePath || e.id;
      if (k === key) {
        recentDownloads.splice(i, 1);
      }
    }
    const mergedRemoved = getMergedDownloads();
    try { mainWindow?.webContents.send('downloads-updated', mergedRemoved); } catch (_err) { /* ignore */ }
    try { settingsWindow?.webContents.send('downloads-updated', mergedRemoved); } catch (_err) { /* ignore */ }
    return;
  }
  recentDownloads.unshift(entry);
  if (recentDownloads.length > 25) recentDownloads.length = 25;
  const merged = getMergedDownloads();
  try { mainWindow?.webContents.send('downloads-updated', merged); } catch (_err) { /* ignore */ }
  try { settingsWindow?.webContents.send('downloads-updated', merged); } catch (_err) { /* ignore */ }
}

function attachDownloadHandlers(tempSession) {
  if (!tempSession) return;
  ensureDownloadDir();
  tempSession.on('will-download', (event, item, wc) => {
    const defaultPath = resolveDownloadPath(item.getFilename());

    const result = dialog.showSaveDialogSync(mainWindow, {
      title: 'İndirilecek dosya',
      defaultPath: defaultPath,
      showsTagField: false
    });
    if (!result) {
      try { item.cancel(); } catch (_err) { /* ignore */ }
      return;
    }

    try { item.setSavePath(result); } catch (_err) { /* ignore */ }
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const entry = {
      id,
      url: item.getURL(),
      filename: item.getFilename(),
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      state: 'progress',
      savePath: result,
      canResume: item.canResume(),
      startTime: Date.now(),
      lastTick: Date.now(),
      lastBytes: 0,
      speed: 0
    };
    downloadItems.set(id, item);
    rememberDownload(entry);

    try {
      const notif = new Notification({ title: `${APP_NAME} - İndirme başladı`, body: entry.filename || 'İndirme', silent: true });
      notif.show();
    } catch (_err) { /* ignore */ }

    item.on('updated', (_event, state) => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.state = item.isPaused() ? 'paused' : state;
      entry.canResume = item.canResume();
      const now = Date.now();
      const deltaBytes = entry.receivedBytes - (entry.lastBytes || 0);
      const deltaTime = (now - (entry.lastTick || now)) / 1000;
      if (deltaTime > 0) entry.speed = deltaBytes / deltaTime;
      entry.lastBytes = entry.receivedBytes;
      entry.lastTick = now;
      rememberDownload({ ...entry });
    });

    item.once('done', (_event, state) => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.state = state === 'completed' ? 'completed' : 'failed';
      entry.savePath = item.getSavePath();
      entry.canResume = item.canResume();
      downloadItems.delete(id);
      entry.speed = 0;
      rememberDownload({ ...entry });
      try {
        const notif = new Notification({ title: entry.state === 'completed' ? `${APP_NAME} - İndirme tamamlandı` : `${APP_NAME} - İndirme başarısız`, body: entry.filename || '', silent: false });
        notif.show();
      } catch (_err) { /* ignore */ }
    });
  });
}

function sanitizeHostForAllowList(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^https?:\/\//i, '').replace(/^\*\.?/g, '');
  const host = stripped.split('/')[0].toLowerCase();
  if (!host || host.includes(' ')) return null;
  return host;
}

function getAllTempSessions() {
  const list = [sessions.left, sessions.right, sessions.ui, sessions.telegram, sessions.user].filter(Boolean);

  // Tüm kullanılan partition'ları ekle (AI, translator, email, calendar, clipboard, notes, status hepsi temp:ui)
  for (const part of usedPartitions) {
    try {
      const sess = session.fromPartition(part);
      if (sess) list.push(sess);
    } catch (_err) {
      /* ignore */
    }
  }
  
  // AI partition'larını da açıkça ekle
  for (const part of AI_PARTITIONS) {
    try {
      const sess = session.fromPartition(part);
      if (sess) list.push(sess);
    } catch (_err) {
      /* ignore */
    }
  }

  return Array.from(new Set(list));
}

async function collectCookieStats() {
  const domainMap = new Map();
  const targets = getAllTempSessions();

  for (const temp of targets) {
    let cookies = [];
    try {
      cookies = await temp.cookies.get({});
    } catch (err) {
      console.error('cookie get failed', err);
      continue;
    }

    for (const cookie of cookies) {
      const domain = (cookie.domain || '').replace(/^\./, '').toLowerCase() || '(bilinmiyor)';
      const size = Buffer.byteLength(`${cookie.name || ''}=${cookie.value || ''}`, 'utf8');
      const entry = domainMap.get(domain) || { domain, count: 0, size: 0 };
      entry.count += 1;
      entry.size += size;
      domainMap.set(domain, entry);
    }
  }

  const entries = Array.from(domainMap.values()).sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return a.domain.localeCompare(b.domain);
  });

  const totalBytes = entries.reduce((sum, item) => sum + item.size, 0);
  return { totalBytes, entries };
}

function getActiveHosts() {
  const result = {};
  for (const side of ['left', 'right']) {
    const view = getActiveView(side);
    const url = view?.webContents?.getURL?.();
    if (url) {
      try {
        const host = new URL(url).hostname;
        result[side] = host;
      } catch (_err) {
        /* ignore */
      }
    }
  }
  return result;
}

async function getCookiesForHost(host) {
  const clean = sanitizeHostForAllowList(host);
  if (!clean) return [];

  const result = [];
  const targets = getAllTempSessions();

  for (const temp of targets) {
    let cookies = [];
    try {
      cookies = await temp.cookies.get({});
    } catch (err) {
      console.error('cookie get failed', err);
      continue;
    }

    for (const cookie of cookies) {
      const domain = (cookie.domain || '').replace(/^\./, '').toLowerCase();
      if (domain === clean || domain.endsWith(`.${clean}`)) {
        result.push(cookie);
      }
    }
  }

  return result;
}

async function clearCookiesForHost(host) {
  const clean = sanitizeHostForAllowList(host);
  if (!clean) return { removed: 0, host: host || '' };

  let removed = 0;
  const targets = getAllTempSessions();

  for (const temp of targets) {
    let cookies = [];
    try {
      cookies = await temp.cookies.get({});
    } catch (err) {
      console.error('cookie get failed', err);
      continue;
    }

    for (const cookie of cookies) {
      const domain = (cookie.domain || '').replace(/^\./, '').toLowerCase();
      if (domain === clean || domain.endsWith(`.${clean}`)) {
        const scheme = cookie.secure ? 'https' : 'http';
        const cookieDomain = (cookie.domain || '').replace(/^\./, '');
        const pathPart = cookie.path || '/';
        const url = `${scheme}://${cookieDomain}${pathPart}`;
        try {
          await temp.cookies.remove(url, cookie.name);
          removed += 1;
        } catch (err) {
          console.error('cookie remove failed', err);
        }
      }
    }
  }

  return { removed, host: clean };
}

async function clearAllCookies() {
  const targets = getAllTempSessions();
  for (const temp of targets) {
    await clearSessionData(temp);
  }
}

function openSettingsWindow(section) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    if (section) {
      settingsWindow.webContents.executeJavaScript(`
        const btn = document.querySelector('.nav-link[data-target="section-${section}"]');
        if (btn) btn.click();
      `);
    }
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Ayarlar',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  if (section) {
    settingsWindow.webContents.once('did-finish-load', () => {
      settingsWindow.webContents.executeJavaScript(`
        const btn = document.querySelector('.nav-link[data-target="section-${section}"]');
        if (btn) btn.click();
      `);
    });
  }
}

async function createWindow() {
  refreshCookieAllowList();
  try { fs.mkdirSync(DOWNLOAD_DIR, { recursive: true }); } catch (_err) { /* ignore */ }

  markPartition('temp:ui');
  markPartition('temp:left');
  markPartition('temp:right');
  markPartition('temp:telegram');
  sessions.ui = createTempSession('temp:ui', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
  sessions.left = createTempSession('temp:left', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
  sessions.right = createTempSession('temp:right', { persistent: persistentSession, cache: cacheEnabled, allowAllCookies });
  sessions.telegram = createPermissiveSession('temp:telegram', { persistent: persistentSession, cache: cacheEnabled });

  for (const sess of getAllTempSessions()) {
    attachPrivacyHandlers(sess);
    attachPermissionHandlers(sess);
    attachDownloadHandlers(sess);
  }

  registerIpcHandlers();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, 'resources', 'icons', 'ogame.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b0d10',
      symbolColor: '#e5e5e5',
      height: TABBAR_HEIGHT
    },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'temp:ui',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      webSecurity: true,
      devTools: false
    }
  });

  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // F12 veya Ctrl+Shift+I (DevTools)
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
        return;
      }
      // Ctrl+R (normal yenileme) veya Ctrl+Shift+R (hard yenileme)
      if (input.control && (input.key === 'r' || input.key === 'R')) {
        event.preventDefault();
        return;
      }
    }

    // UI (renderer) üzerinde default Chromium zoom'u engelle.
    // Zoom sadece BrowserView içinde (webContents) çalışsın.
    if (input.control && input.type === 'mouseWheel') {
      event.preventDefault();
      return;
    }
    if (input.control && input.type === 'keyDown') {
      const k = String(input.key || '');
      if (k === '+' || k === '=' || k === '-' || k === '_' || k === '0') {
        event.preventDefault();
      }
    }
  });

  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // UI zoom'u tamamen kapat (Chrome benzeri: sadece sayfa/BrowserView zoomlanır).
  try {
    mainWindow.webContents.setZoomFactor(1);
    mainWindow.webContents.setZoomLevel(0);
    Promise.resolve(mainWindow.webContents.setVisualZoomLevelLimits(1, 1)).catch(() => {});
    // Ctrl+0/+/- gibi layout zoom değişimlerini de kilitle.
    try { mainWindow.webContents.setLayoutZoomLevelLimits(0, 0); } catch (_err) { /* ignore */ }
    mainWindow.webContents.on('did-change-zoom-level', () => {
      try { mainWindow.webContents.setZoomLevel(0); } catch (_err) { /* ignore */ }
      try { mainWindow.webContents.setZoomFactor(1); } catch (_err) { /* ignore */ }
    });
  } catch (_err) {
    /* ignore */
  }

  layout = createDualLayout(mainWindow, null, null, { toolbarHeight: TOOLBAR_HEIGHT + TABBAR_HEIGHT, sidebarWidth: SIDEBAR_WIDTH });

  layout.applyLayout();
  
  // Clipboard monitoring'i başlat
  startClipboardMonitoring();
  
  // Global shortcuts
  try {
    // Ctrl+Q toggles Telegram window
    const ok = globalShortcut.register('Control+Q', () => {
      toggleTelegramWindow();
    });
    if (!ok) {
      console.warn('[shortcuts] Control+Q register failed (already in use?)');
    }
  } catch (_err) {
    /* ignore */
  }
  // Hide floating notes when main regains focus (e.g., clicks in main UI)
  mainWindow.on('focus', () => hideNotesWindow());
  // Ensure any views created during renderer boot are sized once layout exists.
  layout.setActiveViews(getActiveView('left'), getActiveView('right'));

  mainWindow.on('move', () => {
    positionPanelWindow();
    positionSiteInfoWindow();
    positionZoomMenuWindow();
    positionTabOverflowWindow();
  });
  mainWindow.on('resize', () => {
    positionPanelWindow();
    positionTelegramWindow();
    positionSiteInfoWindow();
    positionZoomMenuWindow();
    positionTabOverflowWindow();
  });
  mainWindow.on('focus', () => {
    positionPanelWindow();
    positionTelegramWindow();
    // Clicking back into the main window should dismiss the popover.
    hideSiteInfoWindow();
    hideZoomMenuWindow();
    hideTabOverflowWindow();
  });


  mainWindow.on('close', (event) => {
    if (exiting) return;
    event.preventDefault();
    confirmExit().then((ok) => {
      if (ok) startExitCleanup();
    });
  });

  mainWindow.on('minimize', () => {
    // Keep app visible during exit animations; if already exiting, restore.
    if (exiting) {
      try { mainWindow.restore(); } catch (_err) { /* ignore */ }
    }
  });
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    // Bildirim ayarlarını yükle
    loadNotificationSettings();
    // Auth config'i yükle
    authConfig = loadAuthConfig();
    // Direkt user mode ile başlat
    currentRole = 'user';
    return createUserKioskWindow();
  }).catch((err) => {
    // createUserKioskWindow içindeki hataları yakalansın.
    console.error('app.whenReady/createUserKioskWindow failed', err);
    try { app.quit(); } catch (_err) { /* ignore */ }
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_err) { /* ignore */ }
  stopClipboardMonitoring();
  stopCalendarAlarmChecking();
});

app.on('before-quit', async (event) => {
  // Sadece admin mode mainWindow varsa onay iste
  // Login window veya user window kapanıyorsa direkt çıkış yap (onay sorma)
  if (!mainWindow || mainWindow.isDestroyed()) {
    // mainWindow yoksa (login veya user mode), yine de "çıkışta sıfır iz" için temizlik yap.
    if (exiting) return;
    exiting = true;
    event.preventDefault();

    try { await cleanupTempIcons(); } catch (_err) { /* ignore */ }

    try {
      const targets = getAllTempSessions();
      await Promise.all(targets.map((sess) => clearSessionData(sess)));
    } catch (_err) {
      /* ignore */
    }

    try { schedulePostExitWipe(); } catch (_err) { /* ignore */ }
    app.exit(0);
    return;
  }
  
  // Admin mode (mainWindow) için onay iste
  if (exiting) return;
  event.preventDefault();
  const ok = await confirmExit();
  if (!ok) return;
  await cleanupTempIcons();
  await startExitCleanup();
});

// Handle system close requests (e.g., taskbar X) to ensure modal shows.
// SADECE admin modundaki mainWindow için onay iste
app.on('browser-window-close', (event, window) => {
  // Login window ve user window için direkt kapansın (onay sorma)
  if (window === loginWindow || window === userWindow) return;
  
  // Admin mode main window için onay iste
  if (window !== mainWindow) return;
  if (exiting) return;
  event.preventDefault();
  confirmExit().then((ok) => {
    if (ok) startExitCleanup();
  });
});
