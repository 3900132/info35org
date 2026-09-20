import { getKV, corsHeaders, checkRateLimit, hashPassword, randomHex, createUserToken, getSiteSettings } from '../../lib/kv-helpers.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
      status: 405, headers: corsHeaders()
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

    // 是否禁止新用户注册（防恶意注册总闸）：优先校验，提示最明确
    const settings = await getSiteSettings(kv);
    if (settings.disableRegister) {
      return new Response(JSON.stringify({ error: '本站已暂停新用户注册，请稍后再试或联系管理员。' }), {
        status: 403, headers: corsHeaders()
      });
    }

    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const code = (body.code || '').trim();

    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: '请输入有效的邮箱地址。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return new Response(JSON.stringify({
        error: '密码长度需在 6-72 位之间。'
      }), { status: 400, headers: corsHeaders() });
    }

    // 邮箱即账户：直接按键检查是否已注册（优先于验证码校验，提示更友好）
    const existing = await kv.get(`user:${email}`);
    if (existing) {
      return new Response(JSON.stringify({
        error: '该邮箱已被注册。'
      }), { status: 409, headers: corsHeaders() });
    }

    if (!code) {
      return new Response(JSON.stringify({ error: '请输入邮箱验证码。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    // 校验邮箱验证码
    const vcodeRaw = await kv.get(`vcode:${email}`);
    if (!vcodeRaw) {
      return new Response(JSON.stringify({ error: '验证码无效或已过期，请重新获取。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    let vcode;
    try {
      vcode = typeof vcodeRaw === 'string' ? JSON.parse(vcodeRaw) : vcodeRaw;
    } catch (e) {
      return new Response(JSON.stringify({ error: '验证码数据异常，请重新获取。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    if (vcode.expiresAt && new Date(vcode.expiresAt) < new Date()) {
      await kv.delete(`vcode:${email}`);
      return new Response(JSON.stringify({ error: '验证码已过期，请重新获取。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    // 防暴力猜解：最多 5 次尝试
    if ((vcode.attempts || 0) >= 5) {
      await kv.delete(`vcode:${email}`);
      return new Response(JSON.stringify({ error: '验证码错误次数过多，请重新获取。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    if (vcode.code !== code) {
      vcode.attempts = (vcode.attempts || 0) + 1;
      await kv.put(`vcode:${email}`, JSON.stringify(vcode));
      return new Response(JSON.stringify({ error: '验证码错误，请检查后重试。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    // 验证通过，销毁验证码
    await kv.delete(`vcode:${email}`);

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);

    const status = settings.requireApproval ? 'pending' : 'active';

    const createdAt = new Date().toISOString();
    await kv.put(`user:${email}`, JSON.stringify({
      username: email, // 邮箱即账户名（兼容后台用户列表与短链归属逻辑）
      email,
      salt,
      passwordHash,
      createdAt,
      status
    }));

    const { token, expiresAt } = await createUserToken(kv, email);

    return new Response(JSON.stringify({
      success: true,
      message: status === 'pending'
        ? '注册成功！账户已提交审核，管理员通过后即可生成短链。'
        : '注册成功，已自动登录。',
      username: email,
      email,
      status,
      token,
      expiresAt
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
