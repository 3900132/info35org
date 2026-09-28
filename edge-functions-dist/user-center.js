/* EdgeLink 用户中心：当前用户的短链列表，客户端分页（默认每页 30 条，可输入每页数量），支持复制/二维码/编辑短链内容 */

let ucToken = localStorage.getItem('edgelink_token') || '';
let ucUsername = '';
let ucLinks = [];
let ucPage = 1;
let ucPageSize = 30;
let ucEditingCode = '';

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

async function ucReload(keepPage = false) {
  try {
    const resp = await fetch('/api/my/links', { headers: { 'Authorization': `Bearer ${ucToken}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');
    ucLinks = Array.isArray(data.links) ? data.links : [];
    if (!keepPage) ucPage = 1;
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
    listBody.innerHTML = '<tr class="empty-row"><td colspan="7">您还没有生成过短链，去首页创建第一条吧！</td></tr>';
  } else {
    listBody.innerHTML = '';
    for (const item of pageLinks) {
      const shortUrl = `${window.location.origin}/${encodeURIComponent(item.code)}`;
      const typeLabel = item.type === 'text'
        ? '<span class="type-badge text-note" style="background: rgba(190, 100, 50, 0.08); color: var(--accent-color); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(190, 100, 50, 0.2);">📝 文字</span>'
        : '<span class="type-badge text-url" style="background: rgba(145, 80, 46, 0.08); color: var(--success-color); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(145, 80, 46, 0.2);">🔗 链接</span>';
      const content = item.type === 'text'
        ? `<span style="color: var(--text-secondary); font-style: italic;">${ucEscapeHtml((item.text || '').substring(0, 60))}</span>`
        : `<a href="${ucEscapeHtml(item.url)}" target="_blank" rel="noopener" class="link-url">${ucEscapeHtml(item.url)}</a>`;

      // 状态与次数限制展示逻辑与首页"本地历史记录"一致
      const clicks = item.clicks || 0;
      const viewLimit = item.viewLimit;
      const isDestroyed = viewLimit && (clicks >= viewLimit);

      let statusLabel = '';
      if (isDestroyed) {
        statusLabel = '<span class="status-badge" style="background: rgba(255, 69, 58, 0.1); color: var(--danger-color); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(255, 69, 58, 0.2);">已销毁</span>';
      } else if (clicks > 0) {
        statusLabel = '<span class="status-badge" style="background: rgba(50, 215, 75, 0.1); color: var(--success-color); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(50, 215, 75, 0.2);">已查看</span>';
      } else {
        statusLabel = '<span class="status-badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid var(--border-color);">未查看</span>';
      }

      let expiresLabel = '';
      if (item.expiresAt) {
        const expires = new Date(item.expiresAt);
        const now = new Date();
        if (expires <= now) {
          expiresLabel = ' <span style="color:var(--danger-color);font-size:0.75rem;">⏰ 已过期</span>';
        } else {
          const daysLeft = Math.ceil((expires - now) / 86400000);
          expiresLabel = ` <span style="color:var(--accent-color);font-size:0.75rem;">⏰ ${daysLeft}天后到期</span>`;
        }
      }

      const limitLabel = viewLimit
        ? `<span class="limit-badge" style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary);">${clicks} / ${viewLimit}</span>`
        : `<span class="limit-badge" style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary);">${clicks} / 无限制</span>`;

      const created = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${ucEscapeHtml(shortUrl)}" target="_blank" rel="noopener" class="link-code">/${ucEscapeHtml(item.code)}</a></td>
        <td>${typeLabel}</td>
        <td title="${ucEscapeHtml(item.url || item.text || '')}">${content}</td>
        <td>${statusLabel}${expiresLabel}</td>
        <td>${limitLabel}</td>
        <td><span class="date-text">${ucEscapeHtml(created)}</span></td>
        <td>
          <div class="row-actions">
            <button onclick="ucCopyText('${shortUrl}')" class="btn btn-secondary btn-small">复制</button>
            <button onclick="ucShowQRCode('${shortUrl}', '${item.code}')" class="btn btn-secondary btn-small">二维码</button>
            <button onclick="ucOpenEditModal('${item.code}')" class="btn btn-secondary btn-small">编辑</button>
          </div>
        </td>
      `;
      listBody.appendChild(row);
    }
  }

  document.getElementById('ucPageInfo').textContent = `第 ${ucPage} / ${totalPages} 页`;
  document.getElementById('ucBtnPrev').disabled = ucPage <= 1;
  document.getElementById('ucBtnNext').disabled = ucPage >= totalPages;
}

/* ---- 行操作：复制 / 二维码 ---- */
function ucCopyText(text) {
  const tempInput = document.createElement('input');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try {
    document.execCommand('copy');
    ucShowToast('复制链接成功！', 'success');
  } catch (e) {
    ucShowToast('复制失败', 'error');
  }
  document.body.removeChild(tempInput);
}

function ucShowQRCode(shortUrl, code) {
  const container = document.getElementById('ucQrcodeContainer');
  document.getElementById('ucQrUrlText').textContent = shortUrl;
  document.getElementById('ucQrModal').classList.remove('hidden');
  container.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    new QRCode(container, {
      text: shortUrl,
      width: 220,
      height: 220,
      colorDark: '#0f141e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('ucBtnDownloadQR').onclick = () => {
      const canvas = container.querySelector('canvas');
      const img = container.querySelector('img');
      const link = document.createElement('a');
      link.download = `edgelink-${code}-qr.png`;
      if (canvas) {
        link.href = canvas.toDataURL('image/png');
        link.click();
        ucShowToast('二维码已开始下载', 'success');
      } else if (img && img.src && img.src.startsWith('data:')) {
        link.href = img.src;
        link.click();
        ucShowToast('二维码已开始下载', 'success');
      } else {
        ucShowToast('未找到可下载的二维码，请重试', 'error');
      }
    };
  } else {
    container.innerHTML = '<span style="color:red">二维码库正在加载，请重试</span>';
  }
}

function ucCloseQRModal() {
  document.getElementById('ucQrModal').classList.add('hidden');
}

/* ---- 行操作：编辑短链内容 ---- */
function ucOpenEditModal(code) {
  const item = ucLinks.find(l => l.code === code);
  if (!item) return;
  ucEditingCode = code;
  const current = (item.url || item.text || '').substring(0, 80);
  document.getElementById('editShortCodeText').innerHTML =
    `短地址 <span class="link-code">/${ucEscapeHtml(code)}</span>，当前内容：<span style="color:var(--text-secondary);">${ucEscapeHtml(current)}</span>`;
  document.getElementById('editContentInput').value = item.url || item.text || '';
  document.getElementById('editModal').classList.remove('hidden');
  document.getElementById('editContentInput').focus();
}

function ucCloseEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  ucEditingCode = '';
}

async function ucSaveEdit() {
  if (!ucEditingCode) return;
  const content = document.getElementById('editContentInput').value.trim();
  if (!content) {
    ucShowToast('请输入新的原始链接或文字内容', 'warning');
    return;
  }

  const btn = document.getElementById('btnSaveEdit');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const resp = await fetch('/api/my/update', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ucToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: ucEditingCode, url: content })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '保存失败');

    ucCloseEditModal();
    ucShowToast('短链内容已更新', 'success');
    await ucReload(true);
  } catch (err) {
    ucShowToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '保存修改';
  }
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
