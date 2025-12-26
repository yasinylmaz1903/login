(() => {
  const tabList = document.getElementById('tab-list');
  const closeBtn = document.getElementById('close-btn');

  let currentSide = 'left';

  closeBtn?.addEventListener('click', () => {
    window.browserAPI?.closeTabOverflow?.();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.browserAPI?.closeTabOverflow?.();
    }
  });

  // Main window'dan overflow tab bilgilerini alacağız
  window.addEventListener('message', (event) => {
    console.log('postMessage received:', event.data);
    if (event.data?.type === 'overflow-tabs') {
      console.log('Rendering overflow tabs from postMessage');
      renderOverflowTabs(event.data.tabs, event.data.side, event.data.activeTabId);
    }
  });

  // Sayfa yüklendiğinde de tab listesini iste
  window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const side = urlParams.get('side') || 'left';
    currentSide = side;
    console.log('DOMContentLoaded, requesting tabs for side:', side);
    
    try {
      const result = await window.browserAPI.getOverflowTabs(side);
      console.log('Initial load - received overflow tabs:', result);
      if (result && result.tabs) {
        renderOverflowTabs(result.tabs, side, result.activeTabId);
      }
    } catch (err) {
      console.error('Initial tab load failed:', err);
    }
  });

  function renderOverflowTabs(tabs, side, activeTabId) {
    currentSide = side;
    if (!tabList) return;
    
    if (!tabs || tabs.length === 0) {
      tabList.innerHTML = '<div class="empty-message">Tüm sekmeler görünüyor</div>';
      return;
    }

    tabList.innerHTML = '';
    
    tabs.forEach(tab => {
      const item = document.createElement('div');
      item.className = 'tab-overflow-item' + (tab.id === activeTabId ? ' active' : '');
      item.dataset.tabId = tab.id;

      const icon = document.createElement('img');
      icon.className = 'tab-overflow-icon';
      if (tab.favicon) {
        icon.src = tab.favicon;
        icon.referrerPolicy = 'no-referrer';
        icon.onerror = () => {
          icon.style.display = 'none';
        };
      } else {
        icon.style.display = 'none';
      }

      const title = document.createElement('div');
      title.className = 'tab-overflow-title';
      title.textContent = tab.title || tab.url || 'Yeni Sekme';
      title.title = tab.url || '';

      const closeButton = document.createElement('button');
      closeButton.className = 'tab-overflow-close';
      closeButton.textContent = '×';
      closeButton.title = 'Sekmeyi kapat';

      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // IPC üzerinden kapat
        window.browserAPI?.sendMessage?.('close-tab-from-overflow', { side: currentSide, tabId: tab.id });
      });

      item.addEventListener('click', () => {
        // IPC üzerinden aktif et
        window.browserAPI?.sendMessage?.('activate-tab-from-overflow', { side: currentSide, tabId: tab.id });
        window.browserAPI?.closeTabOverflow?.();
      });

      // Drag-drop özellikleri
      item.draggable = true;
      
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
        e.dataTransfer.setData('tab-source', 'overflow');
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain');
        const source = e.dataTransfer.getData('tab-source');
        
        if (source === 'overflow' && sourceId !== tab.id) {
          // Overflow içinde yeniden sırala
          window.browserAPI?.sendMessage?.('reorder-overflow-tab', {
            side: currentSide,
            sourceId,
            targetId: tab.id
          });
        }
      });

      item.appendChild(icon);
      item.appendChild(title);
      item.appendChild(closeButton);
      tabList.appendChild(item);
    });
  }

  // Refresh event'i geldiğinde main window'dan tab listesini iste
  window.browserAPI?.onTabOverflowRefresh?.(async (payload) => {
    console.log('tab-overflow-refresh event received:', payload);
    currentSide = payload?.side || 'left';
    try {
      // IPC üzerinden main window'dan tab listesini al
      console.log('Requesting overflow tabs for side:', currentSide);
      const result = await window.browserAPI.getOverflowTabs(currentSide);
      console.log('Received overflow tabs:', result);
      if (result && result.tabs) {
        renderOverflowTabs(result.tabs, currentSide, result.activeTabId);
      } else {
        console.log('No tabs in result');
        if (tabList) {
          tabList.innerHTML = '<div class="empty-message">Tüm sekmeler görünüyor</div>';
        }
      }
    } catch (err) {
      console.error('Tab listesi alınamadı:', err);
      if (tabList) {
        tabList.innerHTML = '<div class="empty-message">Sekmeler yüklenemedi</div>';
      }
    }
  });
})();
