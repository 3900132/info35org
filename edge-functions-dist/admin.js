/* ----------------------------------------------------
 * EdgeLink Admin Panel Logic
 * Handles admin session, list query, deletion, stats & trends.
 * ---------------------------------------------------- */

let adminLinks = [];
let activeAdminToken = '';
let adminTokenExpiry = 0;
const TOKEN_TTL = 30 * 60 * 1000;

let adminCursor = null;
let adminFilterQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  const stored = sessionStorage.getItem('edgelink_admin_token');
  const storedExpiry = sessionStorage.getItem('edgelink_admin_expiry');
  if (stored && storedExpiry) {
    const expiry = parseInt(storedExpiry, 10);
    if (Date.now() < expiry) {
      activeAdminToken = stored;
      adminTokenExpiry = expiry;
      document.getElementById('adminToken').value = stored;
      attemptAdminLogin(stored);
    } else {
      sessionStorage.removeItem('edgelink_admin_token');
      sessionStorage.removeItem('edgelink_admin_expiry');
    }
  }
});

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span style="flex:1;">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => { toast.remove(); });
  }, duration);
}

function copyText(text) {
  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try { document.execCommand('copy'); showToast('复制成功！', 'success'); } catch (e) { showToast('复制失败', 'error'); }
  document.body.removeChild(tempInput);
}

/* ----------------------------------------------------
 * ADMIN CONTROLLER
 * ---------------------------------------------------- */

function handleAdminLogin(e) {
  e.preventDefault();
  const token = document.getElementById('adminToken').value.trim();
  attemptAdminLogin(token);
}

async function attemptAdminLogin(token) {
  const adminAuthCard = document.getElementById('adminAuthCard');
  const adminConsole = document.getElementById('adminConsole');

  try {
    const response = await fetch('/api/admin/list?limit=50', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Verification failed');

    activeAdminToken = token;
    adminTokenExpiry = Date.now() + TOKEN_TTL;

    sessionStorage.setItem('edgelink_admin_token', token);
    sessionStorage.setItem('edgelink_admin_expiry', String(adminTokenExpiry));

    adminAuthCard.classList.add('hidden');
    adminConsole.classList.remove('hidden');

    adminLinks = result.links || [];
    adminCursor = result.cursor || null;
    document.getElementById('statTotalLinks').textContent = result.total || adminLinks.length;
    updateTotalClicks();
    renderAdminLinks();
    loadTrendChart();
    loadSiteSettings();
    loadAdminUsers();
    showToast('管理员验证成功', 'success');

  } catch (err) {
    showToast(err.message, 'error');
    sessionStorage.removeItem('edgelink_admin_token');
    sessionStorage.removeItem('edgelink_admin_expiry');
    activeAdminToken = '';
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem('edgelink_admin_token');
  sessionStorage.removeItem('edgelink_admin_expiry');
  activeAdminToken = '';
  adminTokenExpiry = 0;
  document.getElementById('adminToken').value = '';
  document.getElementById('adminConsole').classList.add('hidden');
  document.getElementById('adminAuthCard').classList.remove('hidden');
  showToast('已退出登录', 'info');
}

async function loadMoreLinks() {
  if (!adminCursor || !activeAdminToken) return;
  const btn = document.getElementById('btnLoadMore');
  btn.disabled = true;
  btn.textContent = '加载中...';

  try {
    const response = await fetch(`/api/admin/list?limit=50&cursor=${encodeURIComponent(adminCursor)}`, {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '加载失败');

    const newLinks = result.links || [];
    const existingCodes = new Set(adminLinks.map(l => l.code));
    for (const link of newLinks) {
      if (link && !existingCodes.has(link.code)) {
        adminLinks.push(link);
        existingCodes.add(link.code);
      }
    }

    adminCursor = result.cursor || null;
    document.getElementById('statTotalLinks').textContent = result.total || adminLinks.length;
    updateTotalClicks();
    renderAdminLinks(adminFilterQuery);

    if (!adminCursor) {
      document.getElementById('loadMoreContainer').classList.add('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '加载更多...';
  }
}

async function fetchAdminLinks() {
  if (!activeAdminToken) return;
  const listBody = document.getElementById('adminLinksList');
  listBody.innerHTML = '<tr class="empty-row"><td colspan="8">Refreshing KV data...</td></tr>';

  try {
    const response = await fetch('/api/admin/list?limit=50', {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to fetch');
    adminLinks = result.links || [];
    adminCursor = result.cursor || null;
    document.getElementById('statTotalLinks').textContent = result.total || adminLinks.length;
    updateTotalClicks();
    renderAdminLinks();
    loadTrendChart();
    document.getElementById('loadMoreContainer').classList.toggle('hidden', !adminCursor);
    showToast('刷新成功', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (err.message.includes('Unauthorized') || err.message.includes('Token')) handleAdminLogout();
  }
}

function updateTotalClicks() {
  const total = adminLinks.reduce((sum, item) => sum + (item.clicks || 0), 0);
  document.getElementById('statTotalClicks').textContent = total;
}

function toggleSelectAll(master) {
  document.querySelectorAll('.link-checkbox').forEach(cb => { cb.checked = master.checked; });
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = document.querySelectorAll('.link-checkbox:checked').length;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('btnBulkDelete').classList.toggle('hidden', count === 0);
}

async function handleBulkDelete() {
  const checked = document.querySelectorAll('.link-checkbox:checked');
  const codes = Array.from(checked).map(cb => cb.value);
  if (codes.length === 0) return;
  if (!confirm(`确定永久删除选中的 ${codes.length} 个链接？`)) return;

  try {
    const response = await fetch('/api/admin/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ codes })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Bulk delete failed');
    showToast(`已删除 ${result.deleted.length} 个链接`, 'success');
    adminLinks = adminLinks.filter(item => !result.deleted.includes(item.code));
    renderAdminLinks(adminFilterQuery);
    document.getElementById('statTotalLinks').textContent = adminLinks.length;
    updateTotalClicks();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let activePreviewText = '';
function previewTextNote(code) {
  const item = adminLinks.find(link => link.code === code);
  if (!item) return;
  const previewModal = document.getElementById('previewModal');
  activePreviewText = item.text || '';
  document.getElementById('previewTextContent').textContent = activePreviewText;
  const clicks = item.clicks || 0;
  const limit = item.viewLimit;
  const isDestroyed = limit && (clicks >= limit);
  const badge = document.getElementById('previewBadge');
  if (limit) {
    badge.textContent = isDestroyed
      ? `Destroyed/Expired (limit: ${clicks}/${limit})`
      : `Burn-after-reading (remaining: ${limit - clicks}, total: ${limit})`;
    badge.style.background = isDestroyed ? 'rgba(255, 69, 58, 0.1)' : 'rgba(190, 100, 50, 0.08)';
    badge.style.color = isDestroyed ? 'var(--danger-color)' : 'var(--accent-color)';
    badge.style.borderColor = isDestroyed ? 'rgba(255, 69, 58, 0.2)' : 'rgba(190, 100, 50, 0.2)';
  } else {
    badge.textContent = `Text Share (views: ${clicks} / Unlimited)`;
    badge.style.background = 'rgba(50, 215, 75, 0.1)';
    badge.style.color = 'var(--success-color)';
    badge.style.borderColor = 'rgba(50, 215, 75, 0.2)';
  }
  previewModal.classList.remove('hidden');
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.add('hidden');
  activePreviewText = '';
}

function copyPreviewText() {
  if (!activePreviewText) return;
  copyText(activePreviewText);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderAdminLinks(filterQuery = '') {
  adminFilterQuery = filterQuery;
  const listBody = document.getElementById('adminLinksList');
  let filtered = adminLinks;
  if (filterQuery) {
    const q = filterQuery.toLowerCase();
    filtered = adminLinks.filter(item =>
      item.code.toLowerCase().includes(q) ||
      (item.url && item.url.toLowerCase().includes(q)) ||
      (item.text && item.text.toLowerCase().includes(q))
    );
  }
  document.getElementById('selectAll').checked = false;
  updateSelectedCount();
  if (filtered.length === 0) {
    listBody.innerHTML = `<tr class="empty-row"><td colspan="8">${filterQuery ? 'No matches' : 'No links in KV'}</td></tr>`;
    return;
  }
  listBody.innerHTML = '';
  filtered.forEach(item => {
    const row = document.createElement('tr');
    const origin = window.location.origin;
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
      ? `<span class="admin-note-preview" style="color:var(--text-secondary);font-style:italic;font-family:var(--font-mono);font-size:0.85rem;cursor:pointer;" onclick="previewTextNote('${item.code}')" title="Click to preview">${escapeHtml((item.text || '').length > 40 ? item.text.substring(0,40)+'...' : item.text)}</span>`
      : `<a href="${item.url}" target="_blank" class="link-url">${item.url}</a>`;
    const clicks = item.clicks || 0;
    const viewLimit = item.viewLimit;
    const isDestroyed = viewLimit && (clicks >= viewLimit);
    let statusLabel = isDestroyed
      ? '<span style="background:rgba(255,69,58,0.1);color:var(--danger-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(255,69,58,0.2);font-weight:600;">Destroyed</span>'
      : clicks > 0
        ? '<span style="background:rgba(50,215,75,0.1);color:var(--success-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(50,215,75,0.2);font-weight:600;">Viewed</span>'
        : '<span style="background:rgba(255,255,255,0.05);color:var(--text-muted);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid var(--border-color);font-weight:600;">Unviewed</span>';
    const limitLabel = viewLimit
      ? `<span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text-secondary);font-weight:600;">${clicks} / ${viewLimit}</span>`
      : `<span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text-secondary);font-weight:600;">${clicks} / Unlimited</span>`;
    row.innerHTML = `
      <td style="text-align:center;"><input type="checkbox" class="link-checkbox" value="${item.code}" onchange="updateSelectedCount()" style="cursor:pointer;"></td>
      <td><a href="${shortUrl}" target="_blank" class="link-code">/${item.code}</a></td>
      <td>${typeLabel}</td>
      <td title="${item.url || '点击查看'}">${displayContent}</td>
      <td>${statusLabel} <span class="clicks-badge" style="padding:1px 6px;font-size:0.75rem;">${clicks}x</span></td>
      <td>${limitLabel}</td>
      <td><span class="date-text">${dateStr}</span></td>
      <td>
        <div class="row-actions">
          ${item.type === 'text' ? `<button onclick="previewTextNote('${item.code}')" class="btn btn-secondary btn-small" title="预览">查看</button>` : ''}
          <button onclick="copyText('${shortUrl}')" class="btn btn-secondary btn-small">复制</button>
          <button onclick="showQRCode('${shortUrl}','${item.code}')" class="btn btn-secondary btn-small">二维码</button>
          <button onclick="deleteLink('${item.code}')" class="btn btn-danger btn-small">删除</button>
        </div>
      </td>`;
    listBody.appendChild(row);
  });
  document.getElementById('loadMoreContainer').classList.toggle('hidden', !adminCursor);
}

function filterAdminLinks() {
  adminFilterQuery = document.getElementById('adminSearchInput').value.trim();
  renderAdminLinks(adminFilterQuery);
}

async function deleteLink(code) {
  if (!confirm(`确定永久删除 /${code}？`)) return;
  try {
    const response = await fetch('/api/admin/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ code })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '删除失败');
    showToast(`/${code} 已删除`, 'success');
    adminLinks = adminLinks.filter(item => item.code !== code);
    renderAdminLinks(adminFilterQuery);
    document.getElementById('statTotalLinks').textContent = adminLinks.length;
    updateTotalClicks();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ----------------------------------------------------
 * SITE SETTINGS (requireRegister switch)
 * ---------------------------------------------------- */

async function loadSiteSettings() {
  const toggle = document.getElementById('requireRegisterToggle');
  if (!toggle || !activeAdminToken) return;
  try {
    const resp = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const data = await resp.json();
    if (resp.ok) toggle.checked = !!data.requireRegister;
  } catch (e) { /* ignore */ }
}

async function handleRequireRegisterToggle(checkbox) {
  const value = !!checkbox.checked;
  checkbox.disabled = true;
  try {
    const resp = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ requireRegister: value })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '保存失败');
    showToast(data.message || '设置已保存', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    checkbox.checked = !value; // revert on failure
  } finally {
    checkbox.disabled = false;
  }
}

/* ----------------------------------------------------
 * USER MANAGEMENT
 * ---------------------------------------------------- */

function escapeHtmlAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadAdminUsers() {
  if (!activeAdminToken) return;
  const listBody = document.getElementById('adminUsersList');
  if (!listBody) return;
  listBody.innerHTML = '<tr class="empty-row"><td colspan="5">正在加载用户数据...</td></tr>';

  try {
    const resp = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载用户失败');

    const users = data.users || [];
    if (users.length === 0) {
      listBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无注册用户。</td></tr>';
      return;
    }

    listBody.innerHTML = '';
    for (const u of users) {
      const created = u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="javascript:void(0)" onclick="showUserLinks('${escapeHtmlAttr(u.username)}')" class="link-code" title="点击查看该用户的短链明细">👤 ${escapeHtml(u.username)}</a></td>
        <td><span class="date-text">${created}</span></td>
        <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${u.linkCount || 0} 条</span></td>
        <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${u.totalClicks || 0} 次</span></td>
        <td><button onclick="deleteAdminUser('${escapeHtmlAttr(u.username)}')" class="btn btn-danger btn-small">删除用户</button></td>
      `;
      listBody.appendChild(row);
    }
  } catch (err) {
    listBody.innerHTML = `<tr class="empty-row"><td colspan="5">加载失败：${escapeHtml(err.message)}</td></tr>`;
  }
}

/* ----------------------------------------------------
 * CLICK TREND CHART
 * ---------------------------------------------------- */

async function loadTrendChart() {
  const container = document.getElementById('trendChart');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Loading trend data...</div>';

  const today = new Date();
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const trendData = [];
  for (const date of dates) {
    try {
      const resp = await fetch(`/api/admin/trend?date=${date}`, {
        headers: { 'Authorization': `Bearer ${activeAdminToken}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        trendData.push({ date, total: data.total || 0, links: data.links || 0 });
      } else {
        trendData.push({ date, total: 0, links: 0 });
      }
    } catch (e) {
      trendData.push({ date, total: 0, links: 0 });
    }
  }

  const maxVal = Math.max(1, ...trendData.map(d => d.total));
  const bars = trendData.map(d => {
    const pct = (d.total / maxVal * 100).toFixed(0);
    const label = d.date.substring(5);
    return `<div class="trend-bar-col">
      <div class="trend-bar-value" style="height:${pct}%;" title="${d.date}: ${d.total} clicks">${d.total > 0 ? d.total : ''}</div>
      <div class="trend-bar-label">${label}</div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="trend-chart-bars">${bars}</div>`;
}

/* ----------------------------------------------------
 * USER LINKS DRILL-DOWN MODAL
 * ---------------------------------------------------- */

// Drill-down: list all links created by a specific user
async function showUserLinks(username) {
  const modal = document.getElementById('userLinksModal');
  document.getElementById('userLinksTitle').textContent = username;
  document.getElementById('userLinksSummary').textContent = '加载中...';
  document.getElementById('userLinksList').innerHTML = '';
  modal.classList.remove('hidden');

  try {
    const resp = await fetch(`/api/admin/users/links?username=${encodeURIComponent(username)}`, {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');

    document.getElementById('userLinksSummary').textContent =
      `共 ${data.total || 0} 条短链，累计点击 ${data.totalClicks || 0} 次。`;

    const listBody = document.getElementById('userLinksList');
    if (!data.links || data.links.length === 0) {
      listBody.innerHTML = '<tr class="empty-row"><td colspan="5">该用户尚未生成任何短链。</td></tr>';
      return;
    }

    listBody.innerHTML = '';
    for (const item of data.links) {
      const shortUrl = `${window.location.origin}/${item.code}`;
      const typeLabel = item.type === 'text' ? '📝 文字' : '🔗 链接';
      const content = item.type === 'text'
        ? `<span style="color: var(--text-secondary); font-style: italic;">${escapeHtml((item.text || '').substring(0, 60))}</span>`
        : `<a href="${escapeHtml(item.url)}" target="_blank" class="link-url">${escapeHtml(item.url)}</a>`;
      const created = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${shortUrl}" target="_blank" class="link-code">/${escapeHtml(item.code)}</a></td>
        <td>${typeLabel}</td>
        <td title="${escapeHtml(item.url || item.text || '')}">${content}</td>
        <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${item.clicks || 0} 次点击</span></td>
        <td><span class="date-text">${created}</span></td>
      `;
      listBody.appendChild(row);
    }
  } catch (err) {
    document.getElementById('userLinksSummary').textContent = `加载失败：${err.message}`;
  }
}

function closeUserLinksModal() {
  document.getElementById('userLinksModal').classList.add('hidden');
}

async function deleteAdminUser(username) {
  if (!confirm(`确定删除用户 "${username}"？其短链将保留但不再归属任何账户。`)) return;
  try {
    const resp = await fetch('/api/admin/users/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ username })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '删除失败');
    showToast(data.message || '用户已删除', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ----------------------------------------------------
 * QR CODE DIALOG
 * ---------------------------------------------------- */

async function showQRCode(shortUrl, code) {
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
      if (canvas) { link.href = canvas.toDataURL('image/png'); link.click(); showToast('二维码已下载', 'success'); }
      else if (img && img.src && img.src.startsWith('data:')) { link.href = img.src; link.click(); showToast('二维码已下载', 'success'); }
      else showToast('二维码不可用', 'error');
    };
  } else {
    container.innerHTML = '<span style="color:red">二维码库加载失败</span>';
  }
}

function closeQRModal() {
  document.getElementById('qrModal').classList.add('hidden');
}

/* ----------------------------------------------------
 * CSV EXPORT
 * ---------------------------------------------------- */

function exportCSV() {
  if (!adminLinks || adminLinks.length === 0) {
    showToast('没有可导出的数据', 'warning');
    return;
  }

  const BOM = '\uFEFF';
  const headers = ['短地址', '类型', '原始链接', '点击数', '查看限制', '过期时间', '创建时间'];
  const rows = adminLinks.map(item => {
    const type = item.type === 'text' ? '文字' : '链接';
    const content = item.type === 'text' ? (item.text || '') : (item.url || '');
    const limit = item.viewLimit || '无限制';
    const expires = item.expiresAt || '永不过期';
    let created = '';
    if (item.createdAt) {
      const d = new Date(item.createdAt);
      created = d.toLocaleString('zh-CN');
    }
    return [
      item.code,
      type,
      content,
      item.clicks || 0,
      limit,
      expires,
      created
    ];
  });

  const csvContent = BOM + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = `edgelink-export-${dateStr}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`已导出 ${adminLinks.length} 条记录`, 'success');
}