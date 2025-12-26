(() => {
  const dom = {
    title: document.getElementById('zoom-title'),
    close: document.getElementById('zoom-close'),
    zoomIn: document.getElementById('zoom-in'),
    zoomOut: document.getElementById('zoom-out'),
    zoomReset: document.getElementById('zoom-reset')
  };

  const clampViewZoom = (f) => {
    const n = Number(f);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(0.25, n));
  };

  const toPercent = (f) => `${Math.round(clampViewZoom(f) * 100)}%`;

  const getInitialSide = () => {
    const params = new URLSearchParams(window.location.search);
    const side = params.get('side');
    return side === 'right' ? 'right' : 'left';
  };

  let currentSide = getInitialSide();

  async function render() {
    let current = 1;
    try {
      const z = await window.browserAPI?.getZoom?.(currentSide);
      if (Number.isFinite(z)) current = z;
    } catch (_err) {
      /* ignore */
    }

    if (dom.title) dom.title.textContent = `Yakınlaştırma • ${toPercent(current)}`;
  }

  async function bump(action) {
    if (!window.browserAPI) return;
    try {
      if (action === 'in') window.browserAPI.zoomIn?.(currentSide);
      if (action === 'out') window.browserAPI.zoomOut?.(currentSide);
      if (action === 'reset') window.browserAPI.zoomReset?.(currentSide);
    } catch (_err) {
      /* ignore */
    }

    // Zoom hesaplanıp eventler işlensin diye kısa gecikme.
    setTimeout(() => {
      render();
    }, 60);
  }

  dom.close?.addEventListener('click', () => window.browserAPI?.closeZoomMenu?.());
  dom.zoomIn?.addEventListener('click', () => bump('in'));
  dom.zoomOut?.addEventListener('click', () => bump('out'));
  dom.zoomReset?.addEventListener('click', () => bump('reset'));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.browserAPI?.closeZoomMenu?.();
  });

  window.browserAPI?.onZoomMenuRefresh?.((payload) => {
    const side = payload?.side === 'right' ? 'right' : 'left';
    currentSide = side;
    render();
  });

  render();
})();
