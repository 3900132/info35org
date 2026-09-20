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
      requireRegister: !!(parsed && parsed.requireRegister)
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
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const authCheck = verifyAdminAuth(context);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: corsHeaders()
    });
  }

  try {
    const urlObj = new URL(request.url);
    const date = urlObj.searchParams.get('date');
    if (!date) {
      return new Response(JSON.stringify({ error: 'Missing date parameter.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const kv = getKV(context);
    const trendKey = `stats:clicks:${date}`;
    const raw = await kv.get(trendKey);
    const trend = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { date, total: 0, links: 0 };

    return new Response(JSON.stringify({
      success: true,
      date: trend.date,
      total: trend.total || 0,
      links: trend.links || 0
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}