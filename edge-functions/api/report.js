import { getKV, corsHeaders, checkRateLimit, randomHex } from '../lib/kv-helpers.js';

// 用户举报短链（跳转中间页的"举报此链接"按钮）。
// POST /api/report  body: { code, reason }
// 记录短链 code、目标内容与举报理由，供管理后台 /admin-reports 查看处理。
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

  try {
    const kv = getKV(context);

    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('cf-connecting-ip') ||
                     request.headers.get('x-real-ip') || '127.0.0.1';
    // 同 IP 每小时最多 10 次举报，防滥用
    const rateCheck = await checkRateLimit(kv, `report:${clientIp}`, 10, 3600000);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: `举报过于频繁，请 ${Math.ceil((rateCheck.resetAt - Date.now()) / 60000)} 分钟后再试。`
      }), { status: 429, headers: corsHeaders() });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const code = String(body.code || '').trim();
    const reason = String(body.reason || '').trim().substring(0, 200);

    if (!/^[a-zA-Z0-9-_]{3,20}$/.test(code)) {
      return new Response(JSON.stringify({ error: '无效的短链地址。' }), {
        status: 400, headers: corsHeaders()
      });
    }

    const linkRaw = await kv.get(`link:${code}`);
    if (!linkRaw) {
      return new Response(JSON.stringify({ error: '该短链不存在或已被删除。' }), {
        status: 404, headers: corsHeaders()
      });
    }

    let link = null;
    try {
      link = typeof linkRaw === 'string' ? JSON.parse(linkRaw) : linkRaw;
    } catch (e) { /* 损坏记录也允许举报，记录原始值 */ }

    const id = randomHex(8);
    const record = {
      id,
      code,
      type: (link && link.type) === 'text' ? 'text' : 'url',
      // 目标内容：短链对应的长链接 / 文字内容（截断存储）
      url: (link && link.url) || '',
      text: (link && link.text) ? String(link.text).substring(0, 200) : '',
      linkCreatedAt: (link && link.createdAt) || null,
      owner: (link && link.owner) || null,
      reason: reason || '',
      createdAt: new Date().toISOString(),
      ip: clientIp
    };
    await kv.put(`report:${id}`, JSON.stringify(record));

    return new Response(JSON.stringify({
      success: true,
      message: '举报已提交，感谢您的反馈，我们会尽快核实处理。'
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
