import { getKV, corsHeaders, verifyAdminAuth, normalizeListCursor } from '../../lib/kv-helpers.js';

// 管理端：列出所有用户举报（短链举报反馈）。
// GET /api/admin/reports → { reports: [...], total }
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use GET.' }), {
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
    const kv = getKV(context);

    const keys = [];
    let cursor = null;
    do {
      const res = await kv.list(cursor ? { prefix: 'report:', limit: 100, cursor } : { prefix: 'report:', limit: 100 });
      for (const k of (res.keys || [])) {
        const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
        if (keyName) keys.push(keyName);
      }
      cursor = res.list_complete ? null : normalizeListCursor(res.cursor);
    } while (cursor);

    const reports = [];
    for (const keyName of keys) {
      const value = await kv.get(keyName);
      if (!value) continue;
      try {
        const report = typeof value === 'string' ? JSON.parse(value) : value;
        if (report) reports.push(report);
      } catch (e) { /* 跳过损坏记录 */ }
    }

    reports.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return new Response(JSON.stringify({
      success: true,
      reports,
      total: reports.length
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
