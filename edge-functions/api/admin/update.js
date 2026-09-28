import { getKV, corsHeaders, verifyAdminAuth } from '../../lib/kv-helpers.js';

// Admin: updates the target content (URL or text) of ANY short link.
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

  const authCheck = verifyAdminAuth(context);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: corsHeaders()
    });
  }

  try {
    const kv = getKV(context);

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
