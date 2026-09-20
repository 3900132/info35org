import { getKV, corsHeaders, verifyAdminAuth, listAllLinkKeys } from '../../../lib/kv-helpers.js';

// Admin drill-down: lists all links created by a given user, with click stats.
// GET /api/admin/users/links?username=xxx
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
    const urlObj = new URL(request.url);
    const username = (urlObj.searchParams.get('username') || '').trim();

    if (!username) {
      return new Response(JSON.stringify({ error: 'Missing username parameter.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const userRaw = await kv.get(`user:${username}`);
    let registeredAt = null;
    if (userRaw) {
      try {
        const user = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
        registeredAt = user.createdAt || null;
      } catch (e) { /* ignore */ }
    }

    const keys = await listAllLinkKeys(kv);
    const links = [];
    for (const keyName of keys) {
      const value = await kv.get(keyName);
      if (!value) continue;
      try {
        const link = typeof value === 'string' ? JSON.parse(value) : value;
        if (link && link.owner === username) {
          links.push(link);
        }
      } catch (e) { /* skip corrupted entries */ }
    }

    links.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return new Response(JSON.stringify({
      success: true,
      username,
      registeredAt,
      links,
      total: links.length,
      totalClicks: links.reduce((sum, l) => sum + (l.clicks || 0), 0)
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}