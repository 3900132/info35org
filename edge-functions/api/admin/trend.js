import { getKV, corsHeaders, verifyAdminAuth } from '../../lib/kv-helpers.js';

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const authCheck = verifyAdminAuth(context);
  if (!authCheck.authorized) {
    return new Response(JSON.stringify({ error: authCheck.error }), {
      status: authCheck.status,
      headers: corsHeaders()
    });
  }

  try {
    const urlObj = new URL(request.url);
    const date = urlObj.searchParams.get('date');
    if (!date) {
      return new Response(JSON.stringify({ error: 'Missing date parameter.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const kv = getKV(context);
    const trendKey = `stats:clicks:${date}`;
    const raw = await kv.get(trendKey);
    const trend = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { date, total: 0, links: 0 };

    return new Response(JSON.stringify({
      success: true,
      date: trend.date,
      total: trend.total || 0,
      links: trend.links || 0
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}