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
        requireRegister: settings.requireRegister,
        requireApproval: settings.requireApproval,
        disableRegister: settings.disableRegister,
        guestLinkRetentionDays: settings.guestLinkRetentionDays,
        redirectDelaySeconds: settings.redirectDelaySeconds
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

    const patch = {};
    if (body.requireRegister !== undefined) {
      if (typeof body.requireRegister !== 'boolean') {
        return new Response(JSON.stringify({ error: 'requireRegister 必须为布尔值。' }), {
          status: 400, headers: corsHeaders()
        });
      }
      patch.requireRegister = body.requireRegister;
    }
    if (body.requireApproval !== undefined) {
      if (typeof body.requireApproval !== 'boolean') {
        return new Response(JSON.stringify({ error: 'requireApproval 必须为布尔值。' }), {
          status: 400, headers: corsHeaders()
        });
      }
      patch.requireApproval = body.requireApproval;
    }
    if (body.disableRegister !== undefined) {
      if (typeof body.disableRegister !== 'boolean') {
        return new Response(JSON.stringify({ error: 'disableRegister 必须为布尔值。' }), {
          status: 400, headers: corsHeaders()
        });
      }
      patch.disableRegister = body.disableRegister;
    }
    if (body.guestLinkRetentionDays !== undefined) {
      const n = parseInt(body.guestLinkRetentionDays, 10);
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        return new Response(JSON.stringify({ error: 'guestLinkRetentionDays 必须为 0-365 的整数（0 表示永久保留）。' }), {
          status: 400, headers: corsHeaders()
        });
      }
      patch.guestLinkRetentionDays = n;
    }
    if (body.redirectDelaySeconds !== undefined) {
      const n = parseInt(body.redirectDelaySeconds, 10);
      if (!Number.isFinite(n) || n < 0 || n > 60) {
        return new Response(JSON.stringify({ error: 'redirectDelaySeconds 必须为 0-60 的整数（0 表示立即跳转）。' }), {
          status: 400, headers: corsHeaders()
        });
      }
      patch.redirectDelaySeconds = n;
    }
    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ error: '未提供任何设置项（requireRegister / requireApproval / disableRegister / guestLinkRetentionDays / redirectDelaySeconds）。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    await saveSiteSettings(kv, patch);

    return new Response(JSON.stringify({
      success: true,
      message: `设置已保存：${[
        patch.requireRegister !== undefined ? (patch.requireRegister ? '仅注册用户可生成短链' : '所有访客可生成短链') : null,
        patch.requireApproval !== undefined ? (patch.requireApproval ? '新用户注册需审核' : '新用户注册免审核') : null,
        patch.disableRegister !== undefined ? (patch.disableRegister ? '禁止新用户注册' : '允许新用户注册') : null,
        patch.guestLinkRetentionDays !== undefined ? (patch.guestLinkRetentionDays > 0 ? `非注册用户短链保留 ${patch.guestLinkRetentionDays} 天` : '短链永久保留') : null,
        patch.redirectDelaySeconds !== undefined ? (patch.redirectDelaySeconds > 0 ? `跳转页停留 ${patch.redirectDelaySeconds} 秒` : '跳转页立即跳转') : null
      ].filter(Boolean).join('；') || '无变更'}`,
      requireRegister: patch.requireRegister,
      requireApproval: patch.requireApproval,
      disableRegister: patch.disableRegister,
      guestLinkRetentionDays: patch.guestLinkRetentionDays,
      redirectDelaySeconds: patch.redirectDelaySeconds
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
