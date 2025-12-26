(() => {
  const NOTES_KEY = 'ghost-notes';

  const dom = {
    add: document.getElementById('note-add'),
    edit: document.getElementById('note-edit'),
    list: document.getElementById('note-list'),
    remove: document.getElementById('note-delete'),
    copy: document.getElementById('note-copy'),
    status: document.getElementById('note-status'),
    close: document.getElementById('notes-close'),
    settings: document.getElementById('notes-settings'),
    refresh: document.getElementById('notes-refresh'),
    search: document.getElementById('note-search'),
    modal: document.getElementById('note-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalNoteTitle: document.getElementById('modal-note-title'),
    modalNoteBody: document.getElementById('modal-note-body'),
    modalSave: document.getElementById('modal-save'),
    modalCancel: document.getElementById('modal-cancel'),
    modalClose: document.getElementById('modal-close')
  };

  let notes = [];
  let activeNoteId = null;
  let searchQuery = '';
  let modalMode = 'new';
  let modalEditId = null;

  const noteTitleFromBody = (body) => {
    if (!body) return 'Not';
    const line = body.split(/\r?\n/)[0].trim();
    return line || 'Not';
  };

  const setStatus = (text) => {
    if (!dom.status) return;
    dom.status.textContent = text || '';
    if (text) {
      setTimeout(() => {
        if (dom.status && dom.status.textContent === text) dom.status.textContent = '';
      }, 1800);
    }
  };

  const showToast = (title, message = '', icon = '✓', duration = 2500) => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  };

  const loadNotes = () => {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      notes = raw ? JSON.parse(raw) : [];
    } catch (_err) {
      notes = [];
    }
    // Normalize legacy notes without title field and ensure date exists
    notes = notes.map((n) => ({
      ...n,
      title: n.title || noteTitleFromBody(n.body || ''),
      body: n.body || '',
      date: n.date || new Date().toLocaleString('tr-TR')
    }));
  };

  const saveNotes = () => {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (_err) {
      /* ignore */
    }
  };

  const renderNotes = () => {
    if (!dom.list) return;
    dom.list.innerHTML = '';
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? notes.filter((n) => (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q))
      : notes;

    filtered.forEach((note) => {
      const item = document.createElement('div');
      item.className = 'note-card' + (note.id === activeNoteId ? ' selected' : '');
      item.dataset.id = note.id;

      const titleEl = document.createElement('div');
      titleEl.className = 'note-title';
      titleEl.textContent = note.title || 'Not';
      titleEl.title = 'İçeriği kopyala';

      const bodyEl = document.createElement('div');
      bodyEl.className = 'note-body';
      bodyEl.textContent = note.body || '';

      const dateEl = document.createElement('div');
      dateEl.className = 'note-date';
      dateEl.textContent = note.date || '';

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNote(note.id);
        copyContent(note.body || '', note.title || 'Not');
      });
      item.appendChild(titleEl);
      item.appendChild(bodyEl);
      if (note.date) item.appendChild(dateEl);
      dom.list.appendChild(item);
    });
  };

  const selectNote = (id) => {
    activeNoteId = id;
    renderNotes();
  };

  const deleteActive = () => {
    if (!activeNoteId) return;
    notes = notes.filter((n) => n.id !== activeNoteId);
    activeNoteId = notes[0]?.id || null;
    saveNotes();
    renderNotes();
    setStatus('Silindi');
  };

  const copyActive = () => {
    if (!activeNoteId || !window.clipboard) return showToast('Hata', 'Not seçili değil', '❌');
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return showToast('Hata', 'Not bulunamadı', '❌');
    try {
      const result = window.clipboard.writeText(note.body || '');
      if (result.success) {
        showToast('Panoya Kopyalandı', note.title || 'Not', '✓');
      } else {
        showToast('Hata', 'Panoya kopyalanamadı', '❌');
      }
    } catch (_err) {
      showToast('Hata', 'Panoya kopyalanamadı', '❌');
    }
  };

  const openModal = (mode = 'new') => {
    modalMode = mode;
    modalEditId = mode === 'edit' ? activeNoteId : null;
    if (dom.modalTitle) dom.modalTitle.textContent = mode === 'edit' ? 'Notu Düzenle' : 'Yeni Not';
    if (dom.modalNoteTitle) dom.modalNoteTitle.value = mode === 'edit' ? (notes.find((n) => n.id === modalEditId)?.title || '') : '';
    if (dom.modalNoteBody) dom.modalNoteBody.value = mode === 'edit' ? (notes.find((n) => n.id === modalEditId)?.body || '') : '';
    dom.modal?.classList.add('show');
    dom.modal?.removeAttribute('hidden');
  };

  const closeModal = () => {
    dom.modal?.classList.remove('show');
    dom.modal?.setAttribute('hidden', 'true');
    modalEditId = null;
  };

  const saveFromModal = () => {
    const title = dom.modalNoteTitle?.value?.trim() || 'Not';
    const body = dom.modalNoteBody?.value || '';
    if (modalMode === 'edit' && modalEditId) {
      const note = notes.find((n) => n.id === modalEditId);
      if (note) {
        note.title = title;
        note.body = body;
        note.date = new Date().toLocaleString('tr-TR');
        activeNoteId = note.id;
      }
    } else {
      const id = `note-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      notes.unshift({ id, title, body, date: new Date().toLocaleString('tr-TR') });
      activeNoteId = id;
    }
    saveNotes();
    renderNotes();
    selectNote(activeNoteId);
    setStatus('Kaydedildi');
    closeModal();
  };

  const bootstrap = () => {
    loadNotes();
    if (notes.length > 0) {
      activeNoteId = notes[0].id;
    }
    renderNotes();
  };

  dom.add?.addEventListener('click', () => openModal('new'));
  dom.edit?.addEventListener('click', () => {
    if (!activeNoteId) return;
    openModal('edit');
  });
  dom.remove?.addEventListener('click', deleteActive);
  dom.copy?.addEventListener('click', copyActive);
  dom.search?.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderNotes();
  });
  dom.close?.addEventListener('click', () => {
    window.browserAPI.closeNotesWindow?.();
  });

  dom.settings?.addEventListener('click', () => {
    window.browserAPI.openSettings?.();
  });

  dom.refresh?.addEventListener('click', () => {
    location.reload();
  });

  dom.modalSave?.addEventListener('click', saveFromModal);
  dom.modalCancel?.addEventListener('click', closeModal);
  dom.modalClose?.addEventListener('click', closeModal);
  dom.modal?.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.modal?.classList.contains('show')) {
      closeModal();
    }
  });

  function copyContent(text, noteTitle) {
    if (!window.clipboard) {
      console.error('Clipboard API kullanılamıyor');
      return showToast('Hata', 'Panoya kopyalanamadı', '❌');
    }
    try {
      const result = window.clipboard.writeText(text);
      if (result.success) {
        showToast('Panoya Kopyalandı', noteTitle || 'Not içeriği', '✓');
      } else {
        console.error('Kopyalama hatası:', result.error);
        showToast('Hata', 'Panoya kopyalanamadı', '❌');
      }
    } catch (err) {
      console.error('Kopyalama hatası:', err);
      showToast('Hata', 'Panoya kopyalanamadı', '❌');
    }
  }

  // Pencere focus olduğunda notları yeniden yükle (JSON import durumları için)
  window.addEventListener('focus', () => {
    const oldLength = notes.length;
    loadNotes();
    const newLength = notes.length;
    if (oldLength !== newLength || JSON.stringify(notes) !== JSON.stringify(notes)) {
      if (notes.length > 0 && !activeNoteId) {
        activeNoteId = notes[0].id;
      }
      renderNotes();
      if (newLength > oldLength) {
        showToast('Notlar Güncellendi', `${newLength - oldLength} yeni not yüklendi`, '📝');
      }
    }
  });

  // Periyodik kontrol: Her 2 saniyede bir localStorage'ı kontrol et
  setInterval(() => {
    const oldLength = notes.length;
    loadNotes();
    const newLength = notes.length;
    if (oldLength !== newLength) {
      if (notes.length > 0 && !activeNoteId) {
        activeNoteId = notes[0].id;
      }
      renderNotes();
      if (newLength > oldLength) {
        showToast('Notlar Güncellendi', `${newLength - oldLength} yeni not yüklendi`, '📝');
      }
    }
  }, 2000);

  bootstrap();
})();
