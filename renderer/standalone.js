(() => {
  const params = new URLSearchParams(window.location.search);
  const side = params.get('side') === 'right' ? 'right' : 'left';
  const titlePrefix = side === 'right' ? 'Sağ Pencere' : 'Sol Pencere';

  const input = document.getElementById('url');
  const backBtn = document.getElementById('back');
  const fwdBtn = document.getElementById('forward');
  const reloadBtn = document.getElementById('reload');
  const statusEl = document.getElementById('status');
  const view = document.getElementById('view');

  const normalize = (raw) => {
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  };

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg;
  };

  const updateNavState = () => {
    if (!view) return;
    backBtn.disabled = !view.canGoBack();
    fwdBtn.disabled = !view.canGoForward();
  };

  const loadUrl = (raw) => {
    const target = normalize(raw);
    if (!target) return;
    if (view) view.setAttribute('src', target);
    input.value = target;
    document.title = `${titlePrefix} - ${target}`;
    setStatus('Yükleniyor...');
  };

  const initial = params.get('url') || 'https://www.google.com';
  if (view) {
    view.setAttribute('partition', `temp:${side}`);
    view.addEventListener('did-start-loading', () => setStatus('Yükleniyor...'));
    view.addEventListener('did-stop-loading', () => setStatus('Tamamlandı'));
    view.addEventListener('did-fail-load', () => setStatus('Hata'));
    view.addEventListener('did-navigate', (_e) => {
      updateNavState();
    });
    view.addEventListener('did-navigate-in-page', (_e) => {
      updateNavState();
    });
    view.addEventListener('page-title-updated', (e) => {
      try {
        document.title = `${titlePrefix} - ${e.title}`;
      } catch (_err) { /* ignore */ }
    });
    view.addEventListener('did-navigate', (e) => {
      if (input) input.value = e.url;
      try { document.title = `${titlePrefix} - ${e.url}`; } catch (_err) { /* ignore */ }
    });
    view.addEventListener('did-navigate-in-page', (e) => {
      if (input) input.value = e.url;
    });
  }

  loadUrl(initial);

  backBtn.addEventListener('click', () => {
    try { view?.goBack(); updateNavState(); } catch (_err) { /* ignore */ }
  });
  fwdBtn.addEventListener('click', () => {
    try { view?.goForward(); updateNavState(); } catch (_err) { /* ignore */ }
  });
  reloadBtn.addEventListener('click', () => {
    try { view?.reload(); setStatus('Yenileniyor...'); } catch (_err) { /* ignore */ }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadUrl(input.value.trim());
    }
  });
})();
