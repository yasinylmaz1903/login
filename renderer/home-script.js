const qs = new URLSearchParams(location.search);
const side = qs.get('side') || 'left';
const sideTurkish = side === 'right' ? 'Sağ' : 'Sol';
const sideColor = side === 'right' ? 'var(--accent-2)' : 'var(--accent)';
document.getElementById('side-pill').textContent = sideTurkish;
const titleEl = document.getElementById('title');
if (titleEl && !titleEl.textContent.includes('Beşiktaş') && !titleEl.textContent.includes('SYSTEM') && !titleEl.textContent.includes('Glassmorphism') && !titleEl.textContent.includes('Material') && !titleEl.textContent.includes('Gradient') && !titleEl.textContent.includes('Terminal') && !titleEl.textContent.includes('Windows') && !titleEl.textContent.includes('Apple')) {
  titleEl.textContent = sideTurkish + ' Panel';
}
const partitionEl = document.getElementById('partition');
if (partitionEl) partitionEl.textContent = side === 'left' ? '🔹 Sol Panel' : '🔸 Sağ Panel';

const clockEl = document.getElementById('clock');
const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const day = days[now.getDay()];
  const date = now.getDate();
  const month = months[now.getMonth()];
  clockEl.textContent = `${hh}:${mm} • ${day}, ${date} ${month}`;
}
tickClock();
setInterval(tickClock, 1000);

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

async function loadData() {
  try {
    // IPv4 - ipify API
    let ipv4 = '—';
    try {
      const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      ipv4 = data.ip || '—';
      document.getElementById('ip').textContent = ipv4;
    } catch (err) {
      document.getElementById('ip').textContent = 'Yüklenemedi';
    }

    // IPv6 - ipify API
    try {
      const response = await fetch('https://api64.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      const ipv6 = data.ip || '';
      const ipv6El = document.getElementById('ipv6');
      if (ipv6El) {
        if (ipv6 && ipv6.includes(':')) {
          ipv6El.textContent = ipv6;
        } else {
          ipv6El.textContent = 'Desteklenmiyor';
        }
      }
    } catch (err) {
      const ipv6El = document.getElementById('ipv6');
      if (ipv6El) ipv6El.textContent = 'Yüklenemedi';
    }

    // Konum ve ISP bilgisi - ipapi.co API (status-panel ile aynı)
    try {
      const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      
      const cityEl = document.getElementById('city');
      if (cityEl) cityEl.textContent = data.city || 'Bilinmiyor';
      
      const countryEl = document.getElementById('country');
      if (countryEl) countryEl.textContent = `${data.region || ''}, ${data.country_name || ''}`.trim() || 'Bilinmiyor';
      
      const asnEl = document.getElementById('asn');
      if (asnEl) asnEl.textContent = data.org || 'Bilinmiyor';

      // VPN Detection - ISP bazlı
      const vpnEl = document.getElementById('vpn');
      if (vpnEl) {
        const isp = (data.org || '').toLowerCase();
        const vpnProviders = [
          'nordvpn', 'expressvpn', 'surfshark', 'protonvpn', 'windscribe',
          'mullvad', 'cyberghost', 'privatevpn', 'ipvanish', 'tunnelbear',
          'hotspot shield', 'hide.me', 'purevpn', 'owl limited', 'm247',
          'datacamp', '31173 services ab', 'vpn service', 'proxy service'
        ];
        const isVPN = vpnProviders.some(provider => isp.includes(provider));
        vpnEl.textContent = isVPN ? 'VPN: Aktif' : 'VPN: Kapalı';
      }
      
      // Proxy/Tor bilgisi
      const proxyEl = document.getElementById('proxy');
      if (proxyEl) {
        const proxyText = data.proxy ? 'Proxy: Tespit Edildi' : 'Proxy: Tespit Edilmedi';
        const torText = data.tor ? 'Tor: Aktif' : '';
        proxyEl.textContent = [proxyText, torText].filter(Boolean).join(' | ');
      }
      
      // Hosting bilgisi
      const hostingEl = document.getElementById('hosting');
      if (hostingEl) {
        const asn_type = data.asn_type || '';
        hostingEl.textContent = asn_type === 'hosting' ? 'Barındırma/Datacenter' : asn_type === 'isp' ? 'Konut/İş ISP' : 'Bilinmiyor';
      }
    } catch (err) {
      document.getElementById('status').textContent = 'Konum bilgisi alınamadı: ' + err.message;
    }
  } catch (err) {
    document.getElementById('status').textContent = 'Bilgi alınamadı: ' + err.message;
  }
}

const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.q;
    form.dispatchEvent(new Event('submit'));
  });
});

loadData();
