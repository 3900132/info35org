// 单元验证：惰性清理引擎 + [code].js 保留期校验与跳转延时注入
import { maybeCleanupExpiredLinks, isLinkExpired } from './edge-functions/lib/kv-helpers.js';
import redirectHandler from './edge-functions/[code].js';

const DAY = 86400000;
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

function makeKV() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    async delete(k) { store.delete(k); },
    async list(opts = {}) {
      const prefix = opts.prefix || '';
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }));
      return { keys, list_complete: true };
    }
  };
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail}`); }
}

// ---------- 1. isLinkExpired ----------
check('isLinkExpired: 过期 expiresAt', isLinkExpired({ expiresAt: iso(1000) }, null) === true);
check('isLinkExpired: 未过期 expiresAt', isLinkExpired({ expiresAt: new Date(now + DAY).toISOString() }, null) === false);
check('isLinkExpired: 访客超保留期', isLinkExpired({ createdAt: iso(8 * DAY) }, now - 7 * DAY) === true);
check('isLinkExpired: 访客未超保留期', isLinkExpired({ createdAt: iso(6 * DAY) }, now - 7 * DAY) === false);
check('isLinkExpired: 注册用户不受保留期影响', isLinkExpired({ owner: 'u', createdAt: iso(30 * DAY) }, now - 7 * DAY) === false);
check('isLinkExpired: 无 createdAt 的访客不误删', isLinkExpired({}, now - 7 * DAY) === false);
check('isLinkExpired: retention=0(cutoff null) 不清理', isLinkExpired({ createdAt: iso(100 * DAY) }, null) === false);

// ---------- 2. maybeCleanupExpiredLinks ----------
{
  const kv = makeKV();
  await kv.put('settings:site', JSON.stringify({ guestLinkRetentionDays: 7 }));
  const mk = (over) => JSON.stringify({ type: 'url', url: 'https://a.com', code: 'x', clicks: 0, ...over });
  await kv.put('link:oldguest', mk({ code: 'oldguest', createdAt: iso(8 * DAY) }));
  await kv.put('link:fresh', mk({ code: 'fresh', createdAt: iso(1 * DAY) }));
  await kv.put('link:owned', mk({ code: 'owned', owner: 'u@x.com', createdAt: iso(30 * DAY) }));
  await kv.put('link:expiredttl', mk({ code: 'expiredttl', owner: 'u@x.com', createdAt: iso(1 * DAY), expiresAt: iso(1000) }));
  await kv.put('link:futurettl', mk({ code: 'futurettl', createdAt: iso(8 * DAY), expiresAt: new Date(now + DAY).toISOString() }));
  await kv.put('link:nocreated', mk({ code: 'nocreated' }));

  const r1 = await maybeCleanupExpiredLinks(kv);
  check('清理: 删除 3 条（老访客 + 过期ttl + 超保留期的长ttl访客）', r1.deleted === 3, JSON.stringify(r1));
  check('清理: 保留 fresh/owned/nocreated',
    ['link:fresh', 'link:owned', 'link:nocreated'].every(k => kv.store.has(k)) &&
    !kv.store.has('link:oldguest') && !kv.store.has('link:expiredttl') && !kv.store.has('link:futurettl'));

  const r2 = await maybeCleanupExpiredLinks(kv);
  check('清理: 6 小时节流，第二次跳过', r2.skipped === true, JSON.stringify(r2));

  const r2f = await maybeCleanupExpiredLinks(kv, { force: true });
  check('清理: force 跳过节流强制执行', r2f.skipped === undefined && typeof r2f.deleted === 'number', JSON.stringify(r2f));

  // 顺带清理失效限流键：构造一个 resetAt 已过去 2 小时的记录
  await kv.put('ratelimit:stale-test', JSON.stringify({ count: 3, resetAt: now - 2 * 3600000 }));
  await kv.put('ratelimit:live-test', JSON.stringify({ count: 1, resetAt: now + 3600000 }));
  // 过期统计：趋势图只读近 7 天，30 天前的统计应被清理
  await kv.put('stats:clicks:2026-08-01', JSON.stringify({ date: '2026-08-01', total: 5, links: 1 }));
  await kv.put('stats:clicks:2026-08-25', JSON.stringify({ date: '2026-08-25', total: 2, links: 1 }));
  const r2r = await maybeCleanupExpiredLinks(kv, { force: true });
  check('清理: 失效限流键被清除、活跃限流键保留',
    !kv.store.has('ratelimit:stale-test') && kv.store.has('ratelimit:live-test') && r2r.ratelimitDeleted === 1, JSON.stringify(r2r));
  check('清理: 30 天前的统计被清除、30 天内的保留',
    !kv.store.has('stats:clicks:2026-08-01') && kv.store.has('stats:clicks:2026-08-25') && r2r.statsDeleted === 1, JSON.stringify(r2r));

  // 清掉标记 + retention=0 → 老访客保留
  await kv.delete('meta:lastCleanup');
  await kv.put('settings:site', JSON.stringify({ guestLinkRetentionDays: 0 }));
  const r3 = await maybeCleanupExpiredLinks(kv);
  check('清理: retention=0 不清理访客短链', kv.store.has('link:fresh') || r3.deleted === 0, JSON.stringify(r3));
}

// ---------- 3. [code].js 访问时保留期校验 + 延时注入 ----------
function makeContext(kv, code, url = 'http://localhost:3000/') {
  const waited = [];
  return {
    ctx: {
      request: { method: 'GET', url, headers: { get: () => null } },
      params: { code },
      env: { goinfo35org: kv },
      waitUntil: (p) => waited.push(p)
    },
    waited
  };
}

{
  const kv = makeKV();
  await kv.put('settings:site', JSON.stringify({ guestLinkRetentionDays: 7, redirectDelaySeconds: 5 }));
  await kv.put('link:oldguest', JSON.stringify({ type: 'url', url: 'https://old.example.com', code: 'oldguest', createdAt: iso(8 * DAY), clicks: 0 }));
  const { ctx } = makeContext(kv, 'oldguest');
  const res = await redirectHandler(ctx);
  const body = await res.text();
  check('访问: 超期访客短链返回 404', res.status === 404 && body.includes('内容不可用'), `status=${res.status}`);
  check('访问: 超期访客短链已从 KV 删除', !kv.store.has('link:oldguest'));

  await kv.put('link:live', JSON.stringify({ type: 'url', url: 'https://live.example.com', code: 'live', createdAt: iso(1 * DAY), clicks: 0 }));
  const ctx2 = makeContext(kv, 'live').ctx;
  const res2 = await redirectHandler(ctx2);
  const body2 = await res2.text();
  check('访问: 正常短链 200 且注入 5 秒倒计时', res2.status === 200 && body2.includes('id="countdown"') && body2.includes('const delaySeconds = 5') && body2.includes('立即跳转'), `status=${res2.status}`);
  check('访问: 倒计时文案正确', body2.includes('秒后自动跳转'));

  // retention=0 时老访客链接可访问
  await kv.put('settings:site', JSON.stringify({ guestLinkRetentionDays: 0, redirectDelaySeconds: 0 }));
  await kv.put('link:aged', JSON.stringify({ type: 'url', url: 'https://aged.example.com', code: 'aged', createdAt: iso(100 * DAY), clicks: 0 }));
  const ctx3 = makeContext(kv, 'aged').ctx;
  const res3 = await redirectHandler(ctx3);
  const body3 = await res3.text();
  check('访问: retention=0 时超龄访客短链仍可访问', res3.status === 200, `status=${res3.status}`);
  check('访问: delay=0 时立即跳转（脚本提前返回，不启动倒计时）', body3.includes('const delaySeconds = 0') && body3.includes('if (delaySeconds <= 0)'));

  // 注册用户老链接不受影响
  await kv.put('settings:site', JSON.stringify({ guestLinkRetentionDays: 7, redirectDelaySeconds: 3 }));
  await kv.put('link:oldowned', JSON.stringify({ type: 'url', url: 'https://own.example.com', code: 'oldowned', owner: 'u@x.com', createdAt: iso(30 * DAY), clicks: 0 }));
  const ctx4 = makeContext(kv, 'oldowned').ctx;
  const res4 = await redirectHandler(ctx4);
  check('访问: 注册用户老短链正常访问', res4.status === 200, `status=${res4.status}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
