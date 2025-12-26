(() => {
  const SITE_PERMS = [
    { kind: 'notifications', label: 'Bildirimler' },
    { kind: 'geolocation', label: 'Konum' },
    { kind: 'camera', label: 'Kamera' },
    { kind: 'microphone', label: 'Mikrofon' },
    { kind: 'popups', label: 'Pop-up pencereler' }
  ];

  const dom = {
    host: document.getElementById('site-info-host'),
    close: document.getElementById('site-info-close'),
    connIcon: document.getElementById('site-info-conn-icon'),
    connTitle: document.getElementById('site-info-conn-title'),
    connSub: document.getElementById('site-info-conn-sub'),
    cookiesBtn: document.getElementById('site-info-cookies'),
    cookiesSub: document.getElementById('site-info-cookies-sub'),
    perms: document.getElementById('site-info-perms'),
    settings: document.getElementById('site-info-settings')
  };

  const formatBytes = (bytes) => {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getSide = () => {
    const params = new URLSearchParams(window.location.search);
    const side = params.get('side');
    return side === 'right' ? 'right' : 'left';
  };

  function setConnection(info) {
    const protocol = info?.protocol || '';
    const isHttps = !!info?.isSecure;

    if (protocol === 'file:') {
      dom.connIcon.textContent = '📄';
      dom.connTitle.textContent = 'Yerel dosya';
      dom.connSub.textContent = '';
      return;
    }

    if (isHttps) {
      dom.connIcon.textContent = '🔒';
      dom.connTitle.textContent = 'Bağlantı güvenli';
      const issuer = info?.certificate?.issuerName || '';
      dom.connSub.textContent = issuer ? `Sertifika: ${issuer}` : '';
      return;
    }

    dom.connIcon.textContent = '!';
    dom.connTitle.textContent = 'Güvenli değil';
    dom.connSub.textContent = protocol ? `Protokol: ${protocol.replace(':', '')}` : '';
  }

  function renderPermissions(info) {
    dom.perms.innerHTML = '';
    const host = info?.host || '';

    SITE_PERMS.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'site-info-perm-row';

      const label = document.createElement('div');
      label.className = 'site-info-perm-label';
      label.textContent = p.label;

      const select = document.createElement('select');
      select.className = 'site-info-perm-select';
      select.disabled = !host;

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

      select.addEventListener('change', () => {
        if (!host) return;
        const v = select.value;
        const action = v === 'allow' ? 'allow' : v === 'deny' ? 'deny' : 'forget';
        window.browserAPI.updatePermission?.({ kind: p.kind, host, action });
      });

      row.appendChild(label);
      row.appendChild(select);
      dom.perms.appendChild(row);
    });
  }

  async function render() {
    const side = getSide();
    let info = null;
    try {
      info = await window.browserAPI.getSiteInfo?.(side);
    } catch (_err) {
      info = null;
    }

    const host = info?.host || 'Bu sayfa';
    dom.host.textContent = host;
    setConnection(info);

    const cookieCount = Number(info?.cookies?.count) || 0;
    const cookieBytes = Number(info?.cookies?.bytes) || 0;
    if (!info?.host) {
      dom.cookiesSub.textContent = 'Bu sayfa için geçerli değil';
      dom.cookiesBtn.disabled = true;
    } else {
      dom.cookiesSub.textContent = `${cookieCount} çerez • ${formatBytes(cookieBytes)}`;
      dom.cookiesBtn.disabled = cookieCount <= 0;
    }

    dom.cookiesBtn.onclick = async () => {
      if (!info?.host) return;
      const ok = confirm(`${info.host} için tüm çerezler silinsin mi?`);
      if (!ok) return;
      await window.browserAPI.clearCookiesForHost?.(info.host);
      await render();
    };

    renderPermissions(info);
  }

  dom.close?.addEventListener('click', () => window.browserAPI.closeSiteInfo?.());
  dom.settings?.addEventListener('click', () => {
    window.browserAPI.openSettings?.('permissions');
    window.browserAPI.closeSiteInfo?.();
  });

  // Close on ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.browserAPI.closeSiteInfo?.();
  });

  // Refresh when main tells us
  window.browserAPI.onSiteInfoRefresh?.(() => render());

  render();
})();
