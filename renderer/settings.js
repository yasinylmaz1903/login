(() => {
  const dom = {
    toggleChatgpt: document.getElementById('toggle-chatgpt-cookies'),
    toggleTelegram: document.getElementById('toggle-telegram-session'),
    close: document.getElementById('btn-close'),
    cookieList: document.getElementById('cookie-list'),
    refreshCookies: document.getElementById('btn-refresh-cookies'),
    clearAll: document.getElementById('btn-clear-all'),
    telegramCookieCount: document.getElementById('telegram-cookie-count'),
    telegramStorageSize: document.getElementById('telegram-storage-size'),
    telegramToggleWindow: document.getElementById('btn-telegram-toggle'),
    telegramHideWindow: document.getElementById('btn-telegram-hide'),
    refreshTelegramInfo: document.getElementById('refresh-telegram-info'),
    clearTelegramSession: document.getElementById('clear-telegram-session'),
    allowInput: document.getElementById('input-allow-host'),
    addAllow: document.getElementById('btn-add-allow'),
    allowList: document.getElementById('allow-list'),
    navLinks: document.querySelectorAll('.nav-link'),
    sections: document.querySelectorAll('.section'),
    allowLeft: document.getElementById('btn-allow-left'),
    allowRight: document.getElementById('btn-allow-right'),
    quickHosts: document.getElementById('quick-hosts'),
    notesList: document.getElementById('notes-settings-list'),
    notesImport: document.getElementById('btn-notes-import'),
    notesExport: document.getElementById('btn-notes-export'),
    notesFile: document.getElementById('input-notes-file'),
    permissionList: document.getElementById('permission-list'),
    permissionHost: document.getElementById('permission-host'),
    permissionKind: document.getElementById('permission-kind'),
    permissionAllow: document.getElementById('btn-permission-allow'),
    permissionDeny: document.getElementById('btn-permission-deny'),
    toggleThirdParty: document.getElementById('toggle-thirdparty'),
    toggleTracking: document.getElementById('toggle-tracking'),
    downloadList: document.getElementById('download-list'),
    togglePersistentSession: document.getElementById('toggle-persistent-session'),
    toggleAllowAllCookies: document.getElementById('toggle-allow-all-cookies'),
    toggleStorageEnabled: document.getElementById('toggle-storage-enabled'),
    toggleCacheEnabled: document.getElementById('toggle-cache-enabled'),

    authAdminUsername: document.getElementById('auth-admin-username'),
    authAdminPassword: document.getElementById('auth-admin-password'),
    authUserUsername: document.getElementById('auth-user-username'),
    authUserPassword: document.getElementById('auth-user-password'),
    authUserModeSite: document.getElementById('auth-usermode-site'),
    authSave: document.getElementById('btn-auth-save'),
    authSaveStatus: document.getElementById('auth-save-status'),

    aiResetSessions: document.getElementById('btn-ai-reset-sessions'),
    aiClearCookies: document.getElementById('btn-ai-clear-cookies'),
    aiActionStatus: document.getElementById('ai-action-status'),

    // Notification test buttons
    testNotificationSimple: document.getElementById('btn-test-notification-simple'),
    testNotificationSuccess: document.getElementById('btn-test-notification-success'),
    testNotificationError: document.getElementById('btn-test-notification-error'),
    testNotificationInfo: document.getElementById('btn-test-notification-info'),
    testNotificationMulti: document.getElementById('btn-test-notification-multi'),

    // Notification settings
    notificationPosition: document.getElementById('notification-position'),
    notificationDisplay: document.getElementById('notification-display'),
    notificationTheme: document.getElementById('notification-theme'),
    notificationAnimationType: document.getElementById('notification-animation-type'),
    notificationDuration: document.getElementById('notification-duration'),
    notificationMaxCount: document.getElementById('notification-max-count'),
    notificationSpacing: document.getElementById('notification-spacing'),
    notificationAnimationSpeed: document.getElementById('notification-animation-speed'),
    notificationStackMode: document.getElementById('notification-stack-mode'),

    // Telegram storage
    telegramStorageList: document.getElementById('telegram-storage-list'),
    telegramStorageRefresh: document.getElementById('btn-telegram-storage-refresh')
  };

  const NOTES_KEY = 'ghost-notes';
  let permissionStore = { camera: { allow: [], deny: [] }, microphone: { allow: [], deny: [] }, geolocation: { allow: [], deny: [] }, notifications: { allow: [], deny: [] }, popups: { allow: [], deny: [] } };

  let notes = [];

  function loadSettings() {
    window.browserAPI.getSettings?.()
      .then((settings) => {
        if (settings && typeof settings.allowChatgptCookies === 'boolean') {
          if (dom.toggleChatgpt) dom.toggleChatgpt.checked = settings.allowChatgptCookies;
        }
        if (settings && typeof settings.allowTelegramSession === 'boolean') {
          applyTelegramEnabledState(settings.allowTelegramSession);
          if (settings.allowTelegramSession) refreshTelegramInfo();
        }
        if (settings && typeof settings.blockThirdPartyCookies === 'boolean') {
          if (dom.toggleThirdParty) dom.toggleThirdParty.checked = settings.blockThirdPartyCookies;
        }
        if (settings && typeof settings.trackingProtection === 'boolean') {
          if (dom.toggleTracking) dom.toggleTracking.checked = settings.trackingProtection;
        }
        if (settings?.permissionStore) {
          permissionStore = mergePermissionStores(permissionStore, settings.permissionStore);
          renderPermissionList();
        }
        if (settings && typeof settings.persistentSession === 'boolean') {
          if (dom.togglePersistentSession) dom.togglePersistentSession.checked = settings.persistentSession;
        }
        if (settings && typeof settings.allowAllCookies === 'boolean') {
          if (dom.toggleAllowAllCookies) dom.toggleAllowAllCookies.checked = settings.allowAllCookies;
        }
        if (settings && typeof settings.storageEnabled === 'boolean') {
          if (dom.toggleStorageEnabled) dom.toggleStorageEnabled.checked = settings.storageEnabled;
        }
        if (settings && typeof settings.cacheEnabled === 'boolean') {
          if (dom.toggleCacheEnabled) dom.toggleCacheEnabled.checked = settings.cacheEnabled;
        }
      })
      .catch(() => {});

    window.browserAPI.getAuthConfig?.()
      .then((res) => {
        if (!res?.ok) return;
        if (dom.authAdminUsername) dom.authAdminUsername.value = res?.admin?.username || '';
        if (dom.authUserUsername) dom.authUserUsername.value = res?.user?.username || '';
        if (dom.authUserModeSite) dom.authUserModeSite.value = res?.userModeSite || 'https://lobby.ogame.gameforge.com/tr_TR/';
      })
      .catch(() => {});
  }

  function mergePermissionStores(base, incoming) {
    const next = { ...(base || {}) };
    const src = incoming || {};
    Object.keys(src).forEach((kind) => {
      const bucket = src[kind] || {};
      next[kind] = {
        allow: Array.isArray(bucket.allow) ? bucket.allow : [],
        deny: Array.isArray(bucket.deny) ? bucket.deny : []
      };
    });
    return next;
  }

  function permissionLabel(kind) {
    switch (kind) {
      case 'camera': return 'Kamera';
      case 'microphone': return 'Mikrofon';
      case 'geolocation': return 'Konum';
      case 'notifications': return 'Bildirim';
      case 'popups': return 'Pop-up pencereler';
      default: return String(kind || '').trim() || 'Bilinmeyen';
    }
  }

  async function saveAuth() {
    if (dom.authSaveStatus) dom.authSaveStatus.textContent = '';
    const payload = {
      admin: {
        username: String(dom.authAdminUsername?.value || '').trim(),
        password: String(dom.authAdminPassword?.value || '').trim()
      },
      user: {
        username: String(dom.authUserUsername?.value || '').trim(),
        password: String(dom.authUserPassword?.value || '').trim()
      },
      userModeSite: String(dom.authUserModeSite?.value || '').trim() || 'https://lobby.ogame.gameforge.com/tr_TR/'
    };

    try {
      if (dom.authSave) dom.authSave.disabled = true;
      const res = await window.browserAPI.setAuthConfig?.(payload);
      if (res?.ok) {
        if (dom.authSaveStatus) dom.authSaveStatus.textContent = 'Kaydedildi.';
        if (dom.authAdminPassword) dom.authAdminPassword.value = '';
        if (dom.authUserPassword) dom.authUserPassword.value = '';
      } else {
        if (dom.authSaveStatus) dom.authSaveStatus.textContent = res?.message || 'Kaydedilemedi.';
      }
    } catch (_err) {
      if (dom.authSaveStatus) dom.authSaveStatus.textContent = 'Kaydedilemedi.';
    } finally {
      if (dom.authSave) dom.authSave.disabled = false;
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function applyTelegramEnabledState(enabled) {
    const active = !!enabled;
    if (dom.toggleTelegram) dom.toggleTelegram.checked = active;
    if (dom.telegramToggleWindow) dom.telegramToggleWindow.disabled = !active;
    // Telegram izni kapalı olsa bile pencere açık kalmış olabilir;
    // kullanıcı tek tıkla gizleyebilsin.
    if (dom.telegramHideWindow) dom.telegramHideWindow.disabled = false;
    if (dom.refreshTelegramInfo) dom.refreshTelegramInfo.disabled = !active;
    if (dom.clearTelegramSession) dom.clearTelegramSession.disabled = !active;
    if (dom.telegramStorageRefresh) dom.telegramStorageRefresh.disabled = !active;
    if (!active) {
      if (dom.telegramCookieCount) dom.telegramCookieCount.textContent = 'Kapalı';
      if (dom.telegramStorageSize) dom.telegramStorageSize.textContent = 'Kapalı';
      if (dom.telegramStorageList) dom.telegramStorageList.innerHTML = '<div class="empty">Telegram oturumu kapalı</div>';
    }
  }

  function setAiStatus(text) {
    if (!dom.aiActionStatus) return;
    dom.aiActionStatus.textContent = String(text || '').trim() || '';
  }

  async function aiResetSessions() {
    const ok = window.confirm('AI oturumları sıfırlansın mı? (ChatGPT/Gemini/Copilot/Grok oturumlarınız kapanabilir)');
    if (!ok) return;
    setAiStatus('İşleniyor...');
    if (dom.aiResetSessions) dom.aiResetSessions.disabled = true;
    if (dom.aiClearCookies) dom.aiClearCookies.disabled = true;
    try {
      const res = await window.browserAPI.aiResetSessions?.();
      if (res?.ok) setAiStatus('Tamamlandı. AI penceresini açtığınızda yeniden giriş isteyebilir.');
      else setAiStatus('Başarısız oldu.');
    } catch (_err) {
      setAiStatus('Başarısız oldu.');
    } finally {
      if (dom.aiResetSessions) dom.aiResetSessions.disabled = false;
      if (dom.aiClearCookies) dom.aiClearCookies.disabled = false;
    }
  }

  async function aiClearCookies() {
    const ok = window.confirm('AI çerezleri temizlensin mi?');
    if (!ok) return;
    setAiStatus('İşleniyor...');
    if (dom.aiClearCookies) dom.aiClearCookies.disabled = true;
    if (dom.aiResetSessions) dom.aiResetSessions.disabled = true;
    try {
      const res = await window.browserAPI.aiClearCookies?.();
      if (res?.ok) setAiStatus('Tamamlandı.');
      else setAiStatus('Başarısız oldu.');
    } catch (_err) {
      setAiStatus('Başarısız oldu.');
    } finally {
      if (dom.aiClearCookies) dom.aiClearCookies.disabled = false;
      if (dom.aiResetSessions) dom.aiResetSessions.disabled = false;
    }
  }

    if (dom.authSave) {
      dom.authSave.addEventListener('click', () => {
        saveAuth();
      });
    }

  function renderTelegramInfo(info) {
    if (dom.telegramCookieCount) dom.telegramCookieCount.textContent = `${info?.cookies ?? 0}`;
    if (dom.telegramStorageSize) dom.telegramStorageSize.textContent = formatBytes(info?.size || 0);
  }

  async function refreshTelegramStorageData() {
    if (!dom.telegramStorageList) return;
    
    dom.telegramStorageList.innerHTML = '<div class="empty">Yükleniyor...</div>';
    
    try {
      const data = await window.browserAPI.getTelegramStorageData?.();
      
      if (data?.error) {
        dom.telegramStorageList.innerHTML = `<div class="empty">❌ ${data.error}</div>`;
        return;
      }

      const localStorage = data?.localStorage || {};
      const sessionStorage = data?.sessionStorage || {};
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);

      if (localKeys.length === 0 && sessionKeys.length === 0) {
        dom.telegramStorageList.innerHTML = '<div class="empty">📭 Depolama verisi bulunamadı</div>';
        return;
      }

      dom.telegramStorageList.innerHTML = '';

      if (data?.origin) {
        const originCard = document.createElement('div');
        originCard.className = 'card';
        originCard.innerHTML = `
          <div class="text">
            <div class="title">🌐 Kaynak</div>
            <div class="desc">${data.origin}</div>
          </div>
        `;
        dom.telegramStorageList.appendChild(originCard);
      }

      if (localKeys.length > 0) {
        const localCard = document.createElement('div');
        localCard.className = 'card column';
        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `
          <div class="text">
            <div class="title">💾 localStorage</div>
            <div class="desc">${localKeys.length} anahtar</div>
          </div>
        `;
        localCard.appendChild(header);

        localKeys.forEach((key) => {
          const value = localStorage[key];
          const row = document.createElement('div');
          row.className = 'storage-row';
          row.style.cssText = 'padding: 8px 12px; margin: 4px 0; background: var(--bg-secondary); border-radius: 6px; font-size: 13px;';
          
          const keySpan = document.createElement('strong');
          keySpan.textContent = key;
          keySpan.style.cssText = 'color: var(--accent-color); display: block; margin-bottom: 4px;';
          
          const valueSpan = document.createElement('div');
          valueSpan.textContent = String(value).substring(0, 200) + (String(value).length > 200 ? '...' : '');
          valueSpan.style.cssText = 'color: var(--text-secondary); word-break: break-all; font-family: monospace; font-size: 12px;';
          
          row.appendChild(keySpan);
          row.appendChild(valueSpan);
          localCard.appendChild(row);
        });

        dom.telegramStorageList.appendChild(localCard);
      }

      if (sessionKeys.length > 0) {
        const sessionCard = document.createElement('div');
        sessionCard.className = 'card column';
        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `
          <div class="text">
            <div class="title">🔒 sessionStorage</div>
            <div class="desc">${sessionKeys.length} anahtar</div>
          </div>
        `;
        sessionCard.appendChild(header);

        sessionKeys.forEach((key) => {
          const value = sessionStorage[key];
          const row = document.createElement('div');
          row.className = 'storage-row';
          row.style.cssText = 'padding: 8px 12px; margin: 4px 0; background: var(--bg-secondary); border-radius: 6px; font-size: 13px;';
          
          const keySpan = document.createElement('strong');
          keySpan.textContent = key;
          keySpan.style.cssText = 'color: var(--accent-color); display: block; margin-bottom: 4px;';
          
          const valueSpan = document.createElement('div');
          valueSpan.textContent = String(value).substring(0, 200) + (String(value).length > 200 ? '...' : '');
          valueSpan.style.cssText = 'color: var(--text-secondary); word-break: break-all; font-family: monospace; font-size: 12px;';
          
          row.appendChild(keySpan);
          row.appendChild(valueSpan);
          sessionCard.appendChild(row);
        });

        dom.telegramStorageList.appendChild(sessionCard);
      }

    } catch (err) {
      dom.telegramStorageList.innerHTML = `<div class="empty">❌ Hata: ${err.message}</div>`;
    }
  }

  async function refreshTelegramInfo() {
    if (!dom.toggleTelegram?.checked) {
      applyTelegramEnabledState(false);
      return;
    }
    if (dom.telegramCookieCount) dom.telegramCookieCount.textContent = 'Yükleniyor...';
    if (dom.telegramStorageSize) dom.telegramStorageSize.textContent = 'Yükleniyor...';
    if (dom.refreshTelegramInfo) dom.refreshTelegramInfo.disabled = true;
    try {
      const info = await window.browserAPI.getTelegramSessionInfo?.();
      renderTelegramInfo(info || { cookies: 0, size: 0 });
    } catch (_err) {
      if (dom.telegramCookieCount) dom.telegramCookieCount.textContent = 'Okunamadı';
      if (dom.telegramStorageSize) dom.telegramStorageSize.textContent = 'Okunamadı';
    } finally {
      if (dom.refreshTelegramInfo) dom.refreshTelegramInfo.disabled = !dom.toggleTelegram?.checked;
      if (dom.clearTelegramSession) dom.clearTelegramSession.disabled = !dom.toggleTelegram?.checked;
    }
  }

  function renderCookieStats(data) {
    if (!dom.cookieList) return;
    dom.cookieList.innerHTML = '';

    const entries = data?.entries || [];
    const totalBytes = data?.totalBytes || 0;

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Kayıtlı çerez yok.';
      dom.cookieList.appendChild(empty);
      return;
    }

    const summary = document.createElement('div');
    summary.className = 'cookie-row';
    const summaryText = document.createElement('div');
    summaryText.className = 'cookie-domain';
    summaryText.textContent = 'Toplam';
    const summaryMeta = document.createElement('div');
    summaryMeta.className = 'cookie-meta';
    summaryMeta.textContent = formatBytes(totalBytes);
    summary.appendChild(summaryText);
    summary.appendChild(summaryMeta);
    dom.cookieList.appendChild(summary);

    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'cookie-row';

      const left = document.createElement('div');
      left.className = 'cookie-domain';
      left.textContent = entry.domain;

      const meta = document.createElement('div');
      meta.className = 'cookie-meta';
      meta.textContent = `${entry.count} çerez • ${formatBytes(entry.size)}`;

      const clearBtn = document.createElement('button');
      clearBtn.className = 'ghost-btn';
      clearBtn.textContent = 'Temizle';
      clearBtn.addEventListener('click', async () => {
        clearBtn.disabled = true;
        try {
          await window.browserAPI.clearCookiesForHost?.(entry.domain);
          await refreshCookieStats();
        } catch (_err) {
          clearBtn.disabled = false;
        }
      });

      row.appendChild(left);
      row.appendChild(meta);
      row.appendChild(clearBtn);
      dom.cookieList.appendChild(row);
    });
  }

  async function refreshCookieStats() {
    if (!dom.cookieList) return;
    dom.cookieList.innerHTML = '<div class="empty">Yükleniyor...</div>';
    try {
      const data = await window.browserAPI.getCookieStats?.();
      renderCookieStats(data);
    } catch (_err) {
      dom.cookieList.innerHTML = '<div class="empty">Çerezler okunamadı.</div>';
    }
  }

  async function clearAllCookies() {
    if (!dom.clearAll) return;
    dom.clearAll.disabled = true;
    dom.clearAll.textContent = 'Temizleniyor...';
    try {
      await window.browserAPI.clearAllCookies?.();
      await refreshCookieStats();
    } catch (_err) {
      /* ignore */
    } finally {
      dom.clearAll.disabled = false;
      dom.clearAll.textContent = 'Tüm çerezleri temizle';
    }
  }

  async function clearTelegramSession() {
    if (!dom.clearTelegramSession) return;
    const prevText = dom.clearTelegramSession.textContent;
    dom.clearTelegramSession.disabled = true;
    dom.clearTelegramSession.textContent = 'Temizleniyor...';
    try {
      await window.browserAPI.clearTelegramSession?.();
      await refreshTelegramInfo();
      refreshTelegramStorageData();
    } catch (_err) {
      /* ignore */
    } finally {
      dom.clearTelegramSession.textContent = prevText;
      dom.clearTelegramSession.disabled = !dom.toggleTelegram?.checked;
    }
  }

  function renderAllowList(data) {
    if (!dom.allowList) return;
    dom.allowList.innerHTML = '';

    const hosts = data?.userHosts || [];

    if (hosts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'İzinli alan adı yok.';
      dom.allowList.appendChild(empty);
      return;
    }

    hosts.forEach((host) => {
      const pill = document.createElement('div');
      pill.className = 'pill';

      const text = document.createElement('span');
      text.textContent = host;

      pill.appendChild(text);

      const removeBtn = document.createElement('button');
      removeBtn.title = 'Kaldır';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async () => {
        removeBtn.disabled = true;
        await window.browserAPI.removeAllowHost?.(host);
        await loadAllowList();
      });
      pill.appendChild(removeBtn);

      dom.allowList.appendChild(pill);
    });
  }

  function normalizeHost(value) {
    if (!value) return '';
    const trimmed = value.trim().replace(/^https?:\/\//i, '').replace(/^\*\.?/g, '');
    return trimmed.split('/')[0].toLowerCase();
  }

  function renderPermissionList() {
    if (!dom.permissionList) return;
    dom.permissionList.innerHTML = '';
    const kinds = Object.keys(permissionStore || {});
    const rows = [];
    kinds.forEach((k) => {
      const allow = permissionStore[k]?.allow || [];
      const deny = permissionStore[k]?.deny || [];
      allow.forEach((host) => rows.push({ kind: k, host, action: 'allow' }));
      deny.forEach((host) => rows.push({ kind: k, host, action: 'deny' }));
    });
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Kayıtlı izin yok.';
      dom.permissionList.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement('div');
      item.className = 'cookie-row';
      const left = document.createElement('div');
      left.className = 'cookie-domain';
      left.textContent = `${row.host}`;
      const meta = document.createElement('div');
      meta.className = 'cookie-meta';
      meta.textContent = `${permissionLabel(row.kind)} • ${row.action === 'allow' ? 'İzin' : 'Engel'}`;
      const remove = document.createElement('button');
      remove.className = 'ghost-btn';
      remove.textContent = 'Sil';
      remove.addEventListener('click', () => {
        window.browserAPI.updatePermission?.({ kind: row.kind, host: row.host, action: 'forget' });
        permissionStore[row.kind].allow = (permissionStore[row.kind].allow || []).filter((h) => h !== row.host);
        permissionStore[row.kind].deny = (permissionStore[row.kind].deny || []).filter((h) => h !== row.host);
        renderPermissionList();
      });
      item.appendChild(left);
      item.appendChild(meta);
      item.appendChild(remove);
      dom.permissionList.appendChild(item);
    });
  }

  async function loadAllowList() {
    try {
      const data = await window.browserAPI.getAllowHosts?.();
      renderAllowList(data);
    } catch (_err) {
      if (dom.allowList) dom.allowList.innerHTML = '<div class="empty">Liste okunamadı.</div>';
    }
  }

  async function refreshActiveHosts() {
    try {
      const hosts = await window.browserAPI.getActiveHosts?.();
      if (dom.quickHosts) {
        const left = hosts?.left || '—';
        const right = hosts?.right || '—';
        dom.quickHosts.textContent = `Sol: ${left} | Sağ: ${right}`;
      }
      return hosts;
    } catch (_err) {
      if (dom.quickHosts) dom.quickHosts.textContent = 'Aktif alan adları alınamadı';
      return {};
    }
  }

  async function addAllowHost() {
    if (!dom.allowInput) return;
    const value = dom.allowInput.value.trim();
    if (!value) return;
    dom.addAllow && (dom.addAllow.disabled = true);
    try {
      const result = await window.browserAPI.addAllowHost?.(value);
      if (result?.error) {
        console.warn(result.error);
      }
      dom.allowInput.value = '';
      await loadAllowList();
    } catch (_err) {
      console.warn('Allow list update failed');
    } finally {
      dom.addAllow && (dom.addAllow.disabled = false);
    }
  }

  function addPermission(action) {
    const host = normalizeHost(dom.permissionHost?.value || '');
    const kind = dom.permissionKind?.value || 'camera';
    if (!host) return;
    window.browserAPI.updatePermission?.({ kind, host, action });
    if (!permissionStore[kind]) permissionStore[kind] = { allow: [], deny: [] };
    if (action === 'allow') {
      permissionStore[kind].allow = Array.from(new Set([...(permissionStore[kind].allow || []), host]));
      permissionStore[kind].deny = (permissionStore[kind].deny || []).filter((h) => h !== host);
    } else {
      permissionStore[kind].deny = Array.from(new Set([...(permissionStore[kind].deny || []), host]));
      permissionStore[kind].allow = (permissionStore[kind].allow || []).filter((h) => h !== host);
    }
    renderPermissionList();
  }

  window.browserAPI.onPermissionsUpdated?.((store) => {
    if (!store) return;
    permissionStore = mergePermissionStores(permissionStore, store);
    renderPermissionList();
  });

  async function addActiveHost(side) {
    const hosts = await refreshActiveHosts();
    const host = hosts?.[side];
    if (!host) return;
    dom.addAllow && (dom.addAllow.disabled = true);
    try {
      await window.browserAPI.addAllowHost?.(host);
      await loadAllowList();
    } finally {
      dom.addAllow && (dom.addAllow.disabled = false);
    }
  }

  function renderNotesList() {
    if (!dom.notesList) return;
    dom.notesList.innerHTML = '';
    if (!notes || notes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Not bulunamadı.';
      dom.notesList.appendChild(empty);
      return;
    }
    notes.forEach((n) => {
      const row = document.createElement('div');
      row.className = 'cookie-row';

      const left = document.createElement('div');
      left.className = 'cookie-domain';
      left.textContent = n.title || 'Not';

      const meta = document.createElement('div');
      meta.className = 'cookie-meta';
      meta.textContent = (n.body || '').slice(0, 80) + ((n.body || '').length > 80 ? '…' : '');

      row.appendChild(left);
      row.appendChild(meta);
      dom.notesList.appendChild(row);
    });
  }

  function loadNotesFromStorage() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      notes = raw ? JSON.parse(raw) : [];
    } catch (_err) {
      notes = [];
    }
    notes = notes.map((n) => ({
      ...n,
      title: n.title || (n.body ? n.body.split(/\r?\n/)[0]?.trim() || 'Not' : 'Not'),
      body: n.body || ''
    }));
    renderNotesList();
  }

  function saveNotesToStorage() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (_err) {
      /* ignore */
    }
    renderNotesList();
  }

  function exportNotes() {
    const blob = new Blob([JSON.stringify(notes || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `ogame-notes-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importNotesFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result || '[]');
        if (Array.isArray(parsed)) {
          notes = parsed.map((n) => ({
            id: n.id || `note-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            title: n.title || 'Not',
            body: n.body || ''
          }));
          saveNotesToStorage();
        }
      } catch (_err) {
        /* ignore invalid file */
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function renderDownloads(list = []) {
    if (!dom.downloadList) return;
    dom.downloadList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'İndirme yok.';
      dom.downloadList.appendChild(empty);
      return;
    }

    const stateLabel = (state) => {
      const map = {
        progress: 'İndiriliyor',
        progressing: 'İndiriliyor',
        paused: 'Duraklatıldı',
        interrupted: 'Duraklatıldı',
        completed: 'Tamamlandı',
        failed: 'Başarısız',
        cancelled: 'İptal edildi'
      };
      return map[state] || 'Bekliyor';
    };

    const isActive = (s) => ['progress', 'progressing', 'interrupted', 'paused'].includes(s);

    list.forEach((d) => {
      const row = document.createElement('div');
      row.className = 'cookie-row';
      const left = document.createElement('div');
      left.className = 'cookie-domain';
      left.textContent = d.filename || 'İndirme';
      const meta = document.createElement('div');
      meta.className = 'cookie-meta';
      const progress = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : d.state === 'completed' ? 100 : null;
      const size = formatBytes(d.totalBytes || d.receivedBytes || 0);
      const remainingBytes = d.totalBytes ? Math.max(0, d.totalBytes - d.receivedBytes) : 0;
      const remainingText = isActive(d.state) && d.totalBytes ? `${formatBytes(remainingBytes)} kaldı` : '';
      const speedText = d.speed ? `${formatBytes(Math.max(d.speed, 0))}/s` : '';
      meta.textContent = `${stateLabel(d.state)}${progress !== null ? ` • ${progress}%` : ''} • ${size}${remainingText ? ` • ${remainingText}` : ''}${speedText ? ` • ${speedText}` : ''}`;

      const progressWrap = document.createElement('div');
      progressWrap.className = 'progress';
      const inner = document.createElement('div');
      inner.className = 'progress-inner';
      inner.style.width = progress !== null ? `${Math.min(100, Math.max(0, progress))}%` : '0%';
      progressWrap.appendChild(inner);

      const actions = document.createElement('div');
      actions.className = 'actions wrap';
      const filePath = d.savePath || d.id || '';
      const hasFile = !!filePath;

      const btnPause = document.createElement('button');
      btnPause.className = 'ghost-btn';
      btnPause.textContent = d.state === 'paused' ? 'Devam' : 'Duraklat';
      btnPause.disabled = d.state === 'completed' || d.state === 'failed';
      btnPause.addEventListener('click', () => {
        const action = d.state === 'paused' ? 'resume' : 'pause';
        window.browserAPI.downloadAction?.({ id: d.id, action });
      });

      const btnCancel = document.createElement('button');
      btnCancel.className = 'ghost-btn';
      btnCancel.textContent = 'İptal';
      btnCancel.disabled = d.state === 'completed' || d.state === 'failed';
      btnCancel.addEventListener('click', () => {
        window.browserAPI.downloadAction?.({ id: d.id, action: 'cancel' });
      });

      const btnRemove = document.createElement('button');
      btnRemove.className = 'ghost-btn danger';
      btnRemove.textContent = 'Sil';
      btnRemove.addEventListener('click', () => {
        window.browserAPI.downloadAction?.({ id: filePath, action: 'remove-file' });
      });

      const btnOpen = document.createElement('button');
      btnOpen.className = 'ghost-btn';
      btnOpen.textContent = 'Aç';
      btnOpen.disabled = !hasFile;
      btnOpen.addEventListener('click', () => {
        window.browserAPI.openDownload?.(filePath);
      });

      const btnShow = document.createElement('button');
      btnShow.className = 'ghost-btn';
      btnShow.textContent = 'Klasörde aç';
      btnShow.disabled = !hasFile;
      btnShow.addEventListener('click', () => {
        window.browserAPI.openDownloadFolder?.(filePath);
      });

      if (isActive(d.state)) {
        actions.appendChild(btnPause);
        actions.appendChild(btnCancel);
      } else if (d.state === 'completed') {
        actions.appendChild(btnOpen);
        actions.appendChild(btnShow);
        actions.appendChild(btnRemove);
      } else {
        actions.appendChild(btnRemove);
      }

      const rightBox = document.createElement('div');
      rightBox.style.display = 'flex';
      rightBox.style.flexDirection = 'column';
      rightBox.style.gap = '6px';
      rightBox.appendChild(meta);
      rightBox.appendChild(progressWrap);
      rightBox.appendChild(actions);

      row.appendChild(left);
      row.appendChild(rightBox);
      dom.downloadList.appendChild(row);
    });
  }

  dom.toggleChatgpt?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    window.browserAPI.setAllowChatgptCookies?.(enabled);
  });

  dom.toggleThirdParty?.addEventListener('change', (e) => {
    window.browserAPI.setPrivacyOptions?.({
      blockThirdPartyCookies: e.target.checked,
      trackingProtection: dom.toggleTracking?.checked || false
    });
  });

  dom.toggleTracking?.addEventListener('change', (e) => {
    window.browserAPI.setPrivacyOptions?.({
      blockThirdPartyCookies: dom.toggleThirdParty?.checked || false,
      trackingProtection: e.target.checked
    });
  });

  dom.togglePersistentSession?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (enabled) {
      const msg = '⚠️ UYARI: Kalıcı oturum AÇILDI!\n\n' +
                  '• Çerezler ve veriler disk\'e yazılacak\n' +
                  '• Uygulama kapansa bile veriler kalacak\n' +
                  '• Mevcut oturumlar yeniden başlatılacak\n\n' +
                  'Devam etmek istiyor musunuz?';
      if (!confirm(msg)) {
        e.target.checked = false;
        return;
      }
    }
    window.browserAPI.setSessionOptions?.({ persistentSession: enabled });
    showSessionRestartInfo();
  });

  dom.toggleAllowAllCookies?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (!enabled) {
      const msg = '⚠️ Tüm siteler için çerez desteği KAPATILacak!\n\n' +
                  '• Sadece izin listesindeki siteler çerez kullanabilecek\n' +
                  '• Diğer siteler oturum açamayabilir\n' +
                  '• Mevcut çerezler silinmeyecek ama yenisi kabul edilmeyecek\n\n' +
                  'Devam etmek istiyor musunuz?';
      if (!confirm(msg)) {
        e.target.checked = true;
        return;
      }
    }
    window.browserAPI.setSessionOptions?.({ allowAllCookies: enabled });
    showSessionRestartInfo();
  });

  dom.toggleStorageEnabled?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (!enabled) {
      const msg = '⚠️ Web Storage (localStorage/indexedDB) KAPATILacak!\n\n' +
                  '• Siteler veri saklayamayacak\n' +
                  '• Bazı web uygulamaları çalışmayabilir\n' +
                  '• Açık sayfalar yeniden yüklenecek\n\n' +
                  'Devam etmek istiyor musunuz?';
      if (!confirm(msg)) {
        e.target.checked = true;
        return;
      }
    }
    window.browserAPI.setSessionOptions?.({ storageEnabled: enabled });
    if (!enabled) {
      alert('✅ Web Storage kapatıldı. Değişikliklerin etkili olması için açık sayfalar yeniden yüklenecek.');
    }
  });

  dom.toggleCacheEnabled?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (enabled) {
      const msg = '⚠️ HTTP Cache AÇILACAK!\n\n' +
                  '• Sayfa öğeleri disk\'e kaydedilecek\n' +
                  '• Sayfa yükleme hızlanacak ama gizlilik azalacak\n' +
                  '• Mevcut oturumlar yeniden başlatılacak\n\n' +
                  'Devam etmek istiyor musunuz?';
      if (!confirm(msg)) {
        e.target.checked = false;
        return;
      }
    }
    window.browserAPI.setSessionOptions?.({ cacheEnabled: enabled });
    showSessionRestartInfo();
  });
  
  function showSessionRestartInfo() {
    setTimeout(() => {
      alert('✅ Ayar güncellendi!\n\nMevcut oturumlar yeniden yapılandırıldı. Açık sekmeleri yenilemek gerekebilir.');
    }, 100);
  }

  dom.permissionAllow?.addEventListener('click', () => addPermission('allow'));
  dom.permissionDeny?.addEventListener('click', () => addPermission('deny'));

  dom.toggleTelegram?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    applyTelegramEnabledState(enabled);
    window.browserAPI.setAllowTelegramSession?.(enabled);
    if (enabled) {
      refreshTelegramInfo();
      refreshTelegramStorageData();
    }
  });

  dom.refreshTelegramInfo?.addEventListener('click', () => {
    refreshTelegramInfo();
  });

  dom.telegramStorageRefresh?.addEventListener('click', () => {
    refreshTelegramStorageData();
  });

  dom.clearTelegramSession?.addEventListener('click', clearTelegramSession);

  dom.telegramToggleWindow?.addEventListener('click', () => {
    window.browserAPI.toggleTelegramWindow?.();
  });

  dom.telegramHideWindow?.addEventListener('click', () => {
    window.browserAPI.hideTelegramWindow?.();
  });

  dom.close?.addEventListener('click', () => {
    window.close();
  });

  dom.aiResetSessions?.addEventListener('click', aiResetSessions);
  dom.aiClearCookies?.addEventListener('click', aiClearCookies);

  loadSettings();
  refreshCookieStats();
  loadAllowList();

  setAiStatus('Bu işlemler, AI servislerinde oturumdan çıkışa neden olabilir.');

  dom.refreshCookies?.addEventListener('click', refreshCookieStats);
  dom.addAllow?.addEventListener('click', addAllowHost);
  dom.allowInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAllowHost();
    }
  });
  dom.allowLeft?.addEventListener('click', () => addActiveHost('left'));
  dom.allowRight?.addEventListener('click', () => addActiveHost('right'));
  dom.clearAll?.addEventListener('click', clearAllCookies);
  dom.telegramToggleWindow?.addEventListener('click', () => {
    window.browserAPI.openTelegramPanel?.();
  });
  dom.telegramHideWindow?.addEventListener('click', () => {
    window.browserAPI.hideTelegram?.();
  });
  dom.refreshTelegramInfo?.addEventListener('click', refreshTelegramInfo);
  dom.clearTelegramSession?.addEventListener('click', clearTelegramSession);

  dom.notesExport?.addEventListener('click', exportNotes);
  dom.notesImport?.addEventListener('click', () => dom.notesFile?.click());
  dom.notesFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    importNotesFromFile(file);
    if (dom.notesFile) dom.notesFile.value = '';
  });

  window.browserAPI.onDownloadsUpdated?.(renderDownloads);

  // Bildirim ayarlarını yükle ve ekran listesini doldur
  async function loadNotificationSettings() {
    try {
      // Mevcut ayarları yükle
      const settings = await window.browserAPI?.getNotificationSettings?.();
      if (settings && dom.notificationPosition) {
        dom.notificationPosition.value = settings.position || 'bottom-right';
      }
      
      if (settings && dom.notificationTheme) {
        dom.notificationTheme.value = settings.theme || 'modern';
      }
      
      if (settings && dom.notificationAnimationType) {
        dom.notificationAnimationType.value = settings.animationType || 'slide';
      }
      
      if (settings && dom.notificationDuration) {
        dom.notificationDuration.value = settings.duration || 5000;
      }
      
      if (settings && dom.notificationMaxCount) {
        dom.notificationMaxCount.value = settings.maxNotifications || 5;
      }
      
      if (settings && dom.notificationSpacing) {
        dom.notificationSpacing.value = settings.spacing || 15;
      }
      
      if (settings && dom.notificationAnimationSpeed) {
        dom.notificationAnimationSpeed.value = settings.animationSpeed || 300;
      }
      
      if (settings && dom.notificationStackMode) {
        dom.notificationStackMode.value = settings.stackMode || 'vertical';
      }

      // Ekran listesini yükle
      const displays = await window.browserAPI?.getDisplays?.();
      if (displays && dom.notificationDisplay) {
        dom.notificationDisplay.innerHTML = '';
        displays.forEach((display, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = display.isPrimary ? 
            `${display.label} (Birincil)` : 
            display.label;
          dom.notificationDisplay.appendChild(option);
        });
        
        if (settings) {
          dom.notificationDisplay.value = settings.displayIndex || 0;
        }
      }
    } catch (err) {
      console.error('[Settings] Failed to load notification settings:', err);
    }
  }

  // Bildirim ayarlarını kaydet
  async function saveNotificationSettings() {
    try {
      const settings = {
        position: dom.notificationPosition?.value || 'bottom-right',
        displayIndex: parseInt(dom.notificationDisplay?.value || '0', 10),
        theme: dom.notificationTheme?.value || 'modern',
        animationType: dom.notificationAnimationType?.value || 'slide',
        duration: parseInt(dom.notificationDuration?.value || '5000', 10),
        maxNotifications: parseInt(dom.notificationMaxCount?.value || '5', 10),
        spacing: parseInt(dom.notificationSpacing?.value || '15', 10),
        animationSpeed: parseInt(dom.notificationAnimationSpeed?.value || '300', 10),
        stackMode: dom.notificationStackMode?.value || 'vertical'
      };
      
      await window.browserAPI?.setNotificationSettings?.(settings);
      console.log('[Settings] Notification settings saved:', settings);
    } catch (err) {
      console.error('[Settings] Failed to save notification settings:', err);
    }
  }

  // Ayarlar değiştiğinde otomatik kaydet
  dom.notificationPosition?.addEventListener('change', saveNotificationSettings);
  dom.notificationDisplay?.addEventListener('change', saveNotificationSettings);
  dom.notificationTheme?.addEventListener('change', saveNotificationSettings);
  dom.notificationAnimationType?.addEventListener('change', saveNotificationSettings);
  dom.notificationDuration?.addEventListener('change', saveNotificationSettings);
  dom.notificationMaxCount?.addEventListener('change', saveNotificationSettings);
  dom.notificationSpacing?.addEventListener('change', saveNotificationSettings);
  dom.notificationAnimationSpeed?.addEventListener('change', saveNotificationSettings);
  dom.notificationStackMode?.addEventListener('change', saveNotificationSettings);

  // Bildirim ayarlarını yükle
  loadNotificationSettings();

  // Notification test button handlers
  console.log('[Settings] Setting up notification test buttons...');
  console.log('[Settings] browserAPI available:', !!window.browserAPI);
  console.log('[Settings] showNotification available:', !!window.browserAPI?.showNotification);
  console.log('[Settings] Test buttons:', {
    simple: !!dom.testNotificationSimple,
    success: !!dom.testNotificationSuccess,
    error: !!dom.testNotificationError,
    info: !!dom.testNotificationInfo,
    multi: !!dom.testNotificationMulti
  });

  if (dom.testNotificationSimple) {
    dom.testNotificationSimple.addEventListener('click', async () => {
      try {
        await window.browserAPI.showNotification({
          title: '🚀 NEO BİLDİRİM SİSTEMİ',
          body: 'Sistem çevrimiçi. Tüm protokoller aktif.',
          iconEmoji: '🔔',
          duration: 5000
        });
        console.log('[Settings] Notification shown');
      } catch (err) {
        console.error('[Settings] Notification error:', err);
        alert('Bildirim gösterilirken hata: ' + err.message);
      }
    });
  }

  if (dom.testNotificationSuccess) {
    dom.testNotificationSuccess.addEventListener('click', async () => {
      try {
        await window.browserAPI.showNotification({
          title: '⚡ SENKRONIZASYON TAMAMLANDI',
          body: 'Veri matrisi güncellendi. Yeni parametreler aktif.',
          iconEmoji: '✨',
          duration: 4000
        });
      } catch (err) {
        console.error('[Settings] Notification error:', err);
      }
    });
  }

  if (dom.testNotificationError) {
    dom.testNotificationError.addEventListener('click', async () => {
      try {
        await window.browserAPI.showNotification({
          title: '⚠️ SİSTEM UYARISI',
          body: 'Bağlantı protokolünde anomali tespit edildi. Yeniden deneniyor...',
          iconEmoji: '🔴',
          duration: 6000,
          animationType: 'zoom'
        });
      } catch (err) {
        console.error('[Settings] Notification error:', err);
      }
    });
  }

  if (dom.testNotificationInfo) {
    dom.testNotificationInfo.addEventListener('click', async () => {
      try {
        await window.browserAPI.showNotification({
          title: '🤖 NEO ASİSTAN',
          body: 'Firmware v3.2.1 algılandı. Sistemleri yükseltmek için kuantum senkronizasyonu başlatın.',
          iconEmoji: '💠',
          duration: 7000,
          animationType: 'flip'
        });
      } catch (err) {
        console.error('[Settings] Notification error:', err);
      }
    });
  }

  if (dom.testNotificationMulti) {
    dom.testNotificationMulti.addEventListener('click', async () => {
      try {
        await window.browserAPI.showNotification({
          title: '📡 GELEN TRANSMISSION',
          body: '3 adet şifreli mesaj alındı. Kuantum anahtarı ile çözümlemek ister misiniz?',
          iconEmoji: '💬',
          count: 3,
          duration: 5000,
          animationType: 'fade'
        });
      } catch (err) {
        console.error('[Settings] Notification error:', err);
      }
    });
  }

  refreshActiveHosts();
  loadNotesFromStorage();
  window.browserAPI.getDownloads?.().then((list) => renderDownloads(list || []));

  // Navigation link handler
  if (dom.navLinks && dom.navLinks.length > 0) {
    dom.navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        const targetId = link.dataset.target;
        if (!targetId) return;
        
        // Remove active from all links
        dom.navLinks.forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
        
        // Toggle sections
        if (dom.sections && dom.sections.length > 0) {
          dom.sections.forEach((section) => {
            if (section.id === targetId) {
              section.classList.add('visible');
            } else {
              section.classList.remove('visible');
            }
          });
        }
      });
    });
  }
})();
