/* EdgeLink 管理后台 - 举报反馈页（/admin-reports）
 * 展示用户通过跳转中间页提交的举报；客户端分页（默认每页 30 条，可输入每页数量） */

let arToken = sessionStorage.getItem('edgelink_admin_token') || '';
let arReports = [];
let arPage = 1;
let arPageSize = 30;

function arEscapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function arShowToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.style.cssText = 'padding:12px 18px;border-radius:10px;margin-bottom:10px;font-size:0.9rem;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.35);';
  const colors = { success: 'rgba(50,215,75,0.9)', error: 'rgba(255,82,82,0.9)', warning: 'rgba(255,171,64,0.9)', info: 'rgba(76,201,240,0.9)' };
  toast.style.background = colors[type] || colors.info;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

async function arInit() {
  if (!arToken) {
    window.location.href = '/admin';
    return;
  }
  await arReload();
}

async function arReload() {
  const summaryEl = document.getElementById('arSummary');
  summaryEl.textContent = '加载中...';
  try {
    const resp = await fetch('/api/admin/reports', {
      headers: { 'Authorization': `Bearer ${arToken}` }
    });
    if (resp.status === 401 || resp.status === 403) {
      sessionStorage.removeItem('edgelink_admin_token');
      sessionStorage.removeItem('edgelink_admin_expiry');
      window.location.href = '/admin';
      return;
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');
    arReports = Array.isArray(data.reports) ? data.reports : [];
    arPage = 1;
    summaryEl.textContent = `共 ${data.total || 0} 条举报记录。`;
    arRender();
  } catch (err) {
    summaryEl.textContent = `加载失败：${err.message}`;
  }
}

function arReadPageSize() {
  const input = document.getElementById('arPageSize');
  let size = parseInt(input.value, 10);
  if (!Number.isFinite(size) || size < 1) size = 30;
  if (size > 500) size = 500;
  input.value = size;
  return size;
}

function arApplyPageSize() {
  const size = arReadPageSize();
  if (size !== arPageSize) {
    arPageSize = size;
    arPage = 1;
  }
  arRender();
}

function arChangePage(delta) {
  const totalPages = Math.max(1, Math.ceil(arReports.length / arPageSize));
  const next = arPage + delta;
  if (next < 1 || next > totalPages) return;
  arPage = next;
  arRender();
}

function arRender() {
  const size = arReadPageSize();
  if (size !== arPageSize) { arPageSize = size; arPage = 1; }

  const total = arReports.length;
  const totalPages = Math.max(1, Math.ceil(total / arPageSize));
  if (arPage > totalPages) arPage = totalPages;

  const listBody = document.getElementById('arReportsList');
  if (total === 0) {
    listBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无举报记录。</td></tr>';
  } else {
    listBody.innerHTML = '';
    const start = (arPage - 1) * arPageSize;
    for (const item of arReports.slice(start, start + arPageSize)) {
      const shortUrl = `${window.location.origin}/${encodeURIComponent(item.code)}`;
      const content = item.type === 'text'
        ? `<span style="color: var(--text-secondary); font-style: italic;">${arEscapeHtml((item.text || '').substring(0, 80))}</span>`
        : `<a href="${arEscapeHtml(item.url)}" target="_blank" rel="noopener" class="link-url">${arEscapeHtml(item.url)}</a>`;
      const created = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${arEscapeHtml(shortUrl)}" target="_blank" rel="noopener" class="link-code">/${arEscapeHtml(item.code)}</a></td>
        <td title="${arEscapeHtml(item.url || item.text || '')}">${content}</td>
        <td style="max-width:260px;">${arEscapeHtml(item.reason || '（未填写原因）')}</td>
        <td><span class="date-text">${arEscapeHtml(created)}</span></td>
        <td>
          <div class="row-actions">
            <button onclick="arDelete('${arEscapeHtml(item.id)}')" class="btn btn-danger btn-small">删除记录</button>
          </div>
        </td>
      `;
      listBody.appendChild(row);
    }
  }

  document.getElementById('arPageInfo').textContent = `第 ${arPage} / ${totalPages} 页`;
  document.getElementById('arBtnPrev').disabled = arPage <= 1;
  document.getElementById('arBtnNext').disabled = arPage >= totalPages;
}

async function arDelete(id) {
  if (!confirm('确定删除这条举报记录？')) return;
  try {
    const resp = await fetch('/api/admin/report-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${arToken}` },
      body: JSON.stringify({ id })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '删除失败');
    arShowToast(data.message || '已删除', 'success');
    arReports = arReports.filter(item => item.id !== id);
    document.getElementById('arSummary').textContent = `共 ${arReports.length} 条举报记录。`;
    arRender();
  } catch (err) {
    arShowToast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('arPageSize').addEventListener('change', arApplyPageSize);
  arInit();
});
