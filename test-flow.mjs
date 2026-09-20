const j = r => r.json();
const post = (p, b, h = {}) => fetch('http://localhost:3000' + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b)
}).then(j);
const A = { 'Authorization': 'Bearer admin123' };

async function main() {
  const out = [];
  const r1 = await post('/api/admin/settings', { disableRegister: true }, A);
  out.push('1. ' + r1.message);
  const r2 = await post('/api/auth/send-code', { email: 'y@t.com' });
  const r3 = await post('/api/auth/register', { email: 'y@t.com', password: 'pass123', code: r2.devCode });
  out.push('2. 禁止注册时: ' + (r3.error || r3.success));
  await new Promise(s => setTimeout(s, 61000));
  const r4 = await post('/api/admin/settings', { disableRegister: false }, A);
  out.push('3. ' + r4.message);
  const r5 = await post('/api/auth/send-code', { email: 'y@t.com' });
  const r6 = await post('/api/auth/register', { email: 'y@t.com', password: 'pass123', code: r5.devCode });
  out.push('4. 恢复后注册: ' + r6.success + ' ' + (r6.message || r6.error || ''));
  require('fs').writeFileSync(__dirname + '/test-out.txt', out.join('\n'));
}
main().catch(e => { require('fs').writeFileSync(__dirname + '/test-out.txt', 'FAILED: ' + e.message); });
