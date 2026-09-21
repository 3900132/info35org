import { getKV, corsHeaders, verifyAdminAuth, maybeCleanupExpiredLinks } from '../../lib/kv-helpers.js';

// 管理端：手动立即清理 KV 中的无用数据。
// POST /api/admin/cleanup
// 清理范围：过期短链（expiresAt 已过 / 访客短链超保留期）+ 已失效的限流计数键。
// force 跳过 6 小时节流标记；返回扫描与删除数量。
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
    const result = await maybeCleanupExpiredLinks(kv, { force: true });

    if (result.error) {
      return new Response(JSON.stringify({ error: `清理失败：${result.error}` }), {
        status: 500, headers: corsHeaders()
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `清理完成：扫描 ${result.scanned} 条短链，删除 ${result.deleted} 条过期短链、${result.ratelimitDeleted} 条失效限流记录、${result.statsDeleted} 条过期统计数据。`,
      ...result
    }), { status: 200, headers: corsHeaders() });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Internal Server Error: ${err.message}` }), {
      status: 500, headers: corsHeaders()
    });
  }
}
