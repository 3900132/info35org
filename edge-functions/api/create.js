import { getKV, corsHeaders, escapeHtml, checkRateLimit, getSiteSettings, getUserFromToken, maybeCleanupExpiredLinks } from '../lib/kv-helpers.js';

function generateRandomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
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
    const rateCheck = await checkRateLimit(kv, `create:${clientIp}`, 10, 60000);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `Rate limit exceeded. Try again after ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)}s.`
      }), {
        status: 429,
        headers: corsHeaders()
      });
    }

    const body = await request.json();
    let { url, customCode, viewLimit, ttl } = body;

    // Determine the logged-in user (optional). If the site setting
    // requireRegister is on, only registered users may create links.
    const settings = await getSiteSettings(kv);
    const authUser = await getUserFromToken(kv, request);
    if (settings.requireRegister && !authUser) {
      return new Response(JSON.stringify({
        error: '本站已开启"注册用户才能生成短链"，请先注册并登录。',
        requireRegister: true
      }), {
        status: 401,
        headers: corsHeaders()
      });
    }

    // 账户状态校验（防恶意注册：待审核/封禁用户不可生成）
    if (authUser) {
      const userRaw = await kv.get(`user:${authUser.username}`);
      if (userRaw) {
        try {
          const user = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
          if (user.status === 'blocked') {
            return new Response(JSON.stringify({ error: '该账户已被禁用，无法生成短链。' }), {
              status: 403, headers: corsHeaders()
            });
          }
          if (user.status === 'pending') {
            return new Response(JSON.stringify({ error: '账户正在等待管理员审核，审核通过后才能生成短链。' }), {
              status: 403, headers: corsHeaders()
            });
          }
        } catch (e) { /* ignore corrupted record */ }
      }
    }

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL or text is required.' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const trimmedInput = url.trim();
    const isUrl = /^https?:\/\/\S+$/i.test(trimmedInput);
    const type = isUrl ? 'url' : 'text';
    const finalUrl = isUrl ? trimmedInput : '';
    const finalText = isUrl ? '' : trimmedInput;

    let limit = null;
    if (viewLimit !== undefined && viewLimit !== null && viewLimit !== '') {
      const parsedLimit = parseInt(viewLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
      }
    }

    let expiresAt = null;
    if (ttl !== undefined && ttl !== null && ttl !== '') {
      const ttlSeconds = parseInt(ttl, 10);
      if (!isNaN(ttlSeconds) && ttlSeconds > 0) {
        expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      }
    }

    let shortCode = '';

    if (customCode) {
      customCode = customCode.trim();
      if (!/^[a-zA-Z0-9-_]{3,20}$/.test(customCode)) {
        return new Response(JSON.stringify({
          error: 'Custom alias must be 3-20 characters long and contain only alphanumeric characters, dashes, and underscores.'
        }), {
          status: 400,
          headers: corsHeaders()
        });
      }

      const existing = await kv.get(`link:${customCode}`);
      if (existing) {
        return new Response(JSON.stringify({ error: 'This custom alias is already in use.' }), {
          status: 409,
          headers: corsHeaders()
        });
      }
      shortCode = customCode;
    } else {
      let attempts = 0;
      let unique = false;
      while (!unique && attempts < 5) {
        shortCode = generateRandomCode(6);
        const existing = await kv.get(`link:${shortCode}`);
        if (!existing) {
          unique = true;
        }
        attempts++;
      }

      if (!unique) {
        return new Response(JSON.stringify({ error: 'Failed to generate a unique short code. Please try again.' }), {
          status: 500,
          headers: corsHeaders()
        });
      }
    }

    const createdAt = new Date().toISOString();
    const linkData = {
      type,
      url: finalUrl,
      text: finalText,
      code: shortCode,
      createdAt,
      clicks: 0,
      viewLimit: limit,
      expiresAt: expiresAt,
      customCode: !!customCode,
      owner: authUser ? authUser.username : null
    };

    await kv.put(`link:${shortCode}`, JSON.stringify(linkData));

    // 后台惰性清理过期短链（不阻塞响应，内部自带 6 小时节流）
    if (context.waitUntil) {
      context.waitUntil(maybeCleanupExpiredLinks(kv));
    }

    if (expiresAt) {
      const trendDate = createdAt.split('T')[0];
      const trendKey = `stats:clicks:${trendDate}`;
      const existingTrend = await kv.get(trendKey);
      const trend = existingTrend ? (typeof existingTrend === 'string' ? JSON.parse(existingTrend) : existingTrend) : { date: trendDate, total: 0, links: 0 };
      trend.links = (trend.links || 0) + 1;
      await kv.put(trendKey, JSON.stringify(trend));
    }

    const urlObj = new URL(request.url);
    const shortUrl = `${urlObj.origin}/${shortCode}`;

    return new Response(JSON.stringify({
      success: true,
      code: shortCode,
      type,
      url: isUrl ? finalUrl : (finalText.length > 60 ? finalText.substring(0, 60) + '...' : finalText),
      shortUrl,
      createdAt,
      viewLimit: limit,
      expiresAt: expiresAt
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