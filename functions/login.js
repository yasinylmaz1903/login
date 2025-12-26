/**
 * Cloudflare Pages Function - Login Endpoint
 * POST /login
 * 
 * Bu endpoint kullanıcı girişini doğrular ve lisans kontrolü yapar.
 * Kullanıcı verileri Cloudflare KV (USERS namespace) içinde saklanır.
 */

async function verifyPassword(password, hash) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === hash;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    // Request body'den kullanıcı adı ve şifreyi al
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Geçersiz JSON formatı',
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const { username, password } = body;

    // Validasyon
    if (!username || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Kullanıcı adı ve şifre gereklidir',
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // KV'den kullanıcı bilgilerini getir
    // env.USERS, Cloudflare Dashboard'da tanımlanmış KV namespace
    const userDataRaw = await env.USERS.get(username);

    if (!userDataRaw) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Kullanıcı adı veya şifre hatalı',
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    // Kullanıcı verilerini parse et
    let userData;
    try {
      userData = JSON.parse(userDataRaw);
    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Kullanıcı verisi bozuk',
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    const { passwordHash, licenseExpiryDate } = userData;

    // Şifreyi Web Crypto API ile doğrula
    const isPasswordValid = await verifyPassword(password, passwordHash);

    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Kullanıcı adı veya şifre hatalı',
        }),
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    // Lisans bitiş tarihini kontrol et
    const now = new Date();
    const expiryDate = new Date(licenseExpiryDate);
    const licenseValid = now <= expiryDate;

    if (!licenseValid) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Lisansınızın süresi dolmuş',
          licenseValid: false,
          expiryDate: licenseExpiryDate,
        }),
        {
          status: 403,
          headers: corsHeaders,
        }
      );
    }

    // Başarılı giriş
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Giriş başarılı',
        licenseValid: true,
        expiryDate: licenseExpiryDate,
        username: username,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Sunucu hatası: ' + error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

// OPTIONS request için CORS preflight desteği
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
