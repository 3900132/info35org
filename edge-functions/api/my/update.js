import { getKV, corsHeaders, checkRateLimit, getUserFromToken } from '../../lib/kv-helpers.js';

// Updates the target content (URL or text) of a short link owned by the
// currently logged-in user. The short code, stats and expiry stay unchanged.
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
    const authUser = await getUserFromToken(kv, request);

    if (!authUser) {
      return new Response(JSON.stringify({ error: '未登录或登录状态已过期。' }), {
        status: 401, headers: corsHeaders()
      });
    }

    // 与 create 接口一致：待审核/封禁用户不可改动短链内容
    const userRaw = await kv.get(`user:${authUser.username}`);
    if (userRaw) {
      try {
        const user = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
        if (user.status === 'blocked') {
          return new Response(JSON.stringify({ error: '该账户已被禁用，无法编辑短链。' }), {
            status: 403, headers: corsHeaders()
          });
        }
        if (user.status === 'pending') {
          return new Response(JSON.stringify({ error: '账户正在等待管理员审核，审核通过后才能编辑短链。' }), {
            status: 403, headers: corsHeaders()
          });
        }
      } catch (e) { /* ignore corrupted record */ }
    }

    const rateCheck = await checkRateLimit(kv, `update:${authUser.username}`, 20, 60000);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `操作过于频繁，请 ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} 秒后再试。`
      }), {
        status: 429,
        headers: corsHeaders()
      });
    }

    const body = await request.json();
    const code = (body.code || '').trim();
    const content = (body.url || '').trim();

    if (!code || !/^[a-zA-Z0-9-_]{3,20}$/.test(code)) {
      return new Response(JSON.stringify({ error: '短地址编码格式不正确。' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    if (!content) {
      return new Response(JSON.stringify({ error: '请输入新的原始链接或文字内容。' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const existingRaw = await kv.get(`link:${code}`);
    if (!existingRaw) {
      return new Response(JSON.stringify({ error: '短链接不存在或已被删除。' }), {
        status: 404,
        headers: corsHeaders()
      });
    }

    let link;
    try {
      link = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw;
    } catch (e) {
      return new Response(JSON.stringify({ error: '短链数据已损坏，无法编辑。' }), {
        status: 500,
        headers: corsHeaders()
      });
    }

    if (!link || link.owner !== authUser.username) {
      return new Response(JSON.stringify({ error: '无权编辑该短链：它不属于当前账户。' }), {
        status: 403,
        headers: corsHeaders()
      });
    }

    // 与 create 接口一致的类型判定：http(s) 开头视为链接，其余作为文字分享
    const isUrl = /^https?:\/\/\S+$/i.test(content);
    link.type = isUrl ? 'url' : 'text';
    link.url = isUrl ? content : '';
    link.text = isUrl ? '' : content;
    link.updatedAt = new Date().toISOString();

    await kv.put(`link:${code}`, JSON.stringify(link));

    const urlObj = new URL(request.url);
    const shortUrl = `${urlObj.origin}/${code}`;

    return new Response(JSON.stringify({
      success: true,
      message: '短链内容已更新。',
      link,
      shortUrl
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
