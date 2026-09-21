// ---- Shared KV & CORS utilities for EdgeLink edge functions ----
// This file is inlined into each edge function during the build step
// for EdgeOne Pages compatibility (no cross-file imports in edge runtime).

function getKV(context) {
  // Preferred variable name for this deployment
  if (context && context.env && context.env.goinfo35org) {
    return context.env.goinfo35org;
  }
  if (typeof goinfo35org !== 'undefined' && goinfo35org !== null) {
    return goinfo35org;
  }
  // Fallbacks: common variable names
  if (context && context.env && context.env.link) {
    return context.env.link;
  }
  if (typeof link !== 'undefined' && link !== null) {
    return link;
  }
  if (context && context.env && context.env.SHORT_LINK_KV) {
    return context.env.SHORT_LINK_KV;
  }
  if (typeof SHORT_LINK_KV !== 'undefined' && SHORT_LINK_KV !== null) {
    return SHORT_LINK_KV;
  }

  const urlStr = context?.request?.url || '';
  const isLocal = urlStr.includes('localhost') || urlStr.includes('127.0.0.1') || urlStr.includes('3000');

  if (!isLocal) {
    throw new Error("Tencent Cloud KV namespace is not defined. Please ensure you have bound your KV namespace in EdgeOne Pages project settings with the variable name 'goinfo35org', and that you have triggered a new deployment to apply the settings.");
  }

  return getMockKV();
}

if (!globalThis.__mockKV) {
  globalThis.__mockKV = new Map();
}
function getMockKV() {
  return {
    async get(key, options) {
      const val = globalThis.__mockKV.get(key);
      if (val === undefined || val === null) return null;
      if (options && options.type === 'json') {
        try {
          return JSON.parse(val);
        } catch(e) {
          return val;
        }
      }
      return val;
    },
    async put(key, value) {
      globalThis.__mockKV.set(key, String(value));
    },
    async delete(key) {
      globalThis.__mockKV.delete(key);
    },
    async list(options) {
      let keys = Array.from(globalThis.__mockKV.keys());
      if (options && options.prefix) {
        keys = keys.filter(k => k.startsWith(options.prefix));
      }
      return {
        keys: keys.map(k => ({ name: k })),
        list_complete: true
      };
    }
  };
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function verifyAdminAuth(context) {
  const adminToken = context?.env?.ADMIN_TOKEN || (typeof ADMIN_TOKEN !== 'undefined' ? ADMIN_TOKEN : null);

  if (!adminToken) {
    return {
      authorized: false,
      status: 403,
      error: 'ADMIN_TOKEN environment variable is not configured. Admin panel is locked.'
    };
  }

  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized. Missing Bearer Token.'
    };
  }

  const clientToken = authHeader.substring(7).trim();
  if (clientToken !== adminToken) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized. Invalid Admin Token.'
    };
  }

  return { authorized: true };
}

// Generic KV-based rate limiter
async function checkRateLimit(kv, key, maxRequests, windowMs) {
  const now = Date.now();
  const recordKey = `ratelimit:${key}`;
  const raw = await kv.get(recordKey);
  const record = raw
    ? (typeof raw === 'string' ? JSON.parse(raw) : raw)
    : { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  await kv.put(recordKey, JSON.stringify(record));

  return {
    allowed: record.count <= maxRequests,
    remaining: Math.max(0, maxRequests - record.count),
    resetAt: record.resetAt
  };
}

/* ----------------------------------------------------
 * USER AUTH HELPERS (PBKDF2 + KV session tokens)
 * ---------------------------------------------------- */

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const USER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function createUserToken(kv, username) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + USER_TOKEN_TTL_MS).toISOString();
  await kv.put(`token:${token}`, JSON.stringify({ username, expiresAt }));
  return { token, expiresAt };
}

async function getUserFromToken(kv, request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  if (!token) return null;

  const raw = await kv.get(`token:${token}`);
  if (!raw) return null;

  let tokenData;
  try {
    tokenData = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
  if (!tokenData || !tokenData.username) return null;
  if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
    await kv.delete(`token:${token}`);
    return null;
  }

  return {
    username: tokenData.username,
    token,
    expiresAt: tokenData.expiresAt
  };
}

/* ----------------------------------------------------
 * SITE SETTINGS (requireRegister switch)
 * ---------------------------------------------------- */

const SITE_SETTINGS_KEY = 'settings:site';
const DEFAULT_SITE_SETTINGS = { requireRegister: false };

async function getSiteSettings(kv) {
  const raw = await kv.get(SITE_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SITE_SETTINGS };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      requireRegister: !!(parsed && parsed.requireRegister),
      requireApproval: !!(parsed && parsed.requireApproval),
      disableRegister: !!(parsed && parsed.disableRegister)
    };
  } catch (e) {
    return { ...DEFAULT_SITE_SETTINGS };
  }
}

async function saveSiteSettings(kv, patch) {
  const current = await getSiteSettings(kv);
  const next = { ...current, ...patch };
  await kv.put(SITE_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/* ----------------------------------------------------
 * LINK LISTING HELPERS
 * ---------------------------------------------------- */

// EdgeOne KV may return the pagination cursor as an object; normalize to string
function normalizeListCursor(c) {
  if (!c) return null;
  if (typeof c === 'string') return c;
  if (typeof c === 'object') {
    if (typeof c.cursor === 'string') return c.cursor;
    if (typeof c.value === 'string') return c.value;
    if (typeof c.next === 'string') return c.next;
    // Last resort: first string property found at depth 1
    for (const v of Object.values(c)) {
      if (typeof v === 'string') return v;
    }
    return null;
  }
  return null;
}

async function listAllLinkKeys(kv) {
  const keys = [];
  let cursor = null;
  do {
    const res = await kv.list(cursor ? { prefix: 'link:', limit: 100, cursor } : { prefix: 'link:', limit: 100 });
    const batch = res.keys || [];
    for (const k of batch) {
      const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
      if (keyName) keys.push(keyName);
    }
    cursor = res.list_complete ? null : normalizeListCursor(res.cursor);
  } while (cursor);
  return keys;
}

// export { getKV, corsHeaders, escapeHtml, verifyAdminAuth, checkRateLimit, randomHex, timingSafeEqual, hashPassword, createUserToken, getUserFromToken, getSiteSettings, saveSiteSettings, listAllLinkKeys, normalizeListCursor };
// 发送邮箱验证码（注册用）。
// 支持多家邮件服务商（均为官方 HTTP API，边缘函数可直连），
// 在 EdgeOne Pages「项目设置 -> 环境变量」中按需配置其一即可：
//   1. RESEND_API_KEY           (Resend,  https://resend.com)   可选 MAIL_FROM，默认 onboarding@resend.dev
//   2. BREVO_API_KEY            (Brevo/Sendinblue, https://brevo.com) 必需 MAIL_FROM，需已验证发件人
//   3. SMTP2GO_API_KEY          (SMTP2GO, https://smtp2go.com)   必需 MAIL_FROM，需已验证发件人
//   4. ALIYUN_DM_ACCESS_KEY_ID  (阿里云邮件推送 DirectMail) + ALIYUN_DM_ACCESS_KEY_SECRET
//      + MAIL_FROM（发信地址，需已在 DirectMail 控制台验证），可选 ALIYUN_DM_REGION（默认 cn-hangzhou）、
//      ALIYUN_DM_FROM_ALIAS（发件人显示名）
//      注意：公网端点按官方文档映射（https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-endpoint），
//      cn-hangzhou 为 dm.aliyuncs.com（无区域前缀），其余区域为 dm.<region>.aliyuncs.com。
//      误用 dm.cn-hangzhou.aliyuncs.com（不存在的域名）会因无法解析被网关拦截，表现为 504。
// 验证码有效期 5 分钟，60 秒内同邮箱只能发一次。

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_TTL_MS = 5 * 60 * 1000;

// 阿里云 RPC 签名所需的百分号编码。
// 阿里云规范化规则：仅 A-Z a-z 0-9 - _ . ~ 不编码，其余一律转义为 %XY。
// 注意 encodeURIComponent 不转义 ! ' ( ) * ~，其中 ! ' ( ) 必须补齐转义，
// 否则邮件 HTML 中的引号/括号（如 font-family:'...'、rgba(...)）会使我方签名串
// 与阿里云服务端重算的串不一致，返回 400 SignatureDoesNotMatch。
function aliyunPercentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/\+/g, '%20')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

// 计算阿里云 DirectMail (RPC style) HMAC-SHA1 签名。
// 使用 POST 表单编码（Content-Type: application/x-www-form-urlencoded），
// 避免邮件 HTML 模板导致 GET URL 超长被网关拒绝（504）。
async function buildAliyunDirectMailRequest(provider, to, subject, text, html) {
  const region = provider.region || 'cn-hangzhou';
  // 官方文档：杭州区域公网端点为 dm.aliyuncs.com（不带区域前缀），
  // dm.cn-hangzhou.aliyuncs.com 域名不存在（DNS NXDOMAIN），请求会被网关拒绝并返回 504。
  const endpoint = region === 'cn-hangzhou'
    ? 'https://dm.aliyuncs.com/'
    : `https://dm.${region}.aliyuncs.com/`;
  const params = {
    AccessKeyId: provider.keyId,
    Action: 'SingleSendMail',
    AccountName: provider.from,
    AddressType: '1',
    Format: 'JSON',
    HtmlBody: html,
    RegionId: region,
    ReplyToAddress: 'false',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Subject: subject,
    TextBody: text,
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ToAddress: to,
    Version: '2015-11-23'
  };
  if (provider.fromAlias) {
    params.FromAlias = provider.fromAlias;
  }

  const sorted = Object.keys(params).sort();
  const canonicalQuery = sorted
    .map(k => `${aliyunPercentEncode(k)}=${aliyunPercentEncode(params[k])}`)
    .join('&');

  const stringToSign = `POST&${aliyunPercentEncode('/')}&${aliyunPercentEncode(canonicalQuery)}`;

  const enc = new TextEncoder();
  // 阿里云签名算法要求 HMAC-SHA1，密钥为 AccessKeySecret + '&'
  const keySha1 = await crypto.subtle.importKey(
    'raw', enc.encode(provider.keySecret + '&'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', keySha1, enc.encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  return {
    url: endpoint,
    body: `${canonicalQuery}&Signature=${aliyunPercentEncode(signature)}`
  };
}

function buildMail(provider, from, to, code) {
  const subject = 'EdgeLink 注册验证码';
  const text = `您的 EdgeLink 注册验证码是：${code}。5 分钟内有效，请勿泄露给他人。如非本人操作请忽略本邮件。`;
  const html = `
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,'Microsoft YaHei',sans-serif;padding:32px;background:#0d111a;border-radius:16px;color:#f0f3f8;">
      <h2 style="margin:0 0 8px;font-size:20px;">⚡ EdgeLink 注册验证码</h2>
      <p style="color:#9aa3b2;font-size:14px;margin:0 0 24px;">您正在注册 EdgeLink 账号，请使用以下验证码完成注册：</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;font-family:monospace;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:18px;text-align:center;color:#4cc9f0;">${code}</div>
      <p style="color:#9aa3b2;font-size:12px;margin:24px 0 0;">验证码 5 分钟内有效。如非本人操作，请忽略本邮件。</p>
    </div>`;

  if (provider === 'resend') {
    return {
      url: 'https://api.resend.com/emails',
      headers: { 'Authorization': `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: { from, to: [to], subject, text, html }
    };
  }
  if (provider === 'brevo') {
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: { 'api-key': provider.key, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: { sender: { email: from }, to: [{ email: to }], subject, textContent: text, htmlContent: html }
    };
  }
  // smtp2go
  return {
    url: 'https://api.smtp2go.com/v3/email/send',
    headers: { 'Content-Type': 'application/json' },
    body: { api_key: provider.key, to: [to], sender: from, subject, text_body: text, html_body: html }
  };
}

function resolveProvider(context) {
  const env = context.env || {};
  const from = env.MAIL_FROM || '';
  if (env.RESEND_API_KEY) return { name: 'resend', key: env.RESEND_API_KEY, from: from || 'EdgeLink <onboarding@resend.dev>' };
  if (env.BREVO_API_KEY) return { name: 'brevo', key: env.BREVO_API_KEY, from: from || '' };
  if (env.SMTP2GO_API_KEY) return { name: 'smtp2go', key: env.SMTP2GO_API_KEY, from: from || '' };
  if (env.ALIYUN_DM_ACCESS_KEY_ID && env.ALIYUN_DM_ACCESS_KEY_SECRET) {
    return {
      name: 'aliyun',
      keyId: env.ALIYUN_DM_ACCESS_KEY_ID,
      keySecret: env.ALIYUN_DM_ACCESS_KEY_SECRET,
      from: from || '',
      region: env.ALIYUN_DM_REGION || 'cn-hangzhou',
      fromAlias: env.ALIYUN_DM_FROM_ALIAS || 'EdgeLink'
    };
  }
  return null;
}

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

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const email = (body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: '请输入有效的邮箱地址。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    // 同邮箱 60 秒内只允许发送一次
    const rateCheck = await checkRateLimit(kv, `sendcode:${email}`, 1, 60000);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `发送过于频繁，请 ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} 秒后再试。`
      }), { status: 429, headers: corsHeaders() });
    }

    // 每 IP 每小时最多 10 次，防滥用
    const ipCheck = await checkRateLimit(kv, `sendcode-ip:${clientIp}`, 10, 3600000);
    if (!ipCheck.allowed) {
      return new Response(JSON.stringify({ error: '验证码发送次数已达上限，请 1 小时后再试。' }), {
        status: 429, headers: corsHeaders()
      });
    }

    const urlStr = request.url || '';
    const isLocal = urlStr.includes('localhost') || urlStr.includes('127.0.0.1');

    const provider = resolveProvider(context);
    if (!provider) {
      if (isLocal) {
        // 本地开发便利：未配置邮件服务时直接返回验证码（仅限 localhost）
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        await kv.put(`vcode:${email}`, JSON.stringify({ code, expiresAt, attempts: 0 }));
        return new Response(JSON.stringify({
          success: true,
          devCode: code,
          message: `[本地开发模式] 未配置邮件服务，验证码直接返回: ${code}`
        }), { status: 200, headers: corsHeaders() });
      }
      return new Response(JSON.stringify({
        error: '邮件服务未配置：请在 EdgeOne Pages 环境变量中设置 RESEND_API_KEY / BREVO_API_KEY / SMTP2GO_API_KEY 之一（以及可选的 MAIL_FROM），并重新部署。'
      }), { status: 503, headers: corsHeaders() });
    }

    if (!provider.from) {
      return new Response(JSON.stringify({
        error: `邮件服务 ${provider.name} 需要在环境变量 MAIL_FROM 中配置已验证的发件人邮箱。`
      }), { status: 503, headers: corsHeaders() });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    await kv.put(`vcode:${email}`, JSON.stringify({ code, expiresAt, attempts: 0 }));

    const subject = 'EdgeLink 注册验证码';
    const text = `您的 EdgeLink 注册验证码是：${code}。5 分钟内有效，请勿泄露给他人。如非本人操作请忽略本邮件。`;
    const html = `<div style="max-width:480px;margin:0 auto;font-family:'Microsoft YaHei',sans-serif;padding:28px;background:#0d111a;border-radius:14px;color:#f0f3f8;"><h2 style="margin:0 0 8px;font-size:20px;">⚡ EdgeLink 注册验证码</h2><p style="color:#9aa3b2;font-size:14px;margin:0 0 20px;">您正在注册 EdgeLink 账号，请使用以下验证码完成注册：</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;font-family:monospace;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:16px;text-align:center;color:#4cc9f0;">${code}</div><p style="color:#9aa3b2;font-size:12px;margin:20px 0 0;">验证码 5 分钟内有效，请勿泄露。如非本人操作，请忽略本邮件。</p></div>`;

    let resp;
    if (provider.name === 'aliyun') {
      // 阿里云 DirectMail：RPC 签名后 POST 表单编码请求（避免 GET URL 超长导致 504）
      const req = await buildAliyunDirectMailRequest(provider, email, subject, text, html);
      resp = await fetch(req.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: req.body
      });
    } else {
      const mail = buildMail(provider, provider.from, email, code);
      resp = await fetch(mail.url, {
        method: 'POST',
        headers: mail.headers,
        body: JSON.stringify(mail.body)
      });
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[send-code] provider error:', resp.status, errText);
      // 提取服务商错误码，帮助定位问题（如 InvalidAccessKeyId / SignatureDoesNotMatch / InvalidMailAddress）
      let providerCode = '';
      try {
        const errJson = JSON.parse(errText);
        providerCode = errJson.Code || errJson.code || errJson.error || '';
      } catch (e) { /* not json */ }
      const codeHint = providerCode ? `，错误码: ${providerCode}` : '';
      return new Response(JSON.stringify({ error: `验证码邮件发送失败（${provider.name} 返回 ${resp.status}${codeHint}），请稍后重试或联系管理员。` }), {
        status: 502, headers: corsHeaders()
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `验证码已发送至 ${email}，5 分钟内有效，请查收（注意检查垃圾邮件）。`
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
