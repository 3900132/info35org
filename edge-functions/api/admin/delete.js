import { getKV, corsHeaders, verifyAdminAuth } from '../../lib/kv-helpers.js';

export default async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
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
    let codes = [];

    const urlObj = new URL(request.url);
    const singleCode = urlObj.searchParams.get('code');
    if (singleCode) {
      codes.push(singleCode);
    }

    if (codes.length === 0) {
      try {
        const body = await request.clone().json();
        if (body.codes && Array.isArray(body.codes)) {
          codes = body.codes;
        } else if (body.code) {
          codes.push(body.code);
        }
      } catch (e) {
      }
    }

    if (codes.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing code or codes parameter.' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const deletedList = [];
    const failedList = [];

    await Promise.all(
      codes.map(async (code) => {
        try {
          const existing = await kv.get(`link:${code}`);
          if (existing) {
            await kv.delete(`link:${code}`);
            deletedList.push(code);
          } else {
            failedList.push(code);
          }
        } catch (err) {
          failedList.push(code);
        }
      })
    );

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully processed bulk deletion.`,
      deleted: deletedList,
      failed: failedList
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