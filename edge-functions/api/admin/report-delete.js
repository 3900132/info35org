import { getKV, corsHeaders, verifyAdminAuth } from '../../lib/kv-helpers.js';

// 管理端：删除一条举报记录（处理后清理）。
// DELETE / POST /api/admin/report-delete  body: { id }
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST or DELETE.' }), {
      status: 405, headers: corsHeaders()
    });
  }

  const authCheck = verifyAdminAuth(context);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status, headers: corsHeaders()
    });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const id = String(body.id || '').trim();
    if (!/^[a-zA-Z0-9]{6,32}$/.test(id)) {
      return new Response(JSON.stringify({ error: '无效的举报 ID。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const kv = getKV(context);
    const existing = await kv.get(`report:${id}`);
    if (!existing) {
      return new Response(JSON.stringify({ error: '举报记录不存在或已被删除。' }), {
        status: 404, headers: corsHeaders()
      });
    }

    await kv.delete(`report:${id}`);

    return new Response(JSON.stringify({
      success: true,
      message: '举报记录已删除。'
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
