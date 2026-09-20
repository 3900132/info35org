import { getKV, corsHeaders, getSiteSettings } from '../lib/kv-helpers.js';

// Public site settings consumed by the frontend to decide whether the
// shortener requires a registered account.
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
    const settings = await getSiteSettings(kv);

    return new Response(JSON.stringify({
      success: true,
      requireRegister: settings.requireRegister
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
