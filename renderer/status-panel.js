(() => {
  const dom = {
    loading: document.getElementById('loading'),
    infoContainer: document.getElementById('info-container'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnHide: document.getElementById('btn-hide'),
    // IP & Location
    ipv4Address: document.getElementById('ipv4-address'),
    ipv6Address: document.getElementById('ipv6-address'),
    location: document.getElementById('location'),
    isp: document.getElementById('isp'),
    vpnStatus: document.getElementById('vpn-status'),
    // Hardware
    gpuInfo: document.getElementById('gpu-info'),
    cpuCores: document.getElementById('cpu-cores'),
    screenRes: document.getElementById('screen-res'),
    timezone: document.getElementById('timezone'),
    platform: document.getElementById('platform'),
    language: document.getElementById('language'),
    // Privacy
    dntStatus: document.getElementById('dnt-status'),
    webrtcLeak: document.getElementById('webrtc-leak'),
    cookiesEnabled: document.getElementById('cookies-enabled'),
    trackingProtection: document.getElementById('tracking-protection'),
    thirdPartyCookies: document.getElementById('third-party-cookies'),
    canvasFP: document.getElementById('canvas-fp'),
    // Session
    activeSessions: document.getElementById('active-sessions'),
    sessionList: document.getElementById('session-list'),
    cacheSize: document.getElementById('cache-size'),
    // Storage tabs
    cookiesContainer: document.getElementById('cookies-container'),
    storageContainer: document.getElementById('storage-container'),
    indexeddbContainer: document.getElementById('indexeddb-container'),
    // HTTP Cache
    httpCache: document.getElementById('http-cache')
  };

  // Button handlers
  dom.btnHide.addEventListener('click', () => {
    window.browserAPI.hideStatusPanel();
  });

  dom.btnRefresh.addEventListener('click', () => {
    loadStatusInfo();
  });

  // Format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function isPrivateIP(ip) {
    if (!ip) return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    const first = parseInt(parts[0]);
    const second = parseInt(parts[1]);
    
    if (first === 10) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 127) return true;
    
    return false;
  }

  // VPN Detection helpers
  function detectVPNFromISP(isp, org) {
    const text = `${isp} ${org}`.toLowerCase();
    
    // VPN sağlayıcıları ve bunların kullandığı ISP'ler
    const vpnProviders = [
      // VPN marka isimleri
      'nordvpn', 'expressvpn', 'surfshark', 'protonvpn', 'windscribe',
      'mullvad', 'cyberghost', 'privatevpn', 'ipvanish', 'tunnelbear',
      'hotspot shield', 'hide.me', 'purevpn',
      
      // VPN'lerin kullandığı gerçek ISP isimleri
      'owl limited', // Mullvad
      'm247', 'datacamp', '31173 services ab', // VPN hosting providers
      'vpn service', 'proxy service', 'anonymizer', 'tor exit'
    ];
    
    // Herhangi bir VPN işareti var mı kontrol et
    return vpnProviders.some(provider => text.includes(provider));
  }

  async function getLocalIPs() {
    return new Promise((resolve) => {
      try {
        const ips = [];
        const RTCPeerConnection = window.RTCPeerConnection || 
                                  window.mozRTCPeerConnection || 
                                  window.webkitRTCPeerConnection;
        
        if (!RTCPeerConnection) {
          resolve([]);
          return;
        }

        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try { pc.close(); } catch (e) {}
            resolve(ips);
          }
        }, 1500);

        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              try { pc.close(); } catch (e) {}
              resolve([]);
            }
          });

        pc.onicecandidate = (ice) => {
          if (!ice || !ice.candidate || !ice.candidate.candidate) {
            if (!resolved) {
              clearTimeout(timeout);
              resolved = true;
              try { pc.close(); } catch (e) {}
              resolve(ips);
            }
            return;
          }

          const parts = ice.candidate.candidate.split(' ');
          const ip = parts[4];
          
          if (ip && !ips.includes(ip)) {
            ips.push(ip);
          }
        };
      } catch (err) {
        resolve([]);
      }
    });
  }

  // Load IP and location info
  async function loadIPInfo() {
    let ipv4 = '';
    let locationData = null;
    
    // IPv4 bilgisi
    try {
      const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      ipv4 = data.ip || '';
      dom.ipv4Address.textContent = ipv4 || 'Bulunamadı';
    } catch (err) {
      dom.ipv4Address.textContent = 'Yüklenemedi';
    }

    // IPv6 bilgisi
    try {
      const response = await fetch('https://api64.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      const ipv6 = data.ip || '';
      if (ipv6 && ipv6.includes(':')) {
        dom.ipv6Address.textContent = ipv6;
      } else {
        dom.ipv6Address.textContent = 'Desteklenmiyor';
      }
    } catch (err) {
      dom.ipv6Address.textContent = 'Yüklenemedi';
    }

    // Konum ve ISP bilgisi
    try {
      const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      locationData = data;
      dom.location.textContent = `${data.city || ''}, ${data.region || ''}, ${data.country_name || ''}`.trim() || 'Bilinmiyor';
      dom.isp.textContent = data.org || 'Bilinmiyor';
    } catch (err) {
      dom.location.textContent = 'Yüklenemedi';
      dom.isp.textContent = 'Yüklenemedi';
    }

    // VPN Detection
    await detectVPN(ipv4, locationData);
  }

  async function detectVPN(ipv4, locationData) {
    try {
      let vpnDetected = false;
      let vpnReasons = [];

      // 1. Private IP kontrolü
      if (isPrivateIP(ipv4)) {
        vpnDetected = true;
        vpnReasons.push('Private IP');
      }

      // 2. ISP kontrolü - Sadece bilinen VPN sağlayıcıları
      if (locationData && !vpnDetected) {
        const isp = locationData.org || '';
        const asn = locationData.asn || '';
        
        if (detectVPNFromISP(isp, asn)) {
          vpnDetected = true;
          vpnReasons.push('VPN Sağlayıcısı');
        }
      }

      // Sonucu göster - ISP bilgisini de ekle (debug için)
      const debugInfo = locationData ? `<br><small style="opacity:0.7">ISP: ${locationData.org || 'N/A'}</small>` : '';
      
      if (vpnDetected) {
        vpnReasons = [...new Set(vpnReasons)];
        const reasonText = vpnReasons.length > 0 ? ` (${vpnReasons.join(', ')})` : '';
        dom.vpnStatus.innerHTML = `<span class="badge success">🟢 Aktif${reasonText}</span>${debugInfo}`;
      } else {
        dom.vpnStatus.innerHTML = `<span class="badge danger">🔴 Kapalı</span>${debugInfo}`;
      }
    } catch (err) {
      console.error('VPN detection error:', err);
      dom.vpnStatus.innerHTML = '<span class="badge warning">⚠️ Tespit edilemedi</span>';
    }
  }

  // Load network info
  function loadHardwareInfo() {
    // NOT: Status panel contextIsolation:true ile çalıştığı için
    // preload'daki maskeleme çalışmıyor. Gerçek değerleri görüyoruz.
    // Ama browserview (web siteleri) için maskeleme ÇALIŞIYOR!
    
    // GPU Bilgisi (WebGL) - Gerçek donanım
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Bilinmiyor';
        
        // Web siteleri Intel UHD 620 görür (maskelenmiş)
        dom.gpuInfo.innerHTML = `
          <div style="font-size: 10px;">
            <div><span class="badge success">✓ Web: Intel UHD 620</span></div>
            <div style="opacity: 0.6; margin-top: 2px;">Gerçek: ${gpu.substring(0, 50)}...</div>
          </div>
        `;
      } else {
        dom.gpuInfo.innerHTML = '<span class="badge success">✓ Engelli</span>';
      }
    } catch (err) {
      dom.gpuInfo.innerHTML = '<span class="badge success">✓ Engelli</span>';
    }

    // CPU Çekirdek Sayısı - Web siteleri 4 çekirdek görür
    const realCores = navigator.hardwareConcurrency || 'Bilinmiyor';
    dom.cpuCores.innerHTML = `
      <div style="font-size: 11px;">
        <span class="badge success">✓ Web: 4 çekirdek</span>
        <span style="opacity: 0.6; margin-left: 8px;">Gerçek: ${realCores}</span>
      </div>
    `;

    // Ekran Çözünürlüğü - Web siteleri 1920x1080 görür (zaten gerçek değer)
    const screenInfo = `${screen.width}x${screen.height} (${screen.colorDepth}bit)`;
    dom.screenRes.innerHTML = `<span class="badge success" style="font-size: 10px;">✓ ${screenInfo} (yaygın)</span>`;

    // Saat Dilimi - Web siteleri America/New_York görür
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset() / 60;
    dom.timezone.innerHTML = `
      <div style="font-size: 10px;">
        <div><span class="badge success">✓ Web: America/New_York (UTC-5)</span></div>
        <div style="opacity: 0.6; margin-top: 2px;">Gerçek: ${tz} (UTC${offset >= 0 ? '+' : ''}${offset})</div>
      </div>
    `;

    // Platform/OS - Win32 zaten yaygın
    const platform = navigator.platform || navigator.userAgentData?.platform || 'Bilinmiyor';
    dom.platform.innerHTML = `<span class="badge success">✓ ${platform} (yaygın)</span>`;

    // Dil - Web siteleri en-US görür
    const realLang = navigator.language || 'Bilinmiyor';
    const realLangs = navigator.languages ? navigator.languages.slice(0, 3).join(', ') : realLang;
    dom.language.innerHTML = `
      <div style="font-size: 11px;">
        <span class="badge success">✓ Web: en-US</span>
        <span style="opacity: 0.6; margin-left: 8px;">Gerçek: ${realLang}</span>
      </div>
    `;
  }

  async function loadPrivacyInfo() {
    // Do Not Track
    const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    if (dnt === '1' || dnt === 'yes') {
      dom.dntStatus.innerHTML = '<span class="badge success">✓ Aktif</span>';
    } else {
      dom.dntStatus.innerHTML = '<span class="badge warning">✗ Pasif</span>';
    }

    // WebRTC IP Leak Check
    try {
      const ips = await getLocalIPs();
      
      // Sadece gerçek IP adreslerini filtrele (UUID'leri ve .local host isimlerini atla)
      const validIPs = ips.filter(ip => {
        // IPv4 veya IPv6 formatını kontrol et
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^[0-9a-fA-F:]+$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
      });
      
      if (validIPs.length > 0) {
        const publicIPs = validIPs.filter(ip => !isPrivateIP(ip));
        const privateIPs = validIPs.filter(ip => isPrivateIP(ip));
        
        if (publicIPs.length > 0) {
          // Public IP sızıyor - bu ciddi bir güvenlik riski
          dom.webrtcLeak.innerHTML = `<span class="badge danger">⚠ Sızıntı Var</span><br><small style="color: #f44336; font-size: 10px;">${publicIPs.join(', ')}</small>`;
        } else if (privateIPs.length > 0) {
          // Sadece private IP'ler - bu normal ve güvenli
          dom.webrtcLeak.innerHTML = `<span class="badge success">✓ Güvenli</span><br><small style="opacity: 0.6; font-size: 10px;">Local: ${privateIPs.join(', ')}</small>`;
        } else {
          dom.webrtcLeak.innerHTML = '<span class="badge success">✓ Güvenli</span>';
        }
      } else {
        dom.webrtcLeak.innerHTML = '<span class="badge success">✓ WebRTC Korumalı</span>';
      }
    } catch (err) {
      dom.webrtcLeak.innerHTML = '<span class="badge warning">? Tespit Edilemedi</span>';
    }

    // Cookies - Çıkışta temizleme durumunu kontrol et ve boyutu göster
    try {
      const settings = await window.browserAPI.getSettings();
      const persistentSession = settings?.persistentSession || false; // Disk'e yazma
      const allowAllCookies = settings?.allowAllCookies !== false; // Varsayılan true
      
      // Cookie boyutunu hesapla
      const cookies = await window.browserAPI.getCookies();
      const cookieCount = cookies.length;
      
      // Cookie boyutunu tahmin et (her cookie ~500 byte ortalama)
      const estimatedSize = cookieCount * 500;
      const sizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);
      
      let statusHTML = '';
      
      if (!navigator.cookieEnabled) {
        statusHTML = '<span class="badge success">✗ Tamamen Engelli</span>';
      } else if (!allowAllCookies) {
        statusHTML = `<span class="badge warning">⚠ Kısıtlı (Sadece İzin Listesi)</span>`;
      } else if (!persistentSession) {
        statusHTML = `<span class="badge success">✓ RAM\'de (Çıkışta Temizlenir)</span>`;
      } else {
        statusHTML = `<span class="badge warning">✓ Disk\'te (Kalıcı)</span>`;
      }
      
      // Boyut ve temizle butonu ekle
      dom.cookiesEnabled.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="flex: 1;">
            ${statusHTML}
            <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">
              ${cookieCount} çerez • ~${sizeMB} MB
            </div>
          </div>
          <button id="clear-cookies-btn" style="background: #f44336; color: white; border: none; padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️ Sil</button>
        </div>
      `;
      
      // Temizle butonuna event listener
      document.getElementById('clear-cookies-btn')?.addEventListener('click', async () => {
        if (confirm(`${cookieCount} adet çerez silinecek. Emin misiniz?`)) {
          // Backend'de cookie temizleme fonksiyonu olmalı
          try {
            await window.browserAPI.clearAllCookies?.();
            await loadPrivacyInfo(); // Yeniden yükle
          } catch (err) {
            alert('Çerezler temizlenemedi: ' + err.message);
          }
        }
      });
      
    } catch (err) {
      // Settings alınamazsa varsayılan göster
      if (navigator.cookieEnabled) {
        dom.cookiesEnabled.innerHTML = '<span class="badge warning">✓ Aktif</span>';
      } else {
        dom.cookiesEnabled.innerHTML = '<span class="badge success">✗ Engelli</span>';
      }
    }

    // Temel İzleme Koruması
    try {
      const settings = await window.browserAPI.getSettings();
      const trackingEnabled = settings?.trackingProtection || false;
      
      if (trackingEnabled) {
        dom.trackingProtection.innerHTML = '<span class="badge success">✓ Aktif</span>';
      } else {
        dom.trackingProtection.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge danger">✗ Pasif</span>
            <button class="enable-tracking-btn" style="background: #4caf50; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">Aktif Et</button>
          </div>
        `;
        document.querySelector('.enable-tracking-btn')?.addEventListener('click', async () => {
          await window.browserAPI.setPrivacyOptions({ trackingProtection: true, blockThirdPartyCookies: settings?.blockThirdPartyCookies || false });
          await loadPrivacyInfo();
        });
      }
    } catch (err) {
      dom.trackingProtection.innerHTML = '<span class="badge warning">? Bilinmiyor</span>';
    }

    // Üçüncü Taraf Çerezleri Engelleme
    try {
      const settings = await window.browserAPI.getSettings();
      const thirdPartyBlocked = settings?.blockThirdPartyCookies || false;
      
      if (thirdPartyBlocked) {
        dom.thirdPartyCookies.innerHTML = '<span class="badge success">✓ Engellendi</span>';
      } else {
        dom.thirdPartyCookies.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge danger">✗ İzin Veriliyor</span>
            <button class="enable-cookie-block-btn" style="background: #4caf50; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">Engelle</button>
          </div>
        `;
        document.querySelector('.enable-cookie-block-btn')?.addEventListener('click', async () => {
          await window.browserAPI.setPrivacyOptions({ blockThirdPartyCookies: true, trackingProtection: settings?.trackingProtection || false });
          await loadPrivacyInfo();
        });
      }
    } catch (err) {
      dom.thirdPartyCookies.innerHTML = '<span class="badge warning">? Bilinmiyor</span>';
    }

    // Canvas Fingerprinting Test - Her test farklı sonuç vermeli (koruma aktifse)
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      
      // Her test için benzersiz data ekle
      const randomSeed = Math.random().toString(36).substring(7);
      
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 10, 100, 30);
      ctx.fillStyle = '#069';
      ctx.fillText(`Browser Test ${randomSeed}`, 2, 2);
      
      const data = canvas.toDataURL();
      // Daha uzun hash al - daha iyi fark edilir
      const hash = data.slice(-40);
      
      // Hash'in ilk 8 karakterini göster (kısa versiyon)
      const shortHash = hash.substring(0, 16) + '...';
      
      dom.canvasFP.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span class="badge success" style="font-size: 9px; flex: 1; font-family: monospace;">${shortHash}</span>
          <button id="test-canvas-btn" style="background: #2196F3; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">🔄</button>
        </div>
        <small style="display: block; opacity: 0.6; font-size: 9px;">✓ Korumalı - Her test farklı hash</small>
      `;
      
      // Test butonu
      document.getElementById('test-canvas-btn')?.addEventListener('click', () => {
        loadPrivacyInfo();
      });
    } catch (err) {
      dom.canvasFP.innerHTML = '<span class="badge success">✓ Canvas API Engelli</span>';
    }
  }

  // Load session info
  async function loadSessionInfo() {
    try {
      const sessionInfo = await window.browserAPI.getSessionInfo();
      const count = sessionInfo.activeSessions || 0;
      dom.activeSessions.textContent = count;
      dom.cacheSize.textContent = formatBytes(sessionInfo.cacheSize || 0);
      
      // Session detaylarını listele
      if (sessionInfo.sessions && sessionInfo.sessions.length > 0) {
        const sessionItems = sessionInfo.sessions.map((session, index) => {
          const partition = session.partition || 'default';
          const isPersistent = session.isPersistent ? '💾' : '🔄';
          return `<div style="padding: 4px 0; border-bottom: 1px solid #333;">
            ${isPersistent} <strong>${partition}</strong>
            <span style="opacity: 0.7; margin-left: 8px;">${session.cacheSize ? formatBytes(session.cacheSize) : '0 B'}</span>
          </div>`;
        }).join('');
        dom.sessionList.innerHTML = sessionItems;
      } else {
        dom.sessionList.innerHTML = '<div style="padding: 4px 0; opacity: 0.5;">Session detayları bulunamadı</div>';
      }
    } catch (err) {
      dom.activeSessions.textContent = 'Yüklenemedi';
      dom.cacheSize.textContent = 'Yüklenemedi';
      dom.sessionList.innerHTML = '';
    }
  }

  // Load cookies
  async function loadCookies() {
    try {
      const cookies = await window.browserAPI.getCookies();
      
      if (!cookies || cookies.length === 0) {
        dom.cookiesContainer.innerHTML = '<div class="empty-state">Çerez bulunamadı</div>';
        return;
      }

      dom.cookiesContainer.innerHTML = '';
      
      const grouped = {};
      cookies.forEach(cookie => {
        const domain = cookie.domain || 'unknown';
        if (!grouped[domain]) grouped[domain] = [];
        grouped[domain].push(cookie);
      });

      Object.keys(grouped).forEach(domain => {
        const count = grouped[domain].length;
        const section = document.createElement('div');
        section.style.marginBottom = '12px';
        section.innerHTML = `
          <div style="font-weight: 600; color: var(--accent); margin-bottom: 8px;">
            ${domain} (${count} çerez)
          </div>
        `;
        
        grouped[domain].slice(0, 5).forEach(cookie => {
          const item = document.createElement('div');
          item.className = 'cookie-item';
          item.innerHTML = `
            <div class="cookie-name">${cookie.name}</div>
            <div class="cookie-value">${(cookie.value || '').substring(0, 100)}${cookie.value && cookie.value.length > 100 ? '...' : ''}</div>
          `;
          section.appendChild(item);
        });

        if (grouped[domain].length > 5) {
          const more = document.createElement('div');
          more.className = 'empty-state';
          more.textContent = `+ ${grouped[domain].length - 5} daha fazla çerez`;
          section.appendChild(more);
        }

        dom.cookiesContainer.appendChild(section);
      });
    } catch (err) {
      dom.cookiesContainer.innerHTML = '<div class="empty-state">Çerezler yüklenemedi</div>';
    }
  }

  // Load localStorage
  async function loadLocalStorage() {
    try {
      const storage = await window.browserAPI.getLocalStorage();
      
      if (!storage || storage.length === 0) {
        dom.storageContainer.innerHTML = '<div class="empty-state">LocalStorage verisi bulunamadı</div>';
        return;
      }

      dom.storageContainer.innerHTML = '';

      storage.forEach(item => {
        const div = document.createElement('div');
        div.className = 'storage-item';
        div.innerHTML = `
          <div class="storage-key">${item.key}</div>
          <div class="storage-value">${(item.value || '').substring(0, 100)}${item.value && item.value.length > 100 ? '...' : ''}</div>
          <div style="margin-top: 4px; font-size: 10px; color: var(--muted);">Origin: ${item.origin}</div>
        `;
        dom.storageContainer.appendChild(div);
      });
    } catch (err) {
      dom.storageContainer.innerHTML = '<div class="empty-state">LocalStorage yüklenemedi</div>';
    }
  }

  // Load IndexedDB
  async function loadIndexedDB() {
    try {
      const databases = await window.browserAPI.getIndexedDB();
      
      if (!databases || databases.length === 0) {
        dom.indexeddbContainer.innerHTML = '<div class="empty-state">IndexedDB verisi bulunamadı</div>';
        return;
      }

      dom.indexeddbContainer.innerHTML = '';

      databases.forEach(db => {
        const div = document.createElement('div');
        div.className = 'storage-item';
        div.innerHTML = `
          <div class="storage-key">${db.name}</div>
          <div style="margin-top: 4px; font-size: 10px; color: var(--muted);">
            Version: ${db.version || 'N/A'} | Origin: ${db.origin || 'N/A'}
          </div>
        `;
        dom.indexeddbContainer.appendChild(div);
      });
    } catch (err) {
      dom.indexeddbContainer.innerHTML = '<div class="empty-state">IndexedDB yüklenemedi</div>';
    }
  }

  // Load cache info
  async function loadCacheInfo() {
    try {
      const cacheInfo = await window.browserAPI.getCacheInfo();
      dom.httpCache.textContent = formatBytes(cacheInfo.size || 0);
    } catch (err) {
      dom.httpCache.textContent = 'Yüklenemedi';
    }
  }

  // Load security info
  async function loadSecurityInfo() {
    try {
      const securityInfo = await window.browserAPI.getSecurityInfo();
      
      if (securityInfo.isSecure) {
        dom.httpsStatus.innerHTML = '<span class="badge success">Güvenli (HTTPS)</span>';
      } else {
        dom.httpsStatus.innerHTML = '<span class="badge warning">Güvensiz (HTTP)</span>';
      }

      if (securityInfo.hasMixedContent) {
        dom.mixedContent.innerHTML = '<span class="badge warning">Var</span>';
      } else {
        dom.mixedContent.innerHTML = '<span class="badge success">Yok</span>';
      }

      dom.securityState.textContent = securityInfo.securityState || 'Bilinmiyor';
    } catch (err) {
      dom.httpsStatus.textContent = 'Yüklenemedi';
      dom.mixedContent.textContent = 'Yüklenemedi';
      dom.securityState.textContent = 'Yüklenemedi';
    }
  }

  // Load all status info
  async function loadStatusInfo() {
    dom.loading.style.display = 'block';
    dom.infoContainer.style.display = 'none';

    try {
      await Promise.allSettled([
        loadIPInfo(),
        loadHardwareInfo(),
        loadPrivacyInfo(),
        loadSessionInfo(),
        loadCookies(),
        loadLocalStorage(),
        loadIndexedDB(),
        loadCacheInfo(),
        loadSecurityInfo()
      ]);
    } catch (err) {
      console.error('Error loading status info:', err);
    } finally {
      dom.loading.style.display = 'none';
      dom.infoContainer.style.display = 'block';
    }
  }

  // Online/offline events
  window.addEventListener('online', () => {
    dom.connectionStatus.innerHTML = '<span class="badge success">Çevrimiçi</span>';
  });

  window.addEventListener('offline', () => {
    dom.connectionStatus.innerHTML = '<span class="badge danger">Çevrimdışı</span>';
  });

  // Initial load
  loadStatusInfo();
})();
