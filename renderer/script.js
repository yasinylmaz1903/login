(() => {
  const getHomeUrl = (side) => new URL(`home.html?side=${side}`, window.location.href).toString();
  const LEFT_HOME = getHomeUrl('left');
  const RIGHT_HOME = getHomeUrl('right');
  const TELEGRAM_URL = 'https://web.telegram.org/k/';

  // Modern Dialog System
  function showDialog(options) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('custom-dialog');
      const iconEl = document.getElementById('dialog-icon');
      const messageEl = document.getElementById('dialog-message');
      const buttonsEl = document.getElementById('dialog-buttons');

      // Set icon
      const icons = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '❌',
        question: '❓',
        success: '✅'
      };
      iconEl.textContent = icons[options.type || 'info'] || '💬';

      // Set message
      messageEl.textContent = options.message || '';

      // Create buttons
      buttonsEl.innerHTML = '';
      const buttons = options.buttons || [{ text: 'Tamam', value: true, primary: true }];
      
      buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        if (btn.primary) button.classList.add('primary');
        if (btn.danger) button.classList.add('danger');
        button.onclick = () => {
          overlay.style.display = 'none';
          resolve(btn.value);
        };
        buttonsEl.appendChild(button);
      });

      overlay.style.display = 'flex';
    });
  }

  // Helper functions - global olarak erişilebilir
  window.showDialog = showDialog;
  
  window.customAlert = (message) => showDialog({ 
    type: 'info', 
    message,
    buttons: [{ text: 'Tamam', value: true, primary: true }]
  });

  window.customConfirm = (message) => showDialog({ 
    type: 'question', 
    message,
    buttons: [
      { text: 'İptal', value: false },
      { text: 'Tamam', value: true, primary: true }
    ]
  });

  // Custom Context Menu System
  const contextMenu = document.getElementById('custom-context-menu');
  let currentContextMenuCallback = null;

  function showContextMenu(x, y, items) {
    contextMenu.innerHTML = '';
    
    items.forEach(item => {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        contextMenu.appendChild(sep);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.disabled) menuItem.classList.add('disabled');
        if (item.danger) menuItem.classList.add('danger');
        
        if (item.icon) {
          const icon = document.createElement('span');
          icon.className = 'context-menu-item-icon';
          icon.textContent = item.icon;
          menuItem.appendChild(icon);
        }
        
        const label = document.createElement('span');
        label.className = 'context-menu-item-label';
        label.textContent = item.label;
        menuItem.appendChild(label);
        
        if (item.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.className = 'context-menu-item-shortcut';
          shortcut.textContent = item.shortcut;
          menuItem.appendChild(shortcut);
        }
        
        if (!item.disabled) {
          menuItem.onclick = () => {
            hideContextMenu();
            if (item.click) item.click();
          };
        }
        
        contextMenu.appendChild(menuItem);
      }
    });
    
    // Position menu
    const menuRect = contextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 10;
    const maxY = window.innerHeight - menuRect.height - 10;
    
    contextMenu.style.left = Math.min(x, maxX) + 'px';
    contextMenu.style.top = Math.min(y, maxY) + 'px';
    contextMenu.style.display = 'block';
  }

  function hideContextMenu() {
    contextMenu.style.display = 'none';
  }

  // Hide menu on click outside
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Hide menu on scroll
  document.addEventListener('scroll', hideContextMenu);

  window.showContextMenu = showContextMenu;
  window.hideContextMenu = hideContextMenu;

  // Listen for context menu requests from main process
  if (window.browserAPI?.onShowContextMenu) {
    window.browserAPI.onShowContextMenu((data) => {
      showContextMenu(data.x, data.y, data.items);
    });
  }

  const HOME_BY_SIDE = {
    left: LEFT_HOME,
    right: RIGHT_HOME
  };

  const dom = {
    leftUrl: document.getElementById('left-url'),
    rightUrl: document.getElementById('right-url'),
    leftZoom: document.getElementById('left-zoom'),
    rightZoom: document.getElementById('right-zoom'),
    leftZoomValue: document.getElementById('left-zoom-value'),
    rightZoomValue: document.getElementById('right-zoom-value'),
    leftBack: document.getElementById('left-back'),
    rightBack: document.getElementById('right-back'),
    leftForward: document.getElementById('left-forward'),
    rightForward: document.getElementById('right-forward'),
    leftReload: document.getElementById('left-reload'),
    rightReload: document.getElementById('right-reload'),
    splitter: document.getElementById('splitter'),
    navLeftHome: document.getElementById('nav-left-home'),
    navRightHome: document.getElementById('nav-right-home'),
    navReloadBoth: document.getElementById('nav-reload-both'),
    navSettings: document.getElementById('nav-settings'),
    navDownloads: document.getElementById('nav-downloads'),
    navTelegram: document.getElementById('nav-telegram'),
    navAi: document.getElementById('nav-ai'),
    navNotes: document.getElementById('nav-notes'),
    navEmail: document.getElementById('nav-email'),
    navStatus: document.getElementById('nav-status'),
    navClipboard: document.getElementById('nav-clipboard'),
    navTranslator: document.getElementById('nav-translator'),
    navCalendar: document.getElementById('nav-calendar'),
    panelControlsToggle: document.getElementById('panel-controls-toggle'),
    splitRange: document.getElementById('split-range'),
    btnLeftOnly: document.getElementById('btn-left-only'),
    btnRightOnly: document.getElementById('btn-right-only'),
    btnRestoreSplit: document.getElementById('btn-restore-split'),
    leftTabs: document.getElementById('left-tabs'),
    rightTabs: document.getElementById('right-tabs'),
    leftTabAdd: document.getElementById('left-tab-add'),
    rightTabAdd: document.getElementById('right-tab-add'),
    leftTabOverflow: document.getElementById('left-tab-overflow'),
    rightTabOverflow: document.getElementById('right-tab-overflow'),
    leftCookieBtn: document.getElementById('left-cookie'),
    rightCookieBtn: document.getElementById('right-cookie'),
    leftSSL: document.getElementById('left-ssl'),
    rightSSL: document.getElementById('right-ssl'),
    exitModal: document.getElementById('exit-modal'),
    toggleSidebar: document.getElementById('toggle-sidebar')
  };

  let split = 0.5;
  const tabs = {
    left: [],
    right: []
  };
  let draggingTab = null;
  const active = {
    left: null,
    right: null
  };
  const loading = {
    left: new Set(),
    right: new Set()
  };
  
  // Main process'ten erişebilmek için window'a ekle (değişkenler ve fonksiyonlar)
  window.tabs = tabs;
  window.active = active;
  
  const allowHosts = new Set();
  const currentHost = { left: null, right: null };
  let sidebarHidden = false;
  let uiZoom = 1;
  const viewZoom = { left: 1, right: 1 };
  let telegramCount = 0;
  let notes = [];
  let activeNoteId = null;

  const clamp = (val) => Math.min(1, Math.max(0, val));

  const getFaviconUrl = (url) => {
    try {
      // Ana sayfa için özel favicon
      if (url && (url.includes('/home.html') || url.includes('home.html?side='))) {
        return '../resources/icons/ogame.png';
      }
      const u = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
    } catch (_err) {
      return '../resources/icons/glogo.png';
    }
  };

  const setSSLState = (side, url) => {
    const el = side === 'left' ? dom.leftSSL : dom.rightSSL;
    if (!el) return;
    let cls = 'mixed';
    let label = '?';
    if (url?.startsWith('https://')) {
      cls = 'secure';
      label = '🔒';
    } else if (url?.startsWith('http://')) {
      cls = 'insecure';
      label = '!';
    } else if (url?.startsWith('file://')) {
      cls = 'secure';
      label = '📄';
    }
    el.className = `ssl ${cls}`;
    el.textContent = label;
    el.title = cls === 'secure' ? 'Güvenli bağlantı (HTTPS)' : cls === 'insecure' ? 'Güvenli değil (HTTP)' : 'Karışık / bilinmiyor';
  };

  const clampViewZoom = (f) => {
    const n = Number(f);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(0.25, n));
  };

  const toPercent = (f) => `${Math.round(clampViewZoom(f) * 100)}%`;

  const setZoomDisplay = (side, zoomFactor) => {
    viewZoom[side] = clampViewZoom(zoomFactor);
    const el = side === 'left' ? dom.leftZoomValue : dom.rightZoomValue;
    if (el) el.textContent = toPercent(viewZoom[side]);
  };

  // Zoom menüsü (site-info gibi ayrı pencere). BrowserView üstünde kalması için
  // renderer içine HTML popover basmıyoruz.
  const openZoomMenuWindow = (side) => {
    const anchor = side === 'right' ? dom.rightZoom : dom.leftZoom;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    window.browserAPI.toggleZoomMenu?.({
      side,
      rect: { left: r.left, bottom: r.bottom }
    });
  };

  function createTab(side, url) {
    const id = `${side}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const tab = { id, url, muted: false, pinned: false, favicon: getFaviconUrl(url) };
    tabs[side].push(tab);
    sortTabs(side);
    window.browserAPI.createTab(side, id, url);
    setActiveTab(side, id);
    renderTabs(side);
  }

  // -------- Notes (sidebar) --------
  const NOTES_KEY = 'ghost-notes';

  function loadNotes() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      notes = raw ? JSON.parse(raw) : [];
    } catch (_err) {
      notes = [];
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (_err) {
      /* ignore */
    }
  }

  function noteTitleFromBody(body) {
    if (!body) return 'Not';
    const line = body.split(/\r?\n/)[0].trim();
    return line || 'Not';
  }

  function renderNotes() {
    const listEl = dom.noteList;
    if (!listEl) return;
    listEl.innerHTML = '';
    notes.forEach((n) => {
      const item = document.createElement('div');
      item.className = 'note-item' + (n.id === activeNoteId ? ' active' : '');
      item.textContent = n.title || 'Not';
      item.dataset.id = n.id;
      item.addEventListener('click', async () => {
        activeNoteId = n.id;
        if (dom.noteText) dom.noteText.value = n.body || '';
        renderNotes();
        try {
          await navigator.clipboard.writeText(n.body || '');
          setNoteStatus('Panoya kopyalandı');
        } catch (_err) {
          setNoteStatus('Kopyalanamadı');
        }
      });
      listEl.appendChild(item);
    });
  }

  function setNoteStatus(text) {
    if (dom.noteStatus) {
      dom.noteStatus.textContent = text || '';
      if (text) {
        setTimeout(() => {
          if (dom.noteStatus?.textContent === text) dom.noteStatus.textContent = '';
        }, 2000);
      }
    }
  }

  function addNote() {
    const id = `note-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const body = dom.noteText?.value?.trim() || '';
    const title = noteTitleFromBody(body || 'Yeni Not');
    notes.unshift({ id, title, body });
    activeNoteId = id;
    saveNotes();
    renderNotes();
    setNoteStatus('Eklendi');
  }

  function saveActiveNote() {
    if (!activeNoteId) {
      addNote();
      return;
    }
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;
    note.body = dom.noteText?.value || '';
    note.title = noteTitleFromBody(note.body);
    saveNotes();
    renderNotes();
    setNoteStatus('Kaydedildi');
  }

  function deleteActiveNote() {
    if (!activeNoteId) return;
    notes = notes.filter((n) => n.id !== activeNoteId);
    activeNoteId = notes[0]?.id || null;
    if (dom.noteText) dom.noteText.value = activeNoteId ? (notes.find((n) => n.id === activeNoteId)?.body || '') : '';
    saveNotes();
    renderNotes();
    setNoteStatus('Silindi');
  }

  function closeTab(side, id) {
    window.browserAPI.closeTab(side, id);
    const list = tabs[side];
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const removedActive = active[side] === id;
    list.splice(idx, 1);

    if (list.length === 0) {
      active[side] = null;
      const home = HOME_BY_SIDE[side];
      if (home) {
        createTab(side, home);
      }
      renderTabs(side);
      return;
    }

    if (removedActive) {
      const fallback = list[idx] || list[idx - 1] || list[0] || null;
      active[side] = fallback ? fallback.id : null;
      if (fallback) {
        setActiveTab(side, fallback.id);
      }
    }

    renderTabs(side);
  }

  function reorderTab(side, draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const list = tabs[side];
    const from = list.findIndex((t) => t.id === draggedId);
    const to = list.findIndex((t) => t.id === targetId);
    if (from === -1 || to === -1) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    renderTabs(side);
  }

  function toDisplayLabel(url, side) {
    if (!url) return 'Yeni Sekme';
    const home = HOME_BY_SIDE[side];
    if (home && url.startsWith(home)) return 'Home';
    return url.replace(/^https?:\/\//, '').replace(/^file:\/\//, '').slice(0, 200) || 'Yeni Sekme';
  }

  function getTabLabel(tab, side) {
    if (!tab) return 'Yeni Sekme';
    if (tab.title && tab.title.trim()) return tab.title.trim();
    return toDisplayLabel(tab.url, side);
  }

  async function setActiveTab(side, id, load = true) {
    active[side] = id;
    renderTabs(side);
    const tab = tabs[side].find((t) => t.id === id);
    if (tab) {
      const input = side === 'left' ? dom.leftUrl : dom.rightUrl;
      const display = toDisplayLabel(tab.url, side);
      input.value = display;
      input.dataset.actualUrl = tab.url || '';
        setSSLState(side, tab.url);
      window.browserAPI.activateTab(side, id);
      await refreshCookieButton(side, tab.url);
    }
  }

  function updateTabUrl(side, tabId, url) {
    if (!tabId) return;
    const tab = tabs[side].find((t) => t.id === tabId);
    if (tab) {
      tab.url = url;
      tab.favicon = getFaviconUrl(url);
    }
    if (active[side] === tabId && url) {
      const input = side === 'left' ? dom.leftUrl : dom.rightUrl;
      if (input) {
        input.value = toDisplayLabel(url, side);
        input.dataset.actualUrl = url;
      }
      setSSLState(side, url);
      refreshCookieButton(side, url);
    }
    renderTabs(side, url);
  }

  function updateTabTitle(side, tabId, title) {
    if (!tabId) return;
    const tab = tabs[side].find((t) => t.id === tabId);
    if (tab) {
      tab.title = title;
      renderTabs(side);
    }
  }

  function sortTabs(side) {
    const list = tabs[side];
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }

  function getHostFromUrl(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (_err) {
      return null;
    }
  }

  async function syncAllowHosts() {
    try {
      const data = await window.browserAPI.getAllowHosts?.();
      allowHosts.clear();
      (data?.hosts || []).forEach((h) => allowHosts.add(h));
    } catch (_err) {
      /* ignore */
    }
  }

  async function refreshCookieButton(side, url) {
    const btn = side === 'left' ? dom.leftCookieBtn : dom.rightCookieBtn;
    if (!btn) return;
    const host = getHostFromUrl(url || (side === 'left' ? dom.leftUrl?.dataset.actualUrl : dom.rightUrl?.dataset.actualUrl));
    currentHost[side] = host;
    if (!host) {
      btn.textContent = 'Çerezler';
      btn.disabled = true;
      btn.classList.remove('has-cookies');
      return;
    }
    
    // Bu site için cookie sayısını kontrol et
    try {
      const cookies = await window.browserAPI.getCookiesForHost?.(host);
      const count = cookies?.length || 0;
      btn.disabled = false;
      
      if (count > 0) {
        btn.textContent = `🍪 ${count} çerez`;
        btn.classList.add('has-cookies');
        btn.title = `${host} için ${count} çerez var. Tıkla sil.`;
      } else {
        btn.textContent = 'Çerez yok';
        btn.classList.remove('has-cookies');
        btn.title = `${host} için çerez yok`;
        btn.disabled = true;
      }
    } catch (err) {
      btn.textContent = 'Çerezler';
      btn.disabled = false;
      btn.classList.remove('has-cookies');
    }
  }

  async function handleCookieButton(side) {
    const btn = side === 'left' ? dom.leftCookieBtn : dom.rightCookieBtn;
    const host = currentHost[side];
    if (!btn || !host) return;
    
    // Şu an cookie varsa sil, yoksa bir şey yapma
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Siliniyor...';
    try {
      await window.browserAPI.clearCookiesForHost?.(host);
      btn.textContent = '✓ Silindi';
      setTimeout(() => {
        refreshCookieButton(side, host);
      }, 1500);
    } catch (err) {
      console.error('Cookie silme hatası:', err);
      btn.textContent = '✗ Hata';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    }
  }

  function toggleMute(side, tabId) {
    const tab = tabs[side].find((t) => t.id === tabId);
    if (!tab) return;
    tab.muted = !tab.muted;
    window.browserAPI.muteTab(side, tabId, tab.muted);
    renderTabs(side);
  }

  function togglePin(side, tabId) {
    const tab = tabs[side].find((t) => t.id === tabId);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    sortTabs(side);
    renderTabs(side);
  }

  function renderTabs(side) {
    const container = side === 'left' ? dom.leftTabs : dom.rightTabs;
    const bar = container?.parentElement;
    if (!container || !bar) return;
    bar.style.position = 'relative';
    container.innerHTML = '';

    const list = tabs[side];
    const currentActive = active[side];
    
    // Sabitlenmiş ve normal sekmeleri ayır (Chrome gibi)
    const pinnedTabs = list.filter(t => t.pinned);
    const normalTabs = list.filter(t => !t.pinned);

    // Sadece ilk 5 sekmeyi göster - önce sabitlenmiş, sonra normal
    const maxVisible = 5;
    const visiblePinned = pinnedTabs.slice(0, maxVisible);
    const remainingSlots = Math.max(0, maxVisible - visiblePinned.length);
    const visibleNormal = normalTabs.slice(0, remainingSlots);
    const visibleTabs = [...visiblePinned, ...visibleNormal];

    visibleTabs.forEach((tab) => {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === currentActive ? ' active' : '') + (tab.pinned ? ' tab-pinned' : '');
      el.draggable = true;
      el.dataset.tabId = tab.id;

      // Sekme kartına tıklama - sabit sekmeler için özellikle önemli
      el.addEventListener('click', (e) => {
        // Kapatma veya diğer butonlara tıklanmadıysa sekmeyi aktif et
        if (!e.target.closest('.tab-close') && !e.target.closest('.tab-mute')) {
          setActiveTab(side, tab.id);
        }
      });

      const isLoading = loading[side].has(tab.id);

      const icon = document.createElement('img');
      icon.className = 'tab-icon';
      if (isLoading) {
        icon.style.display = 'none';
      } else if (tab.favicon) {
        icon.src = tab.favicon;
        icon.referrerPolicy = 'no-referrer';
        icon.onerror = () => {
          icon.style.display = 'none';
        };
      } else {
        icon.style.display = 'none';
      }

      // Loading spinner
      const spinner = document.createElement('div');
      spinner.className = 'tab-spinner';
      spinner.style.display = isLoading ? 'block' : 'none';
      spinner.innerHTML = '<div class="spinner-ring"></div>';

      const button = document.createElement('button');
      button.className = 'tab-hit';
      const label = getTabLabel(tab, side).slice(0, 32);
      // Sabitlenmiş sekmelerde başlık gösterme (Chrome gibi)
      button.textContent = tab.pinned ? '' : label;
      if (tab.pinned) {
        button.style.display = 'none';
      }
      button.title = tab.url || 'Yeni Sekme';
      button.addEventListener('click', () => setActiveTab(side, tab.id));
      button.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(side, tab.id);
        }
      });

      const mute = document.createElement('button');
      mute.className = 'tab-mute';
      mute.title = tab.muted ? 'Sesi aç' : 'Sessize al';
      mute.textContent = tab.muted ? '🔇' : '🔊';
      mute.disabled = true;
      mute.style.pointerEvents = 'none';

      const pinIcon = document.createElement('span');
      pinIcon.className = 'tab-pin';
      pinIcon.textContent = '';
      if (tab.pinned) {
        pinIcon.style.display = 'none';
      }

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.title = 'Close tab';
      close.textContent = 'x';
      // Sabitlenmiş sekmelerde kapatma butonu gösterme (Chrome gibi)
      if (tab.pinned) {
        close.style.display = 'none';
      }
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(side, tab.id);
      });

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.browserAPI.openTabContextMenu?.({
          side,
          tabId: tab.id,
          muted: !!tab.muted,
          pinned: !!tab.pinned,
          x: e.clientX,
          y: e.clientY
        });
      });

      // Allow middle-click anywhere on the tab to close (not just the label button).
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(side, tab.id);
        }
      });

      el.addEventListener('dragstart', (e) => {
        draggingTab = tab.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
        e.dataTransfer.setData('pinned', tab.pinned ? '1' : '0');
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceId = draggingTab || e.dataTransfer.getData('text/plain');
        const sourcePinned = e.dataTransfer.getData('pinned') === '1';
        const sourceTab = tabs[side].find(t => t.id === sourceId);
        
        // Chrome gibi: sabitlenmiş sekme sadece sabitlenmiş bölgeye, normal sadece normal bölgeye sürüklenebilir
        if (sourceTab && sourceTab.pinned === tab.pinned) {
          reorderTab(side, sourceId, tab.id);
        }
        draggingTab = null;
      });

      el.addEventListener('dragend', () => {
        draggingTab = null;
      });

      el.appendChild(spinner);
      el.appendChild(icon);
      el.appendChild(button);
      el.appendChild(pinIcon);
      el.appendChild(mute);
      el.appendChild(close);
      container.appendChild(el);
    });

    // Overflow kontrolü
    checkTabOverflow(side);
  }

  function checkTabOverflow(side) {
    const overflowBtn = side === 'left' ? dom.leftTabOverflow : dom.rightTabOverflow;
    if (!overflowBtn) return;

    // Toplam sekme sayısına göre overflow kontrolü (container'daki değil, tabs dizisindeki)
    const totalTabCount = tabs[side]?.length || 0;

    // 5'ten fazla sekme varsa overflow butonunu göster
    if (totalTabCount > 5) {
      overflowBtn.style.display = 'block';
    } else {
      overflowBtn.style.display = 'none';
    }
  }

  // Overflow buton click handler'ları
  dom.leftTabOverflow?.addEventListener('click', (e) => {
    const rect = dom.leftTabOverflow.getBoundingClientRect();
    window.browserAPI?.toggleTabOverflow?.({
      side: 'left',
      rect: { left: rect.left, bottom: rect.bottom }
    });
  });

  dom.rightTabOverflow?.addEventListener('click', (e) => {
    const rect = dom.rightTabOverflow.getBoundingClientRect();
    window.browserAPI?.toggleTabOverflow?.({
      side: 'right',
      rect: { left: rect.left, bottom: rect.bottom }
    });
  });

  // Overflow menüsü için postMessage listener'ı
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'request-overflow-tabs') {
      const side = event.data.side;
      const allTabs = tabs[side] || [];
      const activeTabId = active[side];
      
      // Sadece 6. sekmeden sonraki sekmeleri overflow menüsüne gönder
      const overflowTabs = allTabs.slice(5);
      
      // Overflow menüsüne tab listesini gönder
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({
          type: 'overflow-tabs',
          side,
          tabs: overflowTabs,
          activeTabId
        }, '*');
      }
    } else if (event.data?.type === 'activate-tab') {
      setActiveTab(event.data.side, event.data.tabId);
    } else if (event.data?.type === 'close-tab') {
      closeTab(event.data.side, event.data.tabId);
    }
  });

  window.browserAPI.onTabMenuCommand?.((payload) => {
    const { side, tabId, command } = payload || {};
    if (!side || !tabId || !command) return;
    if (command === 'close') return closeTab(side, tabId);
    if (command === 'mute') return toggleMute(side, tabId);
    if (command === 'pin') return togglePin(side, tabId);
  });

  function applySplitVisual(ratio) {
    split = clamp(ratio);
    document.documentElement.style.setProperty('--split', split);
    if (dom.splitRange) dom.splitRange.value = Math.round(split * 100);
    if (split <= 0.01) {
      document.body.classList.add('hide-left');
      document.body.classList.remove('hide-right');
    } else if (split >= 0.99) {
      document.body.classList.add('hide-right');
      document.body.classList.remove('hide-left');
    } else {
      document.body.classList.remove('hide-left');
      document.body.classList.remove('hide-right');
    }
  }

  function updateSplit(ratio) {
    applySplitVisual(ratio);
    window.browserAPI.setSplit(split);
  }

  function applySplitFromIPC(ratio) {
    applySplitVisual(ratio);
  }

  function setSidebarHidden(hidden) {
    sidebarHidden = true;
    const sidebar = document.querySelector('.sidebar');
    document.body.classList.add('sidebar-collapsed');
    sidebar?.classList.add('collapsed');
    window.browserAPI.setSidebarWidth?.(52);
  }

  function bindToolbar(side, elements, homeUrl) {
    const { backBtn, forwardBtn, reloadBtn, input } = elements;

    const toSearchUrl = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    const isProbablyUrl = (text) => {
      if (!text) return false;
      if (/^https?:\/\//i.test(text)) return true;
      if (/^file:\/\//i.test(text)) return true;
      if (text.includes(' ')) return false;
      return /\./.test(text);
    };

    const loadUrl = () => {
      const value = input.value.trim();
      if (!value) return;
      const list = tabs[side];
      if (!list || list.length === 0) {
        const target = isProbablyUrl(value) ? value : toSearchUrl(value);
        createTab(side, target);
        return;
      }
      const actual = input.dataset.actualUrl;
      const home = HOME_BY_SIDE[side];
      let target = value;
      const homeLabel = toDisplayLabel(home, side);
      if (home && (value === homeLabel)) target = home;
      if (!value && actual) target = actual;
      if (!/^https?:\/\//i.test(target) && !/^file:\/\//i.test(target)) {
        target = isProbablyUrl(target) ? target : toSearchUrl(target);
      }
      window.browserAPI.load(side, target);
      input.dataset.actualUrl = target;
    };

    backBtn.addEventListener('click', () => window.browserAPI.back(side));
    forwardBtn.addEventListener('click', () => window.browserAPI.forward(side));
    reloadBtn.addEventListener('click', () => window.browserAPI.reload(side));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadUrl();
    });
    input.value = toDisplayLabel(homeUrl, side);
    input.dataset.actualUrl = homeUrl;
  }

  bindToolbar('left', {
    backBtn: dom.leftBack,
    forwardBtn: dom.leftForward,
    reloadBtn: dom.leftReload,
    input: dom.leftUrl
  }, LEFT_HOME);

  bindToolbar('right', {
    backBtn: dom.rightBack,
    forwardBtn: dom.rightForward,
    reloadBtn: dom.rightReload,
    input: dom.rightUrl
  }, RIGHT_HOME);

  // -------- Site Info (Chrome-like) --------
  const SITE_PERMS = [
    { kind: 'notifications', label: 'Bildirimler' },
    { kind: 'geolocation', label: 'Konum' },
    { kind: 'camera', label: 'Kamera' },
    { kind: 'microphone', label: 'Mikrofon' }
  ];

  let siteInfoEl = null;
  let siteInfoOpen = false;
  let siteInfoSide = null;

  const formatBytes = (bytes) => {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  function ensureSiteInfo() {
    if (siteInfoEl) return siteInfoEl;
    const el = document.createElement('div');
    el.id = 'site-info-popover';
    el.className = 'site-info-popover';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="site-info-header">
        <div class="site-info-host" id="site-info-host">Site</div>
        <button class="site-info-close" id="site-info-close" aria-label="Kapat">✕</button>
      </div>
      <button class="site-info-row" id="site-info-conn" type="button">
        <span class="site-info-icon" id="site-info-conn-icon">🔒</span>
        <span class="site-info-row-text">
          <span class="site-info-row-title" id="site-info-conn-title">Bağlantı</span>
          <span class="site-info-row-sub" id="site-info-conn-sub"></span>
        </span>
      </button>
      <button class="site-info-row" id="site-info-cookies" type="button">
        <span class="site-info-icon">🍪</span>
        <span class="site-info-row-text">
          <span class="site-info-row-title">Çerezler ve site verileri</span>
          <span class="site-info-row-sub" id="site-info-cookies-sub"></span>
        </span>
      </button>
      <div class="site-info-section">İzinler</div>
      <div class="site-info-perms" id="site-info-perms"></div>
      <div class="site-info-footer">
        <button class="site-info-link" id="site-info-settings" type="button">Site ayarları</button>
      </div>
    `;
    document.body.appendChild(el);
    siteInfoEl = el;

    el.querySelector('#site-info-close')?.addEventListener('click', hideSiteInfo);
    el.querySelector('#site-info-settings')?.addEventListener('click', () => {
      window.browserAPI.openSettings?.('permissions');
      hideSiteInfo();
    });

    // Click outside closes
    document.addEventListener('mousedown', (e) => {
      if (!siteInfoOpen) return;
      if (!siteInfoEl) return;
      const anchor = siteInfoSide === 'right' ? dom.rightSSL : dom.leftSSL;
      if (siteInfoEl.contains(e.target)) return;
      if (anchor && anchor.contains(e.target)) return;
      hideSiteInfo();
    });

    return el;
  }

  function hideSiteInfo() {
    if (!siteInfoEl) return;
    siteInfoEl.style.display = 'none';
    siteInfoOpen = false;
    siteInfoSide = null;
  }

  function positionSiteInfo(side) {
    if (!siteInfoEl) return;
    const anchor = side === 'right' ? dom.rightSSL : dom.leftSSL;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 10;
    const width = 340;
    const height = siteInfoEl.getBoundingClientRect().height || 260;
    let left = rect.left;
    let top = rect.bottom + gap;
    const maxLeft = window.innerWidth - width - 10;
    const maxTop = window.innerHeight - height - 10;
    left = Math.max(10, Math.min(left, maxLeft));
    top = Math.max(10, Math.min(top, maxTop));
    siteInfoEl.style.left = `${left}px`;
    siteInfoEl.style.top = `${top}px`;
    siteInfoEl.style.width = `${width}px`;
  }

  function permLabel(value) {
    if (value === 'allow') return 'İzin ver';
    if (value === 'deny') return 'Engelle';
    return 'Sor';
  }

  async function renderSiteInfo(side) {
    const el = ensureSiteInfo();
    const url = side === 'right' ? dom.rightUrl?.dataset.actualUrl : dom.leftUrl?.dataset.actualUrl;
    let info = null;
    try {
      info = await window.browserAPI.getSiteInfo?.(side);
    } catch (_err) {
      info = null;
    }

    const host = info?.host || getHostFromUrl(url) || 'Bu sayfa';
    el.querySelector('#site-info-host').textContent = host;

    const connIcon = el.querySelector('#site-info-conn-icon');
    const connTitle = el.querySelector('#site-info-conn-title');
    const connSub = el.querySelector('#site-info-conn-sub');

    const protocol = info?.protocol || '';
    const isHttps = !!info?.isSecure;
    if (protocol === 'file:') {
      connIcon.textContent = '📄';
      connTitle.textContent = 'Yerel dosya';
      connSub.textContent = '';
    } else if (isHttps) {
      connIcon.textContent = '🔒';
      connTitle.textContent = 'Bağlantı güvenli';
      const issuer = info?.certificate?.issuerName || '';
      connSub.textContent = issuer ? `Sertifika: ${issuer}` : '';
    } else {
      connIcon.textContent = '!';
      connTitle.textContent = 'Güvenli değil';
      connSub.textContent = protocol ? `Protokol: ${protocol.replace(':', '')}` : '';
    }

    // Cookies row
    const cookiesSub = el.querySelector('#site-info-cookies-sub');
    const cookieCount = Number(info?.cookies?.count) || 0;
    const cookieBytes = Number(info?.cookies?.bytes) || 0;
    const cookiesBtn = el.querySelector('#site-info-cookies');
    if (!info?.host) {
      cookiesSub.textContent = 'Bu sayfa için geçerli değil';
      cookiesBtn.disabled = true;
    } else {
      cookiesSub.textContent = `${cookieCount} çerez • ${formatBytes(cookieBytes)}`;
      cookiesBtn.disabled = cookieCount <= 0;
    }

    cookiesBtn.onclick = async () => {
      if (!info?.host) return;
      const ok = await window.customConfirm?.(`${info.host} için tüm çerezler silinsin mi?`);
      if (!ok) return;
      await window.browserAPI.clearCookiesForHost?.(info.host);
      await refreshCookieButton(side, url);
      await renderSiteInfo(side);
    };

    // Permissions
    const permsEl = el.querySelector('#site-info-perms');
    permsEl.innerHTML = '';
    const cleanHost = info?.host || '';
    SITE_PERMS.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'site-info-perm-row';
      const label = document.createElement('div');
      label.className = 'site-info-perm-label';
      label.textContent = p.label;
      const select = document.createElement('select');
      select.className = 'site-info-perm-select';
      select.disabled = !cleanHost;
      const current = info?.permissions?.[p.kind] || 'ask';
      const options = [
        { v: 'ask', t: 'Sor' },
        { v: 'allow', t: 'İzin ver' },
        { v: 'deny', t: 'Engelle' }
      ];
      options.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.v;
        opt.textContent = o.t;
        if (o.v === current) opt.selected = true;
        select.appendChild(opt);
      });
      select.title = permLabel(current);
      select.addEventListener('change', () => {
        if (!cleanHost) return;
        const v = select.value;
        const action = v === 'allow' ? 'allow' : v === 'deny' ? 'deny' : 'forget';
        window.browserAPI.updatePermission?.({ kind: p.kind, host: cleanHost, action });
      });
      row.appendChild(label);
      row.appendChild(select);
      permsEl.appendChild(row);
    });
  }

  async function toggleSiteInfo(side) {
    ensureSiteInfo();
    if (siteInfoOpen && siteInfoSide === side) {
      hideSiteInfo();
      return;
    }
    siteInfoOpen = true;
    siteInfoSide = side;
    siteInfoEl.style.display = 'block';
    positionSiteInfo(side);
    await renderSiteInfo(side);
    positionSiteInfo(side);
  }

  const openSiteInfoWindow = (side) => {
    const anchor = side === 'right' ? dom.rightSSL : dom.leftSSL;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    window.browserAPI.toggleSiteInfo?.({
      side,
      rect: { left: r.left, bottom: r.bottom }
    });
  };

  dom.leftSSL?.addEventListener('click', () => openSiteInfoWindow('left'));
  dom.rightSSL?.addEventListener('click', () => openSiteInfoWindow('right'));
  window.addEventListener('resize', () => {
    if (siteInfoOpen && siteInfoSide) positionSiteInfo(siteInfoSide);
  });

  // Sidebar quick actions
  dom.navLeftHome?.addEventListener('click', () => window.browserAPI.load('left', LEFT_HOME));
  dom.navRightHome?.addEventListener('click', () => window.browserAPI.load('right', RIGHT_HOME));
  dom.navReloadBoth?.addEventListener('click', () => {
    window.browserAPI.reload('left');
    window.browserAPI.reload('right');
  });

  dom.navSettings?.addEventListener('click', () => {
    window.browserAPI.openSettings?.();
  });

  dom.navDownloads?.addEventListener('click', () => {
    window.browserAPI.openSettings?.('downloads');
  });

  dom.navTelegram?.addEventListener('click', () => {
    window.browserAPI.openTelegramPanel?.();
  });

  dom.navAi?.addEventListener('click', () => {
    window.browserAPI.openAiPanel?.();
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      window.browserAPI.openTelegramPanel?.();
    }
  });

  dom.navNotes?.addEventListener('click', () => {
    window.browserAPI.toggleNotesWindow?.();
  });

  dom.navEmail?.addEventListener('click', () => {
    window.browserAPI.openEmailPanel?.();
  });

  dom.navStatus?.addEventListener('click', () => {
    window.browserAPI.openStatusPanel?.();
  });

  dom.navClipboard?.addEventListener('click', () => {
    window.browserAPI.openClipboardPanel?.();
  });

  dom.navTranslator?.addEventListener('click', () => {
    window.browserAPI.openTranslatorPanel?.();
  });

  dom.navCalendar?.addEventListener('click', () => {
    window.browserAPI.openCalendarPanel?.();
  });

  // Calendar alarm notification listener
  window.browserAPI?.onCalendarAlarmActive?.((active) => {
    if (active) {
      dom.navCalendar?.classList.add('alarm-active');
    } else {
      dom.navCalendar?.classList.remove('alarm-active');
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (dom.navTelegram && dom.navTelegram.contains(e.target)) return;
    window.browserAPI.hideTelegram?.();
    if (dom.navAi && dom.navAi.contains(e.target)) return;
    window.browserAPI.hideAiPanel?.();
    if (dom.navNotes && dom.navNotes.contains(e.target)) return;
    window.browserAPI.closeNotesWindow?.();
  });

  function renderTelegramBadge(count) {
    const btn = dom.navTelegram;
    if (!btn) return;
    telegramCount = count || 0;

    // Ensure a badge element exists on the Telegram button
    let badge = btn.querySelector('.nav-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      btn.appendChild(badge);
    }

    if (telegramCount > 0) {
      badge.textContent = String(telegramCount > 99 ? '99+' : telegramCount);
      badge.classList.add('show');
    } else {
      badge.textContent = '';
      badge.classList.remove('show');
    }
  }

  window.browserAPI.onTelegramBadge?.((count) => {
    renderTelegramBadge(Number(count) || 0);
  });

  window.browserAPI.onOpenNewTab?.((payload) => {
    const side = payload?.side === 'right' ? 'right' : 'left';
    const url = payload?.url || (side === 'right' ? RIGHT_HOME : LEFT_HOME);
    createTab(side, url);
  });

  // Notes wiring
  loadNotes();
  renderNotes();
  if (dom.noteAdd) dom.noteAdd.addEventListener('click', addNote);
  if (dom.noteSave) dom.noteSave.addEventListener('click', saveActiveNote);
  if (dom.noteDelete) dom.noteDelete.addEventListener('click', deleteActiveNote);
  if (dom.noteText) dom.noteText.addEventListener('input', () => setNoteStatus(''));

  // Ctrl+Teker ile UI zoom yasak. Zoom sadece BrowserView içinde çalışır.

  dom.toggleSidebar?.addEventListener('click', () => {
    setSidebarHidden(true);
  });

  dom.panelControlsToggle?.addEventListener('click', () => {
    window.browserAPI.togglePanelWindow?.();
  });

  dom.leftCookieBtn?.addEventListener('click', () => handleCookieButton('left'));
  dom.rightCookieBtn?.addEventListener('click', () => handleCookieButton('right'));

  window.browserAPI.onExitProgress?.((payload) => {
    if (!dom.exitModal) return;
    const state = payload?.state;
    if (state === 'show') {
      dom.exitModal.classList.remove('hidden');
      if (dom.exitTimer) {
        clearTimeout(dom.exitTimer);
      }
      dom.exitTimer = setTimeout(() => {
        dom.exitModal.classList.add('hidden');
        // In case exit stalled, force a soft-close after UI feedback.
        window.close();
      }, 5000);
    } else if (state === 'done') {
      dom.exitModal.classList.add('hidden');
      if (dom.exitTimer) {
        clearTimeout(dom.exitTimer);
        dom.exitTimer = null;
      }
    }
  });

  dom.btnLeftOnly?.addEventListener('click', () => updateSplit(1));
  dom.btnRightOnly?.addEventListener('click', () => updateSplit(0));
  dom.btnRestoreSplit?.addEventListener('click', () => updateSplit(0.5));

  dom.splitRange?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    updateSplit(val / 100);
  });

  window.browserAPI.onSplitUpdated?.((ratio) => {
    applySplitFromIPC(ratio);
  });

  window.browserAPI.onUrlUpdate('left', async (url) => {
    if (!url) return;
    updateTabUrl('left', url.tabId, url.url);
    if (url.tabId === active.left) {
      await refreshCookieButton('left', url.url);
    }
  });
  window.browserAPI.onUrlUpdate('right', async (url) => {
    if (!url) return;
    updateTabUrl('right', url.tabId, url.url);
    if (url.tabId === active.right) {
      await refreshCookieButton('right', url.url);
    }
  });

  window.browserAPI.onZoomUpdate?.('left', (payload) => {
    if (!payload) return;
    if (payload.tabId !== active.left) return;
    setZoomDisplay('left', payload.zoomFactor);
  });
  window.browserAPI.onZoomUpdate?.('right', (payload) => {
    if (!payload) return;
    if (payload.tabId !== active.right) return;
    setZoomDisplay('right', payload.zoomFactor);
  });

  window.browserAPI.onTitleUpdate('left', (payload) => {
    if (!payload) return;
    updateTabTitle('left', payload.tabId, payload.title);
  });

  window.browserAPI.onTitleUpdate('right', (payload) => {
    if (!payload) return;
    updateTabTitle('right', payload.tabId, payload.title);
  });

  window.browserAPI.onTitleUpdate('left', (payload) => {
    if (!payload) return;
    updateTabTitle('left', payload.tabId, payload.title);
  });

  window.browserAPI.onTitleUpdate('right', (payload) => {
    if (!payload) return;
    updateTabTitle('right', payload.tabId, payload.title);
  });

  // Loading state handlers
  window.browserAPI.onLoadingStart?.('left', (payload) => {
    const { tabId } = payload;
    loading.left.add(tabId);
    renderTabs('left');
  });

  window.browserAPI.onLoadingStart?.('right', (payload) => {
    const { tabId } = payload;
    loading.right.add(tabId);
    renderTabs('right');
  });

  window.browserAPI.onLoadingStop?.('left', (payload) => {
    const { tabId } = payload;
    loading.left.delete(tabId);
    renderTabs('left');
  });

  window.browserAPI.onLoadingStop?.('right', (payload) => {
    const { tabId } = payload;
    loading.right.delete(tabId);
    renderTabs('right');
  });

  let dragging = false;

  dom.splitter.addEventListener('mousedown', () => {
    dragging = true;
    document.body.classList.add('dragging');
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const ratio = event.clientX / window.innerWidth;
    updateSplit(ratio);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('dragging');
  });

  // Set initial split.
  updateSplit(split);
  setSidebarHidden(false);

  // Load allowlist then set initial cookie buttons
  syncAllowHosts().then(() => {
    refreshCookieButton('left', dom.leftUrl?.dataset.actualUrl || LEFT_HOME);
    refreshCookieButton('right', dom.rightUrl?.dataset.actualUrl || RIGHT_HOME);
  });

  // Seed initial tabs.
  createTab('left', LEFT_HOME);
  createTab('right', RIGHT_HOME);

  // Ensure first tabs are activated (in case race conditions hide them).
  if (tabs.left[0]) window.browserAPI.activateTab('left', tabs.left[0].id);
  if (tabs.right[0]) window.browserAPI.activateTab('right', tabs.right[0].id);

  dom.leftTabAdd?.addEventListener('click', () => createTab('left', LEFT_HOME));
  dom.rightTabAdd?.addEventListener('click', () => createTab('right', RIGHT_HOME));

  dom.leftZoom?.addEventListener('click', () => openZoomMenuWindow('left'));
  dom.rightZoom?.addEventListener('click', () => openZoomMenuWindow('right'));

  // Optional: react to cleanup event.
  window.browserAPI.onCleanup(() => {
  });

  // Main process'ten erişebilmek için fonksiyonları global yap
  window.setActiveTab = setActiveTab;
  window.closeTab = closeTab;
  window.reorderTab = reorderTab;

  // ==================== Find In Page ====================
  const findBox = document.getElementById('find-in-page');
  const findInput = document.getElementById('find-input');
  const findResults = document.getElementById('find-results');
  const findPrev = document.getElementById('find-prev');
  const findNext = document.getElementById('find-next');
  const findCaseSensitive = document.getElementById('find-case-sensitive');
  const findClose = document.getElementById('find-close');

  let findActive = false;
  let currentFindSide = null;

  function showFindInPage(side) {
    findActive = true;
    currentFindSide = side;
    findBox.style.display = 'block';
    findInput.focus();
    findInput.select();
  }

  function hideFindInPage() {
    findActive = false;
    findBox.style.display = 'none';
    findInput.value = '';
    findResults.textContent = '0/0';
    if (currentFindSide) {
      window.browserAPI.stopFindInPage?.(currentFindSide);
      currentFindSide = null;
    }
  }

  function performFind(direction = 'next') {
    const query = findInput.value;
    if (!query || !currentFindSide) {
      findResults.textContent = '0/0';
      return;
    }

    const options = {
      forward: direction === 'next',
      findNext: direction !== 'initial',
      matchCase: findCaseSensitive.checked
    };

    window.browserAPI.findInPage?.(currentFindSide, query, options);
  }

  findInput.addEventListener('input', () => {
    performFind('initial');
  });

  findCaseSensitive.addEventListener('change', () => {
    if (findInput.value) {
      performFind('initial');
    }
  });

  findNext.addEventListener('click', () => {
    performFind('next');
  });

  findPrev.addEventListener('click', () => {
    performFind('prev');
  });

  findClose.addEventListener('click', () => {
    hideFindInPage();
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        performFind('prev');
      } else {
        performFind('next');
      }
    } else if (e.key === 'Escape') {
      hideFindInPage();
    }
  });

  // Global keyboard shortcut Ctrl+F
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      // Determine which side is active based on last focused URL input or default to left
      const side = document.activeElement === dom.rightUrl ? 'right' : 'left';
      showFindInPage(side);
    } else if (e.key === 'Escape' && findActive) {
      hideFindInPage();
    }
  });

  // Listen for find results from main process
  window.browserAPI.onFindResult?.((result) => {
    if (result.finalUpdate && result.matches !== undefined) {
      const current = result.activeMatchOrdinal || 0;
      const total = result.matches || 0;
      findResults.textContent = `${current}/${total}`;
    }
  });

  // native context menu handles its own closing.
})();
