import { getKV, corsHeaders, verifyAdminAuth } from '../../lib/kv-helpers.js';

// 用户审核/状态管理（防恶意注册）。
// POST /api/admin/user-status
// body: { usernames: [...] 或 username, status: 'active' | 'pending' | 'blocked' }
//   active  = 审核通过 / 解封
//   pending = 重新标记待审核
//   blocked = 封禁（无法登录、无法生成短链）
const VALID_STATUS = ['active', 'pending', 'blocked'];

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
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

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    let usernames = [];
    if (Array.isArray(body.usernames)) {
      usernames = body.usernames;
    } else if (body.username) {
      usernames = [body.username];
    }
    usernames = usernames.map(u => String(u || '').trim().toLowerCase()).filter(Boolean);

    const status = String(body.status || '').trim();
    if (!VALID_STATUS.includes(status)) {
      return new Response(JSON.stringify({ error: `status 必须为 ${VALID_STATUS.join(' / ')} 之一。` }), {
        status: 400, headers: corsHeaders()
      });
    }
    if (usernames.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing username or usernames parameter.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const updated = [];
    const failed = [];

    for (const username of usernames) {
      try {
        const raw = await kv.get(`user:${username}`);
        if (!raw) {
          failed.push(username);
          continue;
        }
        const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
        user.status = status;
        await kv.put(`user:${username}`, JSON.stringify(user));

        // 封禁时注销该用户全部会话，立即生效
        if (status === 'blocked') {
          let cursor = null;
          do {
            const res = await kv.list(cursor ? { prefix: 'token:', limit: 100, cursor } : { prefix: 'token:', limit: 100 });
            const toDelete = [];
            for (const k of (res.keys || [])) {
              const keyName = typeof k === 'string' ? k : (k?.name || k?.key);
              if (!keyName) continue;
              const tokenRaw = await kv.get(keyName);
              if (!tokenRaw) continue;
              try {
                const tokenData = typeof tokenRaw === 'string' ? JSON.parse(tokenRaw) : tokenRaw;
                if (tokenData && tokenData.username === username) {
                  toDelete.push(keyName);
                }
              } catch (e) { /* skip */ }
            }
            for (const keyName of toDelete) {
              await kv.delete(keyName);
            }
            cursor = res.list_complete ? null : (typeof res.cursor === 'string' ? res.cursor : (res.cursor?.cursor || res.cursor?.value || null));
          } while (cursor);
        }

        updated.push(username);
      } catch (err) {
        failed.push(username);
      }
    }

    const statusText = { active: '已通过/解封', pending: '已标记为待审核', blocked: '已封禁' }[status];
    return new Response(JSON.stringify({
      success: true,
      message: `${statusText} ${updated.length} 个用户${failed.length > 0 ? `，${failed.length} 个失败` : ''}。`,
      updated,
      failed,
      status
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
