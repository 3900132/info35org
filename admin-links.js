/* EdgeLink 管理后台 - 所有短链接页（/admin-links）
 * 从仪表盘拆出的独立页面：加载全部短链后客户端分页（默认每页 30 条，可输入每页数量），
 * 支持搜索过滤、批量删除、单条删除、复制、二维码、文字预览与 CSV 导出。 */

let alToken = sessionStorage.getItem('edgelink_admin_token') || '';
let alLinks = [];
let alPage = 1;
let alPageSize = 30;
let alFilterQuery = '';
let alActivePreviewText = '';

function alEscapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function alShowToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.style.cssText = 'padding:12px 18px;border-radius:10px;margin-bottom:10px;font-size:0.9rem;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.35);';
  const colors = { success: 'rgba(50,215,75,0.9)', error: 'rgba(255,82,82,0.9)', warning: 'rgba(255,171,64,0.9)', info: 'rgba(76,201,240,0.9)' };
  toast.style.background = colors[type] || colors.info;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function alCopyText(text) {
  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try { document.execCommand('copy'); alShowToast('复制成功！', 'success'); } catch (e) { alShowToast('复制失败', 'error'); }
  document.body.removeChild(tempInput);
}

async function alInit() {
  if (!alToken) {
    window.location.href = '/admin';
    return;
  }
  await alReload();
}

// 逐页跟随游标加载全部短链（/api/admin/list 单次上限 100 条）
async function alReload() {
  const summaryEl = document.getElementById('alSummary');
  summaryEl.textContent = '正在加载 KV 数据...';
  try {
    const all = [];
    let cursor = null;
    let authFailed = false;
    do {
      const resp = await fetch(`/api/admin/list?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {
        headers: { 'Authorization': `Bearer ${alToken}` }
      });
      if (resp.status === 401 || resp.status === 403) { authFailed = true; break; }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '加载失败');
      for (const link of (data.links || [])) {
        if (link && link.code) all.push(link);
      }
      cursor = data.cursor || null;
    } while (cursor);

    if (authFailed) {
      sessionStorage.removeItem('edgelink_admin_token');
      sessionStorage.removeItem('edgelink_admin_expiry');
      window.location.href = '/admin';
      return;
    }

    alLinks = all;
    alPage = 1;
    summaryEl.textContent = `共 ${alLinks.length} 条短链，累计点击 ${alLinks.reduce((s, l) => s + (l.clicks || 0), 0)} 次。`;
    alRender();
  } catch (err) {
    summaryEl.textContent = `加载失败：${err.message}`;
    alShowToast(err.message, 'error');
  }
}

function alReadPageSize() {
  const input = document.getElementById('alPageSize');
  let size = parseInt(input.value, 10);
  if (!Number.isFinite(size) || size < 1) size = 30;
  if (size > 500) size = 500;
  input.value = size;
  return size;
}

function alApplyPageSize() {
  const size = alReadPageSize();
  if (size !== alPageSize) {
    alPageSize = size;
    alPage = 1;
  }
  alRender();
}

function alChangePage(delta) {
  const totalPages = Math.max(1, Math.ceil(alFiltered().length / alPageSize));
  const next = alPage + delta;
  if (next < 1 || next > totalPages) return;
  alPage = next;
  alRender();
}

function alFiltered() {
  if (!alFilterQuery) return alLinks;
  const q = alFilterQuery.toLowerCase();
  return alLinks.filter(item =>
    item.code.toLowerCase().includes(q) ||
    (item.url && item.url.toLowerCase().includes(q)) ||
    (item.text && item.text.toLowerCase().includes(q))
  );
}

function alFilter() {
  alFilterQuery = document.getElementById('alSearchInput').value.trim();
  alPage = 1;
  alRender();
}

function alToggleSelectAll(master) {
  document.querySelectorAll('.al-link-checkbox').forEach(cb => { cb.checked = master.checked; });
  alUpdateSelectedCount();
}

function alUpdateSelectedCount() {
  const count = document.querySelectorAll('.al-link-checkbox:checked').length;
  document.getElementById('alSelectedCount').textContent = count;
  document.getElementById('alBtnBulkDelete').classList.toggle('hidden', count === 0);
}

async function alBulkDelete() {
  const checked = document.querySelectorAll('.al-link-checkbox:checked');
  const codes = Array.from(checked).map(cb => cb.value);
  if (codes.length === 0) return;
  if (!confirm(`确定永久删除选中的 ${codes.length} 个链接？`)) return;
  try {
    const resp = await fetch('/api/admin/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alToken}` },
      body: JSON.stringify({ codes })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '批量删除失败');
    alShowToast(`已删除 ${data.deleted.length} 个链接`, 'success');
    alLinks = alLinks.filter(item => !data.deleted.includes(item.code));
    alRender();
  } catch (err) {
    alShowToast(err.message, 'error');
  }
}

async function alDeleteLink(code) {
  if (!confirm(`确定永久删除 /${code}？`)) return;
  try {
    const resp = await fetch('/api/admin/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alToken}` },
      body: JSON.stringify({ code })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '删除失败');
    alShowToast(`/${code} 已删除`, 'success');
    alLinks = alLinks.filter(item => item.code !== code);
    alRender();
  } catch (err) {
    alShowToast(err.message, 'error');
  }
}

function alRender() {
  const size = alReadPageSize();
  if (size !== alPageSize) { alPageSize = size; alPage = 1; }

  const filtered = alFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / alPageSize));
  if (alPage > totalPages) alPage = totalPages;

  const listBody = document.getElementById('alLinksList');
  const selectAll = document.getElementById('alSelectAll');
  if (selectAll) selectAll.checked = false;
  alUpdateSelectedCount();

  if (filtered.length === 0) {
    listBody.innerHTML = `<tr class="empty-row"><td colspan="8">${alFilterQuery ? '没有匹配的短链' : 'KV 中暂无短链'}</td></tr>`;
  } else {
    const start = (alPage - 1) * alPageSize;
    const shown = filtered.slice(start, start + alPageSize);
    listBody.innerHTML = '';
    const origin = window.location.origin;

    for (const item of shown) {
      const shortUrl = `${origin}/${item.code}`;
      let dateStr = 'Unknown';
      if (item.createdAt) {
        const d = new Date(item.createdAt);
        dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const typeLabel = item.type === 'text'
        ? '<span style="background: rgba(190,100,50,0.08);color:var(--accent-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(190,100,50,0.2);font-weight:600;">Text</span>'
        : '<span style="background: rgba(145,80,46,0.08);color:var(--success-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(145,80,46,0.2);font-weight:600;">Link</span>';
      const displayContent = item.type === 'text'
        ? `<span style="color:var(--text-secondary);font-style:italic;font-family:var(--font-mono);font-size:0.85rem;cursor:pointer;" onclick="alPreviewText('${alEscapeHtml(item.code)}')" title="点击预览">${alEscapeHtml((item.text || '').length > 40 ? item.text.substring(0, 40) + '...' : item.text)}</span>`
        : `<a href="${alEscapeHtml(item.url)}" target="_blank" rel="noopener" class="link-url">${alEscapeHtml(item.url)}</a>`;
      const clicks = item.clicks || 0;
      const viewLimit = item.viewLimit;
      const isDestroyed = viewLimit && (clicks >= viewLimit);
      const statusLabel = isDestroyed
        ? '<span style="background:rgba(255,69,58,0.1);color:var(--danger-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(255,69,58,0.2);font-weight:600;">Destroyed</span>'
        : clicks > 0
          ? '<span style="background:rgba(50,215,75,0.1);color:var(--success-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(50,215,75,0.2);font-weight:600;">Viewed</span>'
          : '<span style="background:rgba(255,255,255,0.05);color:var(--text-muted);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid var(--border-color);font-weight:600;">Unviewed</span>';
      const limitLabel = `<span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text-secondary);font-weight:600;">${clicks} / ${viewLimit || 'Unlimited'}</span>`;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align:center;"><input type="checkbox" class="al-link-checkbox" value="${alEscapeHtml(item.code)}" onchange="alUpdateSelectedCount()" style="cursor:pointer;"></td>
        <td><a href="${alEscapeHtml(shortUrl)}" target="_blank" rel="noopener" class="link-code">/${alEscapeHtml(item.code)}</a></td>
        <td>${typeLabel}</td>
        <td title="${alEscapeHtml(item.url || item.text || '')}">${displayContent}</td>
        <td>${statusLabel} <span class="clicks-badge" style="padding:1px 6px;font-size:0.75rem;">${clicks}x</span></td>
        <td>${limitLabel}</td>
        <td><span class="date-text">${alEscapeHtml(dateStr)}</span></td>
        <td>
          <div class="row-actions">
            ${item.type === 'text' ? `<button onclick="alPreviewText('${alEscapeHtml(item.code)}')" class="btn btn-secondary btn-small">查看</button>` : ''}
            <button onclick="alCopyText('${alEscapeHtml(shortUrl)}')" class="btn btn-secondary btn-small">复制</button>
            <button onclick="alShowQR('${alEscapeHtml(shortUrl)}','${alEscapeHtml(item.code)}')" class="btn btn-secondary btn-small">二维码</button>
            <button onclick="alDeleteLink('${alEscapeHtml(item.code)}')" class="btn btn-danger btn-small">删除</button>
          </div>
        </td>`;
      listBody.appendChild(row);
    }
  }

  document.getElementById('alPageInfo').textContent = `第 ${alPage} / ${totalPages} 页`;
  document.getElementById('alBtnPrev').disabled = alPage <= 1;
  document.getElementById('alBtnNext').disabled = alPage >= totalPages;
}

/* ---------- 文字预览 ---------- */

function alPreviewText(code) {
  const item = alLinks.find(link => link.code === code);
  if (!item) return;
  alActivePreviewText = item.text || '';
  document.getElementById('alPreviewText').textContent = alActivePreviewText;
  const clicks = item.clicks || 0;
  const limit = item.viewLimit;
  const isDestroyed = limit && (clicks >= limit);
  const badge = document.getElementById('alPreviewBadge');
  if (limit) {
    badge.textContent = isDestroyed
      ? `已销毁/过期（${clicks}/${limit}）`
      : `阅后即焚（剩余 ${limit - clicks}，共 ${limit}）`;
    badge.style.color = isDestroyed ? 'var(--danger-color)' : 'var(--accent-color)';
  } else {
    badge.textContent = `文字分享（已查看 ${clicks} / 无限制）`;
    badge.style.color = 'var(--success-color)';
  }
  document.getElementById('previewModal').classList.remove('hidden');
}

function alClosePreview() {
  document.getElementById('previewModal').classList.add('hidden');
  alActivePreviewText = '';
}

function alCopyPreview() {
  if (alActivePreviewText) alCopyText(alActivePreviewText);
}

/* ---------- 二维码 ---------- */

function alShowQR(shortUrl, code) {
  const container = document.getElementById('qrcodeContainer');
  const qrUrlText = document.getElementById('qrUrlText');
  const btnDownloadQR = document.getElementById('btnDownloadQR');
  container.innerHTML = '';
  qrUrlText.textContent = shortUrl;
  document.getElementById('qrModal').classList.remove('hidden');
  if (typeof QRCode !== 'undefined') {
    new QRCode(container, {
      text: shortUrl, width: 220, height: 220,
      colorDark: '#0f141e', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    btnDownloadQR.onclick = () => {
      const canvas = container.querySelector('canvas');
      const img = container.querySelector('img');
      const link = document.createElement('a');
      link.download = `edgelink-${code}-qr.png`;
      if (canvas) { link.href = canvas.toDataURL('image/png'); link.click(); alShowToast('二维码已下载', 'success'); }
      else if (img && img.src && img.src.startsWith('data:')) { link.href = img.src; link.click(); alShowToast('二维码已下载', 'success'); }
      else alShowToast('二维码不可用', 'error');
    };
  } else {
    container.innerHTML = '<span style="color:red">二维码库加载失败</span>';
  }
}

function alCloseQRModal() {
  document.getElementById('qrModal').classList.add('hidden');
}

/* ---------- CSV 导出 ---------- */

function alExportCSV() {
  const source = alFiltered();
  if (!source || source.length === 0) {
    alShowToast('没有可导出的数据', 'warning');
    return;
  }
  const BOM = '\uFEFF';
  const headers = ['短地址', '类型', '原始链接', '点击数', '查看限制', '过期时间', '创建时间'];
  const rows = source.map(item => {
    const type = item.type === 'text' ? '文字' : '链接';
    const content = item.type === 'text' ? (item.text || '') : (item.url || '');
    const limit = item.viewLimit || '无限制';
    const expires = item.expiresAt || '永不过期';
    let created = '';
    if (item.createdAt) {
      created = new Date(item.createdAt).toLocaleString('zh-CN');
    }
    return [item.code, type, content, item.clicks || 0, limit, expires, created];
  });
  const csvContent = BOM + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `edgelink-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  alShowToast(`已导出 ${source.length} 条记录`, 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('alPageSize').addEventListener('change', alApplyPageSize);
  alInit();
});
