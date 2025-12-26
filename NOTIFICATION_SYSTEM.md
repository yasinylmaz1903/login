# Özel Bildirim Sistemi

Modern ve şık bir özel bildirim sistemi. Windows sistem bildirimlerinin yerine kullanılabilir.

## Özellikler

- ✨ Modern ve şık tasarım
- 🎨 Gradient arka plan ve smooth animasyonlar
- 📱 Otomatik kapanma ile birlikte progress bar
- 🖱️ Hover'da durma, click'te aksiyon alma
- 🔔 Sıralı bildirim sistemi (kuyruk yapısı)
- 💬 Icon veya emoji desteği
- 🎯 Badge desteği (mesaj sayısı gösterimi)
- 🎭 Transparent ve frameless pencere

## Kullanım

### 1. Ana Uygulama İçinden (main.js)

```javascript
// Basit bildirim
await createCustomNotification({
  title: 'Başlık',
  body: 'Mesaj içeriği',
  iconEmoji: '📬',
  duration: 5000
});

// Tam özellikli bildirim
const result = await createCustomNotification({
  title: 'Yeni Mesaj',
  body: 'Merhaba, nasılsın?',
  icon: '/path/to/icon.png',  // veya null
  iconEmoji: '💬',            // icon null ise gösterilir
  count: 5,                   // badge gösterir
  duration: 5000,             // ms cinsinden
  chatId: 'user123'           // ek veri
});

// Kullanıcı aksiyonunu kontrol et
if (result.action === 'clicked') {
  console.log('Bildirim tıklandı!', result.chatId);
} else if (result.action === 'closed') {
  console.log('Bildirim kapatıldı');
}
```

### 2. Renderer Process'ten (Preload API ile)

Herhangi bir renderer dosyasında (örn: panel.js, settings.js):

```javascript
// Basit bildirim
await window.electronAPI.showNotification({
  title: 'Test Bildirimi',
  body: 'Bu bir test mesajıdır',
  iconEmoji: '🎉',
  duration: 3000
});

// Özel icon ile
await window.electronAPI.showNotification({
  title: 'Dosya İndirildi',
  body: 'document.pdf başarıyla indirildi',
  iconEmoji: '📥',
  duration: 5000
});
```

### 3. Telegram Bildirimleri

Telegram bildirimleri artık otomatik olarak özel bildirim sistemini kullanıyor:

```javascript
// Telegram bildirim fonksiyonu
function showTelegramNotification(data) {
  // Otomatik olarak özel bildirim sistemi kullanılır
  // Kullanıcı tıklarsa Telegram penceresi açılır
}
```

### 4. Alarm Bildirimleri

Calendar alarm bildirimleri de özel sistem kullanıyor:

```javascript
async function showAlarmNotification(alarm) {
  await createCustomNotification({
    title: '⏰ Alarm Zamanı',
    body: `${timeStr} - ${alarm.text}`,
    iconEmoji: '⏰',
    duration: 10000
  });
}
```

## Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| `title` | string | 'Bildirim' | Bildirim başlığı |
| `body` | string | '' | Mesaj içeriği |
| `icon` | string\|null | null | Icon dosya yolu (48x48 önerilir) |
| `iconEmoji` | string | '📬' | Icon null ise gösterilecek emoji |
| `count` | number\|null | null | Badge sayısı (1'den büyükse gösterilir) |
| `duration` | number | 5000 | Otomatik kapanma süresi (ms) |
| `chatId` | any | null | Ek veri (result'ta döner) |

## Özelleştirme

Bildirim tasarımını özelleştirmek için [custom-notification.html](renderer/custom-notification.html) dosyasını düzenleyebilirsiniz:

- **Renkler**: CSS gradient'lerini değiştirin
- **Boyut**: main.js'te `notificationWidth` ve `notificationHeight` değerlerini ayarlayın
- **Pozisyon**: main.js'te `x` ve `y` koordinatlarını değiştirin
- **Animasyonlar**: CSS animasyonlarını özelleştirin

## Dosyalar

- `renderer/custom-notification.html` - Bildirim UI'ı
- `notification-preload.js` - Bildirim preload script
- `main.js` - Bildirim sistemi ana kodu
- `preload.js` - Renderer process için API

## Örnekler

### Başarı Bildirimi
```javascript
await window.electronAPI.showNotification({
  title: '✅ İşlem Başarılı',
  body: 'Değişiklikler kaydedildi',
  iconEmoji: '✅',
  duration: 3000
});
```

### Hata Bildirimi
```javascript
await window.electronAPI.showNotification({
  title: '❌ Hata',
  body: 'Bir şeyler yanlış gitti',
  iconEmoji: '❌',
  duration: 7000
});
```

### Bilgi Bildirimi
```javascript
await window.electronAPI.showNotification({
  title: 'ℹ️ Bilgi',
  body: 'Güncelleme mevcut',
  iconEmoji: 'ℹ️',
  duration: 5000
});
```

### Çoklu Mesaj Bildirimi
```javascript
await window.electronAPI.showNotification({
  title: 'Ahmet Yılmaz',
  body: 'Toplantı 5 dakika sonra başlıyor',
  iconEmoji: '👤',
  count: 3,  // 3 yeni mesaj
  duration: 5000
});
```

## Notlar

- Bildirimler sıralı gösterilir (kuyruk sistemi)
- Hover yapıldığında timer durur
- Close butonu veya otomatik kapanma mevcut
- Her bildirim tıklanabilir ve sonuç döndürür
- Ekranın sağ üst köşesinde gösterilir
- Always on top özelliği aktif
