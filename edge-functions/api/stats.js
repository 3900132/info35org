import { getKV, corsHeaders } from '../lib/kv-helpers.js';

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

  try {
    const urlObj = new URL(request.url);
    const code = urlObj.searchParams.get('code');

    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing code parameter.' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const kv = getKV(context);
    const linkJson = await kv.get(`link:${code}`);

    if (!linkJson) {
      return new Response(JSON.stringify({ error: `Short link /${code} not found.` }), {
        status: 404,
        headers: corsHeaders()
      });
    }

    let linkData;
    try {
      linkData = typeof linkJson === 'string' ? JSON.parse(linkJson) : linkJson;
    } catch (e) {
      linkData = {
        type: 'url',
        url: linkJson,
        code,
        createdAt: new Date().toISOString(),
        clicks: 0
      };
    }

    return new Response(JSON.stringify({
      success: true,
      code: linkData.code,
      type: linkData.type || 'url',
      url: linkData.type === 'text' ? '' : linkData.url,
      clicks: linkData.clicks || 0,
      viewLimit: linkData.viewLimit || null,
      expiresAt: linkData.expiresAt || null,
      createdAt: linkData.createdAt
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