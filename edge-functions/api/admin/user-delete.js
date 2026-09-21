import { getKV, corsHeaders, verifyAdminAuth, normalizeListCursor } from '../../lib/kv-helpers.js';

// Admin deletion of registered users. Accepts DELETE or POST with
// { username } or { usernames: [...] }. Their links are kept and remain
// attributed to the (deleted) username; all sessions are invalidated.
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

  const authCheck = verifyAdminAuth(context);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: corsHeaders()
    });
  }

  try {
    const kv = getKV(context);

    let usernames = [];
    const urlObj = new URL(request.url);
    const singleName = urlObj.searchParams.get('username');
    if (singleName) {
      usernames.push(singleName);
    }

    if (usernames.length === 0) {
      try {
        const body = await request.clone().json();
        if (body.usernames && Array.isArray(body.usernames)) {
          usernames = body.usernames;
        } else if (body.username) {
          usernames.push(body.username);
        }
      } catch (e) { /* no body */ }
    }

    if (usernames.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing username or usernames parameter.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const deleted = [];
    const failed = [];

    for (const username of usernames) {
      try {
        const existing = await kv.get(`user:${username}`);
        if (!existing) {
          failed.push(username);
          continue;
        }
        await kv.delete(`user:${username}`);

        // Invalidate all session tokens belonging to this user
        let cursor = null;
        do {
          const res = await kv.list(cursor ? { prefix: 'token:', limit: 100, cursor } : { prefix: 'token:', limit: 100 });
          const batch = res.keys || [];
          const toDelete = [];
          for (const k of batch) {
            const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
            if (!keyName) continue;
            const raw = await kv.get(keyName);
            if (!raw) continue;
            try {
              const tokenData = typeof raw === 'string' ? JSON.parse(raw) : raw;
              if (tokenData && tokenData.username === username) {
                toDelete.push(keyName);
              }
            } catch (e) { /* skip */ }
          }
          for (const keyName of toDelete) {
            await kv.delete(keyName);
          }
          cursor = res.list_complete ? null : normalizeListCursor(res.cursor);
        } while (cursor);

        deleted.push(username);
      } catch (err) {
        failed.push(username);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `已删除 ${deleted.length} 个用户${failed.length > 0 ? `，${failed.length} 个失败` : ''}。用户名下的短链将保留。`,
      deleted,
      failed
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
