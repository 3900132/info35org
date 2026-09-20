import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const j = r => r.json();
const post = (p, b, h = {}) => fetch('http://localhost:3000' + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b)
}).then(j);
const A = { 'Authorization': 'Bearer admin123' };
const out = [];

async function main() {
  // Part A: 禁止注册
  const r1 = await post('/api/admin/settings', { disableRegister: true }, A);
  out.push('1. ' + r1.message);
  const r2 = await post('/api/auth/register', { email: 'z@t.com', password: 'pass123', code: '123456' });
  out.push('2. 禁止注册时注册被拒: ' + r2.error);

  // Part B: 恢复注册（全新邮箱，避开同邮箱 60s 频控）
  const r4 = await post('/api/admin/settings', { disableRegister: false }, A);
  out.push('3. ' + r4.message);
  const s2 = await post('/api/auth/send-code', { email: 'newuser@t.com' });
  const r5 = await post('/api/auth/register', { email: 'newuser@t.com', password: 'pass123', code: s2.devCode });
  out.push('4. 恢复后注册: ' + r5.success + ' ' + (r5.message || r5.error || ''));
  const pub = await fetch('http://localhost:3000/api/settings').then(j);
  out.push('5. 公开设置 disableRegister: ' + pub.disableRegister);

  fs.writeFileSync(path.join(__dirname, 'test-out.txt'), out.join('\n'));
}
main().catch(e => { fs.writeFileSync(path.join(__dirname, 'test-out.txt'), 'FAILED: ' + e.message); });

