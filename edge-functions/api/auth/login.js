import { getKV, corsHeaders, checkRateLimit, hashPassword, timingSafeEqual, createUserToken } from '../../lib/kv-helpers.js';

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
      status: 405,
      headers: corsHeaders()
    });
  }

  try {
    const kv = getKV(context);

    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('cf-connecting-ip') ||
                     request.headers.get('x-real-ip') || '127.0.0.1';
    const rateCheck = await checkRateLimit(kv, `login:${clientIp}`, 10, 60000);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `登录尝试过于频繁，请 ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} 秒后重试。`
      }), { status: 429, headers: corsHeaders() });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const email = (body.email || body.username || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email) {
      return new Response(JSON.stringify({ error: '请输入邮箱和密码。' }), {
        status: 400, headers: corsHeaders()
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new Response(JSON.stringify({ error: '请输入有效的邮箱地址。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const raw = await kv.get(`user:${email}`);
    if (!raw) {
      return new Response(JSON.stringify({ error: '邮箱或密码错误。' }), {
        status: 401, headers: corsHeaders()
      });
    }

    let user;
    try {
      user = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return new Response(JSON.stringify({ error: '用户数据损坏，请联系管理员。' }), {
        status: 500, headers: corsHeaders()
      });
    }

    const passwordHash = await hashPassword(password, user.salt || '');
    if (!timingSafeEqual(passwordHash, user.passwordHash || '')) {
      return new Response(JSON.stringify({ error: '邮箱或密码错误。' }), {
        status: 401, headers: corsHeaders()
      });
    }

    const identity = user.email || user.username || email;
    const { token, expiresAt } = await createUserToken(kv, identity);

    return new Response(JSON.stringify({
      success: true,
      message: '登录成功。',
      username: identity,
      email: identity,
      token,
      expiresAt
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
