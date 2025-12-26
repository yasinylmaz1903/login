(() => {
  const PROVIDERS = {
    gmail: { title: 'Gmail', url: 'https://mail.google.com/' },
    hotmail: { title: 'Hotmail', url: 'https://outlook.live.com/' }
  };

  const dom = {
    btnGmail: document.getElementById('btn-gmail'),
    btnHotmail: document.getElementById('btn-hotmail'),
    btnHide: document.getElementById('btn-hide'),
    title: document.getElementById('email-title'),
    status: document.getElementById('email-status')
  };

  function setActive(which) {
    dom.btnGmail?.classList.toggle('active', which === 'gmail');
    dom.btnHotmail?.classList.toggle('active', which === 'hotmail');
    try {
      dom.title.textContent = PROVIDERS[which]?.title || 'Email';
    } catch (_err) {
      /* ignore */
    }
  }

  function switchProvider(which) {
    try {
      dom.status.textContent = 'Açılıyor…';
    } catch (_err) {
      /* ignore */
    }
    setActive(which);

    // Provider switch: her sağlayıcının oturumu ayrı webContents'te kalır.
    if (window.browserAPI?.emailSwitch) {
      window.browserAPI.emailSwitch(which);
      return;
    }

    // Geriye dönük: eski sürümlerde tek view vardı.
    const url = PROVIDERS[which]?.url;
    if (url) window.browserAPI?.emailLoad?.(url);
  }

  dom.btnGmail?.addEventListener('click', () => switchProvider('gmail'));
  dom.btnHotmail?.addEventListener('click', () => switchProvider('hotmail'));
  dom.btnHide?.addEventListener('click', () => window.browserAPI?.hideEmailPanel?.());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.browserAPI?.hideEmailPanel?.();
    }
  });

  // Default
  setActive('gmail');
  switchProvider('gmail');

  // Main process'ten gerçek yükleme durumunu dinle
  window.browserAPI?.onEmailStatus?.((payload) => {
    const loading = !!payload?.loading;
    try {
      dom.status.textContent = loading ? 'Açılıyor…' : '';
    } catch (_err) {
      /* ignore */
    }
  });
})();
