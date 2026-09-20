import { getKV, corsHeaders, getUserFromToken, listAllLinkKeys } from '../../lib/kv-helpers.js';

// Lists all links owned by the currently logged-in user, with live click stats.
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

  try {
    const kv = getKV(context);
    const authUser = await getUserFromToken(kv, request);

    if (!authUser) {
      return new Response(JSON.stringify({ error: '未登录或登录状态已过期。' }), {
        status: 401, headers: corsHeaders()
      });
    }

    const keys = await listAllLinkKeys(kv);
    const links = [];

    for (const keyName of keys) {
      const value = await kv.get(keyName);
      if (!value) continue;
      try {
        const link = typeof value === 'string' ? JSON.parse(value) : value;
        if (link && link.owner === authUser.username) {
          links.push(link);
        }
      } catch (e) { /* skip corrupted entries */ }
    }

    links.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return new Response(JSON.stringify({
      success: true,
      username: authUser.username,
      links,
      total: links.length
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
