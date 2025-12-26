const { session } = require('electron');

// Mutable allowlist; can be updated at runtime.
let cookieAllowList = new Set([
  'chatgpt.com',
  '.chatgpt.com',
  'openai.com',
  '.openai.com',
  't.me',
  '.t.me',
  'telegram.org',
  '.telegram.org',
  'web.telegram.org',
  'ebetlab.com',
  '.ebetlab.com'
]);

function setCookieAllowList(hosts) {
  cookieAllowList = new Set(hosts || []);
}

function isAllowedHost(url) {
  try {
    const host = new URL(url).hostname;
    for (const suffix of cookieAllowList) {
      const clean = suffix.replace(/^\./, '');
      if (host === clean || host.endsWith(`.${clean}`)) return true;
    }
  } catch (_err) {
    return false;
  }
  return false;
}

function createTempSession(partition, options = {}) {
  const { persistent = false, cache = false, allowAllCookies = true } = options;
  const partitionName = persistent ? `persist:${partition}` : partition;
  const temp = session.fromPartition(partitionName, { cache });
  
  if (allowAllCookies) {
    // Tüm sitelere cookie izni ver - zaten RAM'de, uygulama kapanınca silinecek
    temp.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      if (!headers['Accept-Language']) {
        headers['Accept-Language'] = 'tr-TR,tr;q=0.9,en;q=0.5';
      }
      callback({ cancel: false, requestHeaders: headers });
    });
  } else {
    // Sadece allowlist'teki sitelere cookie izni ver
    blockCookies(temp);
  }
  
  hardenPermissions(temp);
  // Start clean for peace of mind (only if temp).
  if (!persistent) clearSessionData(temp);
  return temp;
}

// Permissive session (no cookie blocking) for apps like Telegram that require full cookie flow.
function createPermissiveSession(partition, options = {}) {
  const { persistent = false, cache = false } = options;
  const partitionName = persistent ? `persist:${partition}` : partition;
  const temp = session.fromPartition(partitionName, { cache });
  // Allow everything but still set language header and notifications permission.
  temp.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!headers['Accept-Language']) {
      headers['Accept-Language'] = 'tr-TR,tr;q=0.9,en;q=0.5';
    }
    callback({ cancel: false, requestHeaders: headers });
  });
  temp.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'notifications') return callback(true);
    if (permission === 'media') return callback(true);
    if (permission === 'clipboard-read') return callback(true);
    if (permission === 'clipboard-sanitized-write' || permission === 'clipboard-write') return callback(true);
    callback(false);
  });
  temp.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications' || permission === 'media') return true;
    if (permission === 'clipboard-read') return true;
    if (permission === 'clipboard-sanitized-write' || permission === 'clipboard-write') return true;
    return false;
  });
  if (!persistent) clearSessionData(temp);
  return temp;
}

async function clearSessionData(temp) {
  if (!temp) return;
  try {
    await temp.clearCache();
  } catch (err) {
    console.error('clearCache failed', err);
  }
  try {
    await temp.clearStorageData({
      storages: [
        'cookies',
        'localstorage',
        'caches',
        'indexeddb',
        'serviceworkers',
        'filesystem',
        'websql'
      ]
    });
  } catch (err) {
    console.error('clearStorageData failed', err);
  }

    try {
      if (temp.serviceWorkers?.unregisterAll) {
        await temp.serviceWorkers.unregisterAll();
      }
    } catch (err) {
      console.error('serviceWorker unregister failed', err);
    }
}

function blockCookies(temp) {
  temp.webRequest.onBeforeSendHeaders((details, callback) => {
    const applyLang = (headers) => {
      if (!headers['Accept-Language']) {
        headers['Accept-Language'] = 'tr-TR,tr;q=0.9,en;q=0.5';
      }
      return headers;
    };

    const allowed = isAllowedHost(details.url);
    
    // Debug için ebetlab isteklerini logla
    if (details.url.includes('ebetlab.com')) {
      if (!allowed) {
      }
    }

    if (allowed) {
      callback({ cancel: false, requestHeaders: applyLang(details.requestHeaders) });
      return;
    }
    const headers = applyLang({ ...details.requestHeaders });
    delete headers.Cookie;
    callback({ cancel: false, requestHeaders: headers });
  });

  temp.webRequest.onHeadersReceived((details, callback) => {
    if (isAllowedHost(details.url)) {
      callback({ cancel: false, responseHeaders: details.responseHeaders });
      return;
    }
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        delete headers[key];
      }
    }
    callback({ cancel: false, responseHeaders: headers });
  });

  temp.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'notifications') return callback(true);
    if (permission === 'clipboard-read') return callback(true);
    if (permission === 'clipboard-sanitized-write' || permission === 'clipboard-write') return callback(true);
    callback(false);
  });
}

function hardenPermissions(temp) {
  temp.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications') return true;
    if (permission === 'clipboard-read') return true;
    if (permission === 'clipboard-sanitized-write' || permission === 'clipboard-write') return true;
    return false;
  });
}

module.exports = {
  createTempSession,
  createPermissiveSession,
  clearSessionData,
  setCookieAllowList
};
