import { getKV, corsHeaders, verifyAdminAuth, getSiteSettings, saveSiteSettings } from '../../lib/kv-helpers.js';

// Admin get/set for the "registration required to create links" switch.
// GET  → { requireRegister }
// POST → body { requireRegister: boolean }
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use GET or POST.' }), {
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

    if (request.method === 'GET') {
      const settings = await getSiteSettings(kv);
      return new Response(JSON.stringify({
        success: true,
        requireRegister: settings.requireRegister
      }), { status: 200, headers: corsHeaders() });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    if (typeof body.requireRegister !== 'boolean') {
      return new Response(JSON.stringify({ error: 'requireRegister 必须为布尔值。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    await saveSiteSettings(kv, { requireRegister: body.requireRegister });

    return new Response(JSON.stringify({
      success: true,
      message: body.requireRegister ? '已开启：仅注册用户可生成短链。' : '已关闭：所有访客均可生成短链。',
      requireRegister: body.requireRegister
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
