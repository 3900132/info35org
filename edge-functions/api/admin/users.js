import { getKV, corsHeaders, verifyAdminAuth, listAllLinkKeys } from '../../lib/kv-helpers.js';

// Lists all registered users together with per-user link count and click stats.
export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use GET.' }), {
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

    // Collect user records
    const users = [];
    let cursor = null;
    do {
      const res = await kv.list({ prefix: 'user:', limit: 100, cursor });
      const batch = res.keys || [];
      for (const k of batch) {
        const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
        if (!keyName) continue;
        const value = await kv.get(keyName);
        if (!value) continue;
        try {
          const user = typeof value === 'string' ? JSON.parse(value) : value;
          if (user && user.username) {
            users.push({
              username: user.username,
              createdAt: user.createdAt || null
            });
          }
        } catch (e) { /* skip corrupted entries */ }
      }
      cursor = res.list_complete ? null : (res.cursor || null);
    } while (cursor);

    // Aggregate per-user link counts and click stats
    const stats = {};
    const linkKeys = await listAllLinkKeys(kv);
    for (const keyName of linkKeys) {
      const value = await kv.get(keyName);
      if (!value) continue;
      try {
        const link = typeof value === 'string' ? JSON.parse(value) : value;
        if (link && link.owner) {
          if (!stats[link.owner]) stats[link.owner] = { linkCount: 0, totalClicks: 0 };
          stats[link.owner].linkCount += 1;
          stats[link.owner].totalClicks += link.clicks || 0;
        }
      } catch (e) { /* skip corrupted entries */ }
    }

    const result = users.map(u => ({
      username: u.username,
      createdAt: u.createdAt,
      linkCount: (stats[u.username] || {}).linkCount || 0,
      totalClicks: (stats[u.username] || {}).totalClicks || 0
    })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return new Response(JSON.stringify({
      success: true,
      users: result,
      total: result.length
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
