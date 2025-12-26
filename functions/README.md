# Cloudflare Pages Functions - Authentication System

Bu klasör, OGame Electron uygulaması için kullanıcı kimlik doğrulama ve lisans kontrolü yapan Cloudflare Pages Functions içerir.

## Kurulum

### 1. Cloudflare KV Namespace Oluşturma

Cloudflare Dashboard'da:
1. **Workers & Pages** > **KV** bölümüne gidin
2. **Create a namespace** butonuna tıklayın
3. Namespace adı: `USERS`
4. **Add** butonuna tıklayın

### 2. KV'yi Pages Project'e Bağlama

1. **Workers & Pages** > Projenizi seçin
2. **Settings** > **Functions** bölümüne gidin
3. **KV namespace bindings** altında **Add binding** butonuna tıklayın
4. Variable name: `USERS`
5. KV namespace: Az önce oluşturduğunuz `USERS` namespace'ini seçin
6. **Save** butonuna tıklayın

### 3. Environment Variables (İsteğe Bağlı)

Register endpoint'i için admin key ekleyin:
1. **Settings** > **Environment variables** bölümüne gidin
2. **Add variable** butonuna tıklayın
3. Variable name: `ADMIN_KEY`
4. Value: Güçlü bir şifre girin (örn: `my-super-secret-admin-key-2025`)
5. **Save** butonuna tıklayın

### 4. Bağımlılıkları Yükleme

```bash
cd functions
npm install
```

### 5. Yerel Test (Opsiyonel)

```bash
npm run dev
```

Bu komut yerel bir development server başlatır:
- `http://localhost:8788/login`
- `http://localhost:8788/register`

### 6. Deploy

```bash
npm run deploy
```

veya Cloudflare Pages otomatik deployment kullanıyorsanız, sadece git push yapın.

## API Endpoints

### POST /login

Kullanıcı girişi yapar ve lisans kontrolü yapar.

**Request Body:**
```json
{
  "username": "testuser",
  "password": "testpass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Giriş başarılı",
  "licenseValid": true,
  "expiryDate": "2025-12-31T23:59:59.000Z",
  "username": "testuser"
}
```

**Error Response (401 - Invalid credentials):**
```json
{
  "success": false,
  "message": "Kullanıcı adı veya şifre hatalı"
}
```

**Error Response (403 - License expired):**
```json
{
  "success": false,
  "message": "Lisansınızın süresi dolmuş",
  "licenseValid": false,
  "expiryDate": "2024-12-31T23:59:59.000Z"
}
```

### POST /register

Yeni kullanıcı kaydeder (Admin key gerektirir).

**Request Body:**
```json
{
  "username": "newuser",
  "password": "newpass123",
  "licenseDays": 30,
  "adminKey": "my-super-secret-admin-key-2025"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Kullanıcı başarıyla oluşturuldu",
  "username": "newuser",
  "licenseExpiryDate": "2025-01-25T12:00:00.000Z",
  "licenseDays": 30
}
```

**Error Response (403 - Invalid admin key):**
```json
{
  "success": false,
  "message": "Yetkisiz işlem"
}
```

**Error Response (409 - User exists):**
```json
{
  "success": false,
  "message": "Bu kullanıcı adı zaten kullanılıyor"
}
```

## Electron Uygulamasından Kullanım

### Login Örneği

```javascript
async function loginUser(username, password) {
  try {
    const response = await fetch('https://your-project.pages.dev/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password,
      }),
    });

    const data = await response.json();

    if (data.success && data.licenseValid) {
      console.log('Giriş başarılı!');
      console.log('Lisans bitiş tarihi:', data.expiryDate);
      return true;
    } else {
      console.error('Giriş başarısız:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Bağlantı hatası:', error);
    return false;
  }
}

// Kullanım
loginUser('testuser', 'testpass123');
```

### Register Örneği (Admin)

```javascript
async function registerUser(username, password, licenseDays = 30) {
  try {
    const response = await fetch('https://your-project.pages.dev/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password,
        licenseDays: licenseDays,
        adminKey: 'my-super-secret-admin-key-2025',
      }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('Kullanıcı oluşturuldu!');
      console.log('Lisans bitiş tarihi:', data.licenseExpiryDate);
      return true;
    } else {
      console.error('Kayıt başarısız:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Bağlantı hatası:', error);
    return false;
  }
}

// Kullanım
registerUser('newuser', 'newpass123', 365); // 1 yıl lisans
```

## Manuel KV Kullanıcı Ekleme

Cloudflare Dashboard'dan manuel olarak kullanıcı eklemek için:

1. **Workers & Pages** > **KV** > **USERS** namespace'ine gidin
2. **Add entry** butonuna tıklayın
3. Key: `testuser`
4. Value:
```json
{
  "passwordHash": "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890",
  "licenseExpiryDate": "2025-12-31T23:59:59.000Z",
  "createdAt": "2024-12-26T12:00:00.000Z",
  "licenseDays": 365
}
```

**Not:** `passwordHash` için bcrypt hash oluşturmanız gerekir. Bunun için online bcrypt generator kullanabilir veya register endpoint'ini kullanabilirsiniz.

## Güvenlik Notları

1. **ADMIN_KEY**: Register endpoint'i için mutlaka güçlü bir admin key kullanın
2. **HTTPS**: Cloudflare Pages otomatik olarak HTTPS kullanır
3. **CORS**: Gerekirse CORS headers'ı kısıtlayabilirsiniz
4. **Rate Limiting**: Cloudflare Pages otomatik rate limiting sağlar
5. **bcrypt**: Şifreler bcrypt ile hash'lenir (10 round)

## Lisans Yenileme

Bir kullanıcının lisansını yenilemek için:

1. Cloudflare Dashboard'da KV'ye gidin
2. Kullanıcının key'ini bulun
3. Value'yu düzenleyin
4. `licenseExpiryDate` değerini güncelleyin

Örnek:
```json
{
  "passwordHash": "$2a$10$...",
  "licenseExpiryDate": "2026-12-31T23:59:59.000Z",
  "createdAt": "2024-12-26T12:00:00.000Z",
  "licenseDays": 730
}
```

## Deployment URL

Deploy edildikten sonra endpoint'leriniz şu adreslerde olacak:
- `https://your-project.pages.dev/login`
- `https://your-project.pages.dev/register`

Cloudflare Pages projenizin URL'ini Dashboard'dan bulabilirsiniz.
