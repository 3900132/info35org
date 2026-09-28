import { getKV, corsHeaders, getUserFromToken } from '../../lib/kv-helpers.js';

// Permanently deletes a short link owned by the currently logged-in user.
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'DELETE' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use DELETE or POST.' }), {
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

    let code = '';
    const urlObj = new URL(request.url);
    code = urlObj.searchParams.get('code') || '';
    if (!code) {
      try {
        const body = await request.json();
        code = (body && body.code) || '';
      } catch (e) { /* 无请求体则走下方校验 */ }
    }
    code = (code || '').trim();

    if (!code || !/^[a-zA-Z0-9-_]{3,20}$/.test(code)) {
      return new Response(JSON.stringify({ error: '短地址编码格式不正确。' }), {
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
      return new Response(JSON.stringify({ error: '短链数据已损坏，无法删除。' }), {
        status: 500,
        headers: corsHeaders()
      });
    }

    if (!link || link.owner !== authUser.username) {
      return new Response(JSON.stringify({ error: '无权删除该短链：它不属于当前账户。' }), {
        status: 403,
        headers: corsHeaders()
      });
    }

    await kv.delete(`link:${code}`);

    return new Response(JSON.stringify({
      success: true,
      message: `短链 /${code} 已永久删除。`,
      deleted: code
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
