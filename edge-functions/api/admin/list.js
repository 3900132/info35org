import { getKV, corsHeaders, verifyAdminAuth } from '../../lib/kv-helpers.js';

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
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

    const urlObj = new URL(request.url);
    const cursor = urlObj.searchParams.get('cursor') || null;
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10), 100);

    let listResult;
    if (cursor) {
      listResult = await kv.list({ prefix: 'link:', limit, cursor });
    } else {
      listResult = await kv.list({ prefix: 'link:', limit });
    }

    const keys = listResult.keys || [];
    const nextCursor = listResult.list_complete ? null : (listResult.cursor || null);

    const links = await Promise.all(
      keys.map(async (k) => {
        const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
        if (!keyName) return null;

        const value = await kv.get(keyName);
        if (!value) return null;

        try {
          return typeof value === 'string' ? JSON.parse(value) : value;
        } catch (e) {
          return {
            url: value,
            code: keyName.replace('link:', ''),
            createdAt: new Date().toISOString(),
            clicks: 0,
            customCode: false
          };
        }
      })
    );

    const activeLinks = links
      .filter(link => link !== null)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let totalCount = null;
    try {
      const allKeys = await kv.list({ prefix: 'link:' });
      totalCount = (allKeys.keys || []).length;
    } catch (e) {
      totalCount = activeLinks.length;
    }

    return new Response(JSON.stringify({
      success: true,
      links: activeLinks,
      cursor: nextCursor,
      total: totalCount
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