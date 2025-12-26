(() => {
  const dom = {
    content: document.getElementById('content'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    btnClear: document.getElementById('btn-clear'),
    btnHide: document.getElementById('btn-hide'),
    statsCount: document.getElementById('stats-count'),
    statsMemory: document.getElementById('stats-memory'),
    filterBtns: document.querySelectorAll('.filter-btn')
  };

  let clipboardItems = [];
  let currentFilter = 'all';
  let searchQuery = '';

  // Clipboard tipi algılama
  function detectType(text) {
    if (!text || typeof text !== 'string') return 'text';
    const trimmed = text.trim();

    // OTP (6 veya 4 haneli sayı)
    if (/^\d{4}$|^\d{6}$/.test(trimmed)) return 'otp';

    // URL
    if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return 'url';

    // E-posta
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';

    // Kod (birden fazla özel karakter, parantez, noktalı virgül vb.)
    const codeIndicators = ['{', '}', '[', ']', '()', '=>', 'function', 'const ', 'let ', 'var ', 'import ', 'export ', '<?php', 'def ', 'class '];
    if (codeIndicators.some(indicator => trimmed.includes(indicator))) return 'code';

    return 'text';
  }

  function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Az önce';
    if (minutes < 60) return `${minutes} dakika önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }

  function getTypeIcon(type) {
    const icons = {
      url: '🔗',
      code: '💻',
      email: '✉️',
      otp: '🔐',
      text: '📝'
    };
    return icons[type] || '📝';
  }

  function truncateText(text, maxLength = 150) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  function calculateMemorySize() {
    let totalBytes = 0;
    clipboardItems.forEach(item => {
      totalBytes += new Blob([item.text]).size;
    });
    const kb = (totalBytes / 1024).toFixed(1);
    return `${kb} KB`;
  }

  function updateStats() {
    const filteredItems = getFilteredItems();
    dom.statsCount.textContent = `${filteredItems.length} öğe`;
    dom.statsMemory.textContent = calculateMemorySize();
  }

  function getFilteredItems() {
    let items = clipboardItems;

    // Tip filtresi
    if (currentFilter !== 'all') {
      items = items.filter(item => item.type === currentFilter);
    }

    // Arama filtresi
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.text.toLowerCase().includes(query) ||
        (item.source && item.source.toLowerCase().includes(query))
      );
    }

    return items;
  }

  function renderClipboard() {
    const items = getFilteredItems();

    if (items.length === 0) {
      dom.content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div>${searchQuery || currentFilter !== 'all' ? 'Sonuç bulunamadı' : 'Henüz kopyalanan içerik yok'}</div>
        </div>
      `;
      updateStats();
      return;
    }

    dom.content.innerHTML = items.map((item, index) => `
      <div class="clip-item" data-index="${item.id}">
        <div class="clip-header">
          <span class="clip-type ${item.type}">${getTypeIcon(item.type)} ${item.type}</span>
          <span class="clip-source" title="${item.source || 'Bilinmeyen'}">${item.source || 'Bilinmeyen'}</span>
          <span class="clip-time">${formatTime(item.timestamp)}</span>
        </div>
        <div class="clip-text">${truncateText(item.text)}</div>
        <div class="clip-actions">
          <button class="clip-action-btn" data-action="copy" data-id="${item.id}">📋 Kopyala</button>
          <button class="clip-action-btn" data-action="delete" data-id="${item.id}">🗑️ Sil</button>
        </div>
      </div>
    `).join('');

    // Event listeners
    dom.content.querySelectorAll('.clip-item').forEach(el => {
      const id = parseInt(el.dataset.index);
      const item = clipboardItems.find(i => i.id === id);
      
      el.addEventListener('click', (e) => {
        if (e.target.closest('.clip-action-btn')) return;
        if (item && window.browserAPI?.clipboardCopy) {
          window.browserAPI.clipboardCopy(item.text);
        }
      });
    });

    dom.content.querySelectorAll('.clip-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);

        if (action === 'copy') {
          const item = clipboardItems.find(i => i.id === id);
          if (item && window.browserAPI?.clipboardCopy) {
            window.browserAPI.clipboardCopy(item.text);
          }
        } else if (action === 'delete') {
          deleteClipboardItem(id);
        }
      });
    });

    updateStats();
  }

  function deleteClipboardItem(id) {
    clipboardItems = clipboardItems.filter(item => item.id !== id);
    saveClipboard();
    renderClipboard();
  }

  function clearAllClipboard() {
    if (clipboardItems.length === 0) return;
    
    if (confirm('Tüm clipboard geçmişi ve Windows panosu (Win+V) silinecek. Emin misiniz?')) {
      clipboardItems = [];
      saveClipboard();
      renderClipboard();
      
      // Windows clipboard'ı da temizle
      if (window.browserAPI?.clipboardClearAll) {
        window.browserAPI.clipboardClearAll();
      }
    }
  }

  function saveClipboard() {
    if (window.browserAPI?.clipboardSave) {
      window.browserAPI.clipboardSave(clipboardItems);
    }
  }

  // Filter buttons
  dom.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderClipboard();
    });
  });

  // Search
  dom.searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    dom.searchClear.style.display = searchQuery ? 'block' : 'none';
    renderClipboard();
  });

  dom.searchClear.addEventListener('click', () => {
    dom.searchInput.value = '';
    searchQuery = '';
    dom.searchClear.style.display = 'none';
    renderClipboard();
  });

  // Buttons
  dom.btnClear.addEventListener('click', clearAllClipboard);
  dom.btnHide.addEventListener('click', () => {
    if (window.browserAPI?.hideClipboardPanel) {
      window.browserAPI.hideClipboardPanel();
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (window.browserAPI?.hideClipboardPanel) {
        window.browserAPI.hideClipboardPanel();
      }
    }
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      dom.searchInput.focus();
    }
  });

  // IPC listeners
  if (window.browserAPI?.onClipboardUpdate) {
    window.browserAPI.onClipboardUpdate((data) => {
      clipboardItems = data || [];
      renderClipboard();
    });
  }

  if (window.browserAPI?.onClipboardNew) {
    window.browserAPI.onClipboardNew((item) => {
      // Yeni item ekle (en başa)
      clipboardItems.unshift(item);
      
      // 50 ile sınırla
      if (clipboardItems.length > 50) {
        clipboardItems = clipboardItems.slice(0, 50);
      }
      
      saveClipboard();
      renderClipboard();
    });
  }

  // Initial load
  if (window.browserAPI?.clipboardLoad) {
    window.browserAPI.clipboardLoad().then(data => {
      clipboardItems = data || [];
      renderClipboard();
    });
  }

  // Expose detection for main process
  window.detectClipboardType = detectType;
})();
