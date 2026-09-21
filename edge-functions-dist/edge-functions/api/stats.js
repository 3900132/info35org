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
const DEFAULT_SITE_SETTINGS = {
  requireRegister: false,
  guestLinkRetentionDays: 7,   // 非注册用户短链保留天数，0 = 永久保留
  redirectDelaySeconds: 3      // 跳转中间页停留秒数，0 = 立即跳转
};

// 整数设置项解析：非法值回退默认值，并夹在 [min, max] 区间
function clampIntSetting(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function getSiteSettings(kv) {
  const raw = await kv.get(SITE_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SITE_SETTINGS };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      requireRegister: !!(parsed && parsed.requireRegister),
      requireApproval: !!(parsed && parsed.requireApproval),
      disableRegister: !!(parsed && parsed.disableRegister),
      guestLinkRetentionDays: clampIntSetting(parsed && parsed.guestLinkRetentionDays, 0, 365, DEFAULT_SITE_SETTINGS.guestLinkRetentionDays),
      redirectDelaySeconds: clampIntSetting(parsed && parsed.redirectDelaySeconds, 0, 60, DEFAULT_SITE_SETTINGS.redirectDelaySeconds)
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
 * EXPIRED LINK CLEANUP（惰性定期清理）
 * ---------------------------------------------------- */

const CLEANUP_MARKER_KEY = 'meta:lastCleanup';
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 每 6 小时最多执行一次全量扫描
const CLEANUP_MAX_DELETIONS = 500;              // 单次运行最多删除数，超出部分留给下一轮

// 判断单条短链是否应被清理：expiresAt 已过，或非注册用户短链超过保留期
function isLinkExpired(link, guestCutoffMs) {
  if (link.expiresAt && Date.now() > new Date(link.expiresAt).getTime()) return true;
  if (!link.owner && link.createdAt && guestCutoffMs !== null) {
    if (new Date(link.createdAt).getTime() < guestCutoffMs) return true;
  }
  return false;
}

// 惰性触发：由跳转/创建短链等高频路径在后台调用（waitUntil），
// 通过 KV 时间戳标记节流；管理端手动清理传 { force: true } 跳过节流。
// 返回值仅供日志/测试使用，从不抛错。
async function maybeCleanupExpiredLinks(kv, opts = {}) {
  try {
    const now = Date.now();
    if (!opts.force) {
      const markerRaw = await kv.get(CLEANUP_MARKER_KEY);
      if (markerRaw) {
        try {
          const marker = typeof markerRaw === 'string' ? JSON.parse(markerRaw) : markerRaw;
          if (marker && marker.at && now - new Date(marker.at).getTime() < CLEANUP_INTERVAL_MS) {
            return { skipped: true };
          }
        } catch (e) { /* 标记损坏则重新执行 */ }
      }
    }
    // 先写标记再扫描，避免并发重复执行
    await kv.put(CLEANUP_MARKER_KEY, JSON.stringify({ at: new Date(now).toISOString() }));

    const settings = await getSiteSettings(kv);
    const retentionDays = settings.guestLinkRetentionDays;
    const guestCutoffMs = retentionDays > 0 ? now - retentionDays * 86400000 : null;

    const keys = await listAllLinkKeys(kv);
    let scanned = 0;
    let deleted = 0;
    for (const keyName of keys) {
      if (deleted >= CLEANUP_MAX_DELETIONS) break;
      const value = await kv.get(keyName);
      if (!value) continue;
      scanned++;
      try {
        const link = typeof value === 'string' ? JSON.parse(value) : value;
        if (link && isLinkExpired(link, guestCutoffMs)) {
          await kv.delete(keyName);
          deleted++;
        }
      } catch (e) { /* 跳过损坏记录 */ }
    }

    // 顺带清理已失效的限流计数键（resetAt 过去超过 1 小时，后续请求会自动重建）
    let ratelimitDeleted = 0;
    let rlCursor = null;
    do {
      const res = await kv.list(rlCursor ? { prefix: 'ratelimit:', limit: 100, cursor: rlCursor } : { prefix: 'ratelimit:', limit: 100 });
      for (const k of (res.keys || [])) {
        const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
        if (!keyName) continue;
        try {
          const raw = await kv.get(keyName);
          const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (record && record.resetAt && now - new Date(record.resetAt).getTime() > 3600000) {
            await kv.delete(keyName);
            ratelimitDeleted++;
          }
        } catch (e) { /* 跳过损坏记录 */ }
      }
      rlCursor = res.list_complete ? null : normalizeListCursor(res.cursor);
    } while (rlCursor);

    // 顺带清理过期历史统计（趋势图仅展示近 7 天，30 天前的每日点击统计不再有读取方）
    let statsDeleted = 0;
    const statsCutoff = new Date(now - 30 * 86400000).toISOString().split('T')[0];
    let stCursor = null;
    do {
      const res = await kv.list(stCursor ? { prefix: 'stats:clicks:', limit: 100, cursor: stCursor } : { prefix: 'stats:clicks:', limit: 100 });
      for (const k of (res.keys || [])) {
        const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
        if (!keyName) continue;
        const datePart = keyName.replace('stats:clicks:', '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < statsCutoff) {
          await kv.delete(keyName);
          statsDeleted++;
        }
      }
      stCursor = res.list_complete ? null : normalizeListCursor(res.cursor);
    } while (stCursor);

    return { scanned, deleted, ratelimitDeleted, statsDeleted, truncated: deleted >= CLEANUP_MAX_DELETIONS };
  } catch (e) {
    return { error: e.message };
  }
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

// export { getKV, corsHeaders, escapeHtml, verifyAdminAuth, checkRateLimit, randomHex, timingSafeEqual, hashPassword, createUserToken, getUserFromToken, getSiteSettings, saveSiteSettings, listAllLinkKeys, normalizeListCursor, maybeCleanupExpiredLinks, isLinkExpired };
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use GET.' }), {
      status: 405,
      headers: corsHeaders()
    });
  }

  try {
    const urlObj = new URL(request.url);
    const code = urlObj.searchParams.get('code');

    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing code parameter.' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const kv = getKV(context);
    const linkJson = await kv.get(`link:${code}`);

    if (!linkJson) {
      return new Response(JSON.stringify({ error: `Short link /${code} not found.` }), {
        status: 404,
        headers: corsHeaders()
      });
    }

    let linkData;
    try {
      linkData = typeof linkJson === 'string' ? JSON.parse(linkJson) : linkJson;
    } catch (e) {
      linkData = {
        type: 'url',
        url: linkJson,
        code,
        createdAt: new Date().toISOString(),
        clicks: 0
      };
    }

    return new Response(JSON.stringify({
      success: true,
      code: linkData.code,
      type: linkData.type || 'url',
      url: linkData.type === 'text' ? '' : linkData.url,
      clicks: linkData.clicks || 0,
      viewLimit: linkData.viewLimit || null,
      expiresAt: linkData.expiresAt || null,
      createdAt: linkData.createdAt
    }), {
      status: 200,
      headers: corsHeaders()
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}