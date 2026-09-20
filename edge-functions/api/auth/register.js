import { getKV, corsHeaders, checkRateLimit, hashPassword, randomHex, createUserToken } from '../../lib/kv-helpers.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

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
    const rateCheck = await checkRateLimit(kv, `register:${clientIp}`, 5, 60000);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `注册操作过于频繁，请 ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} 秒后重试。`
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

    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!USERNAME_RE.test(username)) {
      return new Response(JSON.stringify({
        error: '用户名需为 3-20 位字母、数字、短横线或下划线。'
      }), { status: 400, headers: corsHeaders() });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return new Response(JSON.stringify({
        error: '密码长度需在 6-72 位之间。'
      }), { status: 400, headers: corsHeaders() });
    }

    const existing = await kv.get(`user:${username}`);
    if (existing) {
      return new Response(JSON.stringify({
        error: '该用户名已被注册。'
      }), { status: 409, headers: corsHeaders() });
    }

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);

    const createdAt = new Date().toISOString();
    await kv.put(`user:${username}`, JSON.stringify({
      username,
      salt,
      passwordHash,
      createdAt
    }));

    const { token, expiresAt } = await createUserToken(kv, username);

    return new Response(JSON.stringify({
      success: true,
      message: '注册成功，已自动登录。',
      username,
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
