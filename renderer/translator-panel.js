(() => {
  const PROVIDERS = {
    google: { title: 'Google Translate', url: 'https://translate.google.com/' },
    deepl: { title: 'DeepL', url: 'https://www.deepl.com/translator' },
    bing: { title: 'Bing Translator', url: 'https://www.bing.com/translator' },
    yandex: { title: 'Yandex Translate', url: 'https://translate.yandex.com/' }
  };

  const dom = {
    btnGoogle: document.getElementById('btn-google'),
    btnDeepL: document.getElementById('btn-deepl'),
    btnBing: document.getElementById('btn-bing'),
    btnYandex: document.getElementById('btn-yandex'),
    btnHide: document.getElementById('btn-hide'),
    title: document.getElementById('translator-title'),
    status: document.getElementById('translator-status')
  };

  function setActive(which) {
    dom.btnGoogle?.classList.toggle('active', which === 'google');
    dom.btnDeepL?.classList.toggle('active', which === 'deepl');
    dom.btnBing?.classList.toggle('active', which === 'bing');
    dom.btnYandex?.classList.toggle('active', which === 'yandex');
    try {
      dom.title.textContent = PROVIDERS[which]?.title || 'Çeviri';
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
    if (window.browserAPI?.translatorSwitch) {
      window.browserAPI.translatorSwitch(which);
      return;
    }

    // Geriye dönük: eski sürümlerde tek view vardı.
    const url = PROVIDERS[which]?.url;
    if (url) window.browserAPI?.translatorLoad?.(url);
  }

  dom.btnGoogle?.addEventListener('click', () => switchProvider('google'));
  dom.btnDeepL?.addEventListener('click', () => switchProvider('deepl'));
  dom.btnBing?.addEventListener('click', () => switchProvider('bing'));
  dom.btnYandex?.addEventListener('click', () => switchProvider('yandex'));
  dom.btnHide?.addEventListener('click', () => window.browserAPI?.hideTranslatorPanel?.());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.browserAPI?.hideTranslatorPanel?.();
    }
  });

  // Default
  setActive('google');
  switchProvider('google');

  // Main process'ten gerçek yükleme durumunu dinle
  window.browserAPI?.onTranslatorStatus?.((payload) => {
    const loading = !!payload?.loading;
    try {
      dom.status.textContent = loading ? 'Açılıyor…' : '';
    } catch (_err) {
      /* ignore */
    }
  });
})();
