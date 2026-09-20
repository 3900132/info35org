import { getKV, corsHeaders, getUserFromToken } from '../../lib/kv-helpers.js';

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
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

    await kv.delete(`token:${authUser.token}`);

    return new Response(JSON.stringify({
      success: true,
      message: '已退出登录。'
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
