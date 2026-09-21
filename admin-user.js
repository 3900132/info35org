/* EdgeLink 管理后台 - 用户短链明细页（/admin-user?username=xxx）
 * 替代原弹窗方案；客户端分页（默认每页 30 条，可输入每页数量） */

let auToken = sessionStorage.getItem('edgelink_admin_token') || '';
let auUsername = '';
let auLinks = [];
let auPage = 1;
let auPageSize = 30;

function auEscapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function auInit() {
  const username = new URLSearchParams(window.location.search).get('username') || '';
  if (!username || !auToken) {
    window.location.href = '/admin';
    return;
  }
  auUsername = username;
  document.getElementById('auDisplayName').textContent = auUsername;
  await auReload();
}

async function auReload() {
  const summaryEl = document.getElementById('auSummary');
  summaryEl.textContent = '加载中...';
  try {
    const resp = await fetch(`/api/admin/user-links?username=${encodeURIComponent(auUsername)}`, {
      headers: { 'Authorization': `Bearer ${auToken}` }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');

    auLinks = Array.isArray(data.links) ? data.links : [];
    auPage = 1;

    const registered = data.registeredAt ? `，注册于 ${new Date(data.registeredAt).toLocaleDateString('zh-CN')}` : '';
    summaryEl.textContent = `共 ${data.total || 0} 条短链，累计点击 ${data.totalClicks || 0} 次${registered}。`;
    auRender();
  } catch (err) {
    summaryEl.textContent = `加载失败：${err.message}`;
  }
}

function auReadPageSize() {
  const input = document.getElementById('auPageSize');
  let size = parseInt(input.value, 10);
  if (!Number.isFinite(size) || size < 1) size = 30;
  if (size > 500) size = 500;
  input.value = size;
  return size;
}

function auApplyPageSize() {
  const size = auReadPageSize();
  if (size !== auPageSize) {
    auPageSize = size;
    auPage = 1;
  }
  auRender();
}

function auChangePage(delta) {
  const totalPages = Math.max(1, Math.ceil(auLinks.length / auPageSize));
  const next = auPage + delta;
  if (next < 1 || next > totalPages) return;
  auPage = next;
  auRender();
}

function auRender() {
  const size = auReadPageSize();
  if (size !== auPageSize) { auPageSize = size; auPage = 1; }

  const total = auLinks.length;
  const totalPages = Math.max(1, Math.ceil(total / auPageSize));
  if (auPage > totalPages) auPage = totalPages;

  const listBody = document.getElementById('auLinksList');
  if (total === 0) {
    listBody.innerHTML = '<tr class="empty-row"><td colspan="5">该用户尚未生成任何短链。</td></tr>';
  } else {
    listBody.innerHTML = '';
    const start = (auPage - 1) * auPageSize;
    for (const item of auLinks.slice(start, start + auPageSize)) {
      const shortUrl = `${window.location.origin}/${encodeURIComponent(item.code)}`;
      const typeLabel = item.type === 'text' ? '📝 文字' : '🔗 链接';
      const content = item.type === 'text'
        ? `<span style="color: var(--text-secondary); font-style: italic;">${auEscapeHtml((item.text || '').substring(0, 60))}</span>`
        : `<a href="${auEscapeHtml(item.url)}" target="_blank" rel="noopener" class="link-url">${auEscapeHtml(item.url)}</a>`;
      const created = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${auEscapeHtml(shortUrl)}" target="_blank" rel="noopener" class="link-code">/${auEscapeHtml(item.code)}</a></td>
        <td>${typeLabel}</td>
        <td title="${auEscapeHtml(item.url || item.text || '')}">${content}</td>
        <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${item.clicks || 0} 次点击</span></td>
        <td><span class="date-text">${auEscapeHtml(created)}</span></td>
      `;
      listBody.appendChild(row);
    }
  }

  document.getElementById('auPageInfo').textContent = `第 ${auPage} / ${totalPages} 页`;
  document.getElementById('auBtnPrev').disabled = auPage <= 1;
  document.getElementById('auBtnNext').disabled = auPage >= totalPages;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auPageSize').addEventListener('change', auApplyPageSize);
  auInit();
});
