/**
 * Cloudflare Pages Function - Register Endpoint
 * POST /register
 * 
 * Yeni kullanıcı kaydetmek için kullanılır.
 * Kullanıcı verilerini Cloudflare KV (USERS namespace) içinde saklar.
 */

import bcrypt from 'bcryptjs';

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

    // Request body'den verileri al
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

    const { username, password, licenseDays = 30, adminKey } = body;

    // Admin key kontrolü (güvenlik için)
    const ADMIN_KEY = env.ADMIN_KEY || 'change-this-secret-key';
    if (adminKey !== ADMIN_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Yetkisiz işlem',
        }),
        {
          status: 403,
          headers: corsHeaders,
        }
      );
    }

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

    if (username.length < 3 || password.length < 6) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Kullanıcı adı en az 3, şifre en az 6 karakter olmalıdır',
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Kullanıcı zaten var mı kontrol et
    const existingUser = await env.USERS.get(username);
    if (existingUser) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Bu kullanıcı adı zaten kullanılıyor',
        }),
        {
          status: 409,
          headers: corsHeaders,
        }
      );
    }

    // Şifreyi hash'le
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Lisans bitiş tarihini hesapla
    const now = new Date();
    const expiryDate = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);

    // Kullanıcı verisini oluştur
    const userData = {
      passwordHash: passwordHash,
      licenseExpiryDate: expiryDate.toISOString(),
      createdAt: now.toISOString(),
      licenseDays: licenseDays,
    };

    // KV'ye kaydet
    await env.USERS.put(username, JSON.stringify(userData));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Kullanıcı başarıyla oluşturuldu',
        username: username,
        licenseExpiryDate: expiryDate.toISOString(),
        licenseDays: licenseDays,
      }),
      {
        status: 201,
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
