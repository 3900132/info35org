/* EdgeLink 用户中心：当前用户的短链列表，客户端分页（默认每页 30 条，可输入每页数量） */

let ucToken = localStorage.getItem('edgelink_token') || '';
let ucUsername = '';
let ucLinks = [];
let ucPage = 1;
let ucPageSize = 30;

function ucEscapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ucShowToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.style.cssText = 'padding:12px 18px;border-radius:10px;margin-bottom:10px;font-size:0.9rem;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.35);';
  const colors = { success: 'rgba(50,215,75,0.9)', error: 'rgba(255,82,82,0.9)', warning: 'rgba(255,171,64,0.9)', info: 'rgba(76,201,240,0.9)' };
  toast.style.background = colors[type] || colors.info;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

async function ucInit() {
  if (!ucToken) { ucShowNotLoggedIn(); return; }
  try {
    const resp = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${ucToken}` } });
    if (!resp.ok) throw new Error('unauthorized');
    const data = await resp.json();
    ucUsername = data.username || localStorage.getItem('edgelink_username') || '';
  } catch (e) {
    // 登录状态已过期：清理并提示登录
    localStorage.removeItem('edgelink_token');
    localStorage.removeItem('edgelink_username');
    ucShowNotLoggedIn();
    return;
  }
  document.getElementById('notLoggedIn').classList.add('hidden');
  document.getElementById('userCenterMain').classList.remove('hidden');
  document.getElementById('ucDisplayName').textContent = ucUsername;
  await ucReload();
}

function ucShowNotLoggedIn() {
  document.getElementById('notLoggedIn').classList.remove('hidden');
  document.getElementById('userCenterMain').classList.add('hidden');
}

async function ucReload() {
  try {
    const resp = await fetch('/api/my/links', { headers: { 'Authorization': `Bearer ${ucToken}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');
    ucLinks = Array.isArray(data.links) ? data.links : [];
    ucPage = 1;
    ucRender();
  } catch (err) {
    document.getElementById('ucSummary').textContent = `加载失败：${err.message}`;
    ucShowToast(err.message, 'error');
  }
}

function ucReadPageSize() {
  const input = document.getElementById('ucPageSize');
  let size = parseInt(input.value, 10);
  if (!Number.isFinite(size) || size < 1) size = 30;
  if (size > 500) size = 500;
  input.value = size;
  return size;
}

function ucApplyPageSize() {
  const size = ucReadPageSize();
  if (size !== ucPageSize) {
    ucPageSize = size;
    ucPage = 1;
  }
  ucRender();
}

function ucChangePage(delta) {
  const totalPages = Math.max(1, Math.ceil(ucLinks.length / ucPageSize));
  const next = ucPage + delta;
  if (next < 1 || next > totalPages) return;
  ucPage = next;
  ucRender();
}

function ucRender() {
  // 页大小输入框变化时同步
  const size = ucReadPageSize();
  if (size !== ucPageSize) { ucPageSize = size; ucPage = 1; }

  const total = ucLinks.length;
  const totalPages = Math.max(1, Math.ceil(total / ucPageSize));
  if (ucPage > totalPages) ucPage = totalPages;

  const totalClicks = ucLinks.reduce((sum, l) => sum + (l.clicks || 0), 0);
  document.getElementById('ucSummary').textContent =
    `共 ${total} 条短链，累计点击 ${totalClicks} 次。`;

  const start = (ucPage - 1) * ucPageSize;
  const pageLinks = ucLinks.slice(start, start + ucPageSize);
  const listBody = document.getElementById('ucLinksList');

  if (total === 0) {
    listBody.innerHTML = '<tr class="empty-row"><td colspan="5">您还没有生成过短链，去首页创建第一条吧！</td></tr>';
  } else {
    listBody.innerHTML = '';
    for (const item of pageLinks) {
      const shortUrl = `${window.location.origin}/${encodeURIComponent(item.code)}`;
      const typeLabel = item.type === 'text' ? '📝 文字' : '🔗 链接';
      const content = item.type === 'text'
        ? `<span style="color: var(--text-secondary); font-style: italic;">${ucEscapeHtml((item.text || '').substring(0, 60))}</span>`
        : `<a href="${ucEscapeHtml(item.url)}" target="_blank" rel="noopener" class="link-url">${ucEscapeHtml(item.url)}</a>`;
      const created = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${ucEscapeHtml(shortUrl)}" target="_blank" rel="noopener" class="link-code">/${ucEscapeHtml(item.code)}</a></td>
        <td>${typeLabel}</td>
        <td title="${ucEscapeHtml(item.url || item.text || '')}">${content}</td>
        <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${item.clicks || 0} 次点击</span></td>
        <td><span class="date-text">${ucEscapeHtml(created)}</span></td>
      `;
      listBody.appendChild(row);
    }
  }

  document.getElementById('ucPageInfo').textContent = `第 ${ucPage} / ${totalPages} 页`;
  document.getElementById('ucBtnPrev').disabled = ucPage <= 1;
  document.getElementById('ucBtnNext').disabled = ucPage >= totalPages;
}

async function ucLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${ucToken}` } });
  } catch (e) { /* 本地清理为主 */ }
  localStorage.removeItem('edgelink_token');
  localStorage.removeItem('edgelink_username');
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ucPageSize').addEventListener('change', ucApplyPageSize);
  ucInit();
});
