/* ----------------------------------------------------
 * EdgeLink Admin Panel Logic
 * Handles admin session, list query, deletion, stats & trends.
 * ---------------------------------------------------- */

let adminLinks = [];
let activeAdminToken = '';
let adminTokenExpiry = 0;
const TOKEN_TTL = 30 * 60 * 1000;

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

/* ----------------------------------------------------
 * ADMIN CONTROLLER
 * ---------------------------------------------------- */

function handleAdminLogin(e) {
  e.preventDefault();
  const token = document.getElementById('adminToken').value.trim();
  attemptAdminLogin(token);
}

async function attemptAdminLogin(token, silent = false) {
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
    document.getElementById('statTotalLinks').textContent = result.total || adminLinks.length;
    updateTotalClicks();
    loadTrendChart();
    loadSiteSettings();
    loadAdminUsers();
    if (!silent) showToast('管理员验证成功', 'success');

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

function updateTotalClicks() {
  const total = adminLinks.reduce((sum, item) => sum + (item.clicks || 0), 0);
  document.getElementById('statTotalClicks').textContent = total;
}

/* ----------------------------------------------------
 * SITE SETTINGS (requireRegister switch)
 * ---------------------------------------------------- */

async function loadSiteSettings() {
  const toggle = document.getElementById('requireRegisterToggle');
  const approvalToggle = document.getElementById('requireApprovalToggle');
  const disableToggle = document.getElementById('disableRegisterToggle');
  const retentionInput = document.getElementById('guestRetentionDaysInput');
  const delayInput = document.getElementById('redirectDelayInput');
  if (!toggle || !activeAdminToken) return;
  try {
    const resp = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const data = await resp.json();
    if (resp.ok) {
      toggle.checked = !!data.requireRegister;
      if (approvalToggle) approvalToggle.checked = !!data.requireApproval;
      if (disableToggle) disableToggle.checked = !!data.disableRegister;
      if (retentionInput) retentionInput.value = data.guestLinkRetentionDays;
      if (delayInput) delayInput.value = data.redirectDelaySeconds;
    }
  } catch (e) { /* ignore */ }
}

async function handleStorageSettingsSave(btn) {
  const retentionInput = document.getElementById('guestRetentionDaysInput');
  const delayInput = document.getElementById('redirectDelayInput');
  const retention = parseInt(retentionInput.value, 10);
  const delay = parseInt(delayInput.value, 10);
  if (!Number.isFinite(retention) || retention < 0 || retention > 365) {
    showToast('保留天数需为 0-365 的整数（0 表示永久保留）', 'error');
    return;
  }
  if (!Number.isFinite(delay) || delay < 0 || delay > 60) {
    showToast('跳转停留时间需为 0-60 的整数（0 表示立即跳转）', 'error');
    return;
  }
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '保存中...';
  try {
    const resp = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ guestLinkRetentionDays: retention, redirectDelaySeconds: delay })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '保存失败');
    showToast(data.message || '设置已保存', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    loadSiteSettings(); // 失败时回显服务端当前值
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function saveAdminSetting(key, value, checkbox) {
  checkbox.disabled = true;
  try {
    const resp = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ [key]: value })
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

async function handleRequireRegisterToggle(checkbox) {
  await saveAdminSetting('requireRegister', !!checkbox.checked, checkbox);
}

async function handleRequireApprovalToggle(checkbox) {
  await saveAdminSetting('requireApproval', !!checkbox.checked, checkbox);
  loadAdminUsers();
}

async function handleDisableRegisterToggle(checkbox) {
  await saveAdminSetting('disableRegister', !!checkbox.checked, checkbox);
}

/* ----------------------------------------------------
 * USER MANAGEMENT
 * ---------------------------------------------------- */

function escapeHtmlAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

let allUsers = [];
let usersPageSize = 30;

// 后台页签切换
function switchAdminTab(tab) {
  const isLinks = tab === 'links';
  document.getElementById('tabLinks').classList.toggle('hidden', !isLinks);
  document.getElementById('tabUsers').classList.toggle('hidden', isLinks);
  document.getElementById('tabBtnLinks').className = isLinks ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('tabBtnUsers').className = isLinks ? 'btn btn-secondary' : 'btn btn-primary';
  if (!isLinks) loadAdminUsers();
}

function applyUsersPageSize() {
  const v = parseInt(document.getElementById('usersPageSize').value, 10);
  usersPageSize = (isNaN(v) || v < 10) ? 30 : Math.min(v, 500);
  renderAdminUsers();
}

function userStatusBadge(status) {
  if (status === 'pending') {
    return '<span style="background:rgba(255,180,0,0.12);color:#ffb400;padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(255,180,0,0.3);">待审核</span>';
  }
  if (status === 'blocked') {
    return '<span style="background:rgba(255,69,58,0.1);color:var(--danger-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(255,69,58,0.2);">已封禁</span>';
  }
  return '<span style="background:rgba(50,215,75,0.1);color:var(--success-color);padding:2px 8px;border-radius:4px;font-size:0.8rem;border:1px solid rgba(50,215,75,0.2);">正常</span>';
}

async function setUserStatus(username, status) {
  const actionText = { active: '通过审核/解封', pending: '标记为待审核', blocked: '封禁' }[status];
  if (!confirm(`确定将 ${username} ${actionText}？`)) return;
  try {
    const resp = await fetch('/api/admin/user-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeAdminToken}` },
      body: JSON.stringify({ username, status })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '操作失败');
    showToast(data.message || '操作成功', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminUsers() {
  if (!activeAdminToken) return;
  const listBody = document.getElementById('adminUsersList');
  if (!listBody) return;
  listBody.innerHTML = '<tr class="empty-row"><td colspan="6">正在加载用户数据...</td></tr>';

  try {
    const resp = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载用户失败');

    allUsers = data.users || [];
    renderAdminUsers();
  } catch (err) {
    listBody.innerHTML = `<tr class="empty-row"><td colspan="6">加载失败：${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderAdminUsers() {
  const listBody = document.getElementById('adminUsersList');
  const pageInfo = document.getElementById('usersPageInfo');
  const badge = document.getElementById('userTabBadge');

  const pendingCount = allUsers.filter(u => u.status === 'pending').length;
  if (badge) {
    badge.classList.toggle('hidden', pendingCount === 0);
    badge.textContent = pendingCount > 0 ? `${pendingCount} 待审` : '';
  }

  if (allUsers.length === 0) {
    listBody.innerHTML = '<tr class="empty-row"><td colspan="6">暂无注册用户。</td></tr>';
    if (pageInfo) pageInfo.textContent = '';
    return;
  }

  const shown = allUsers.slice(0, usersPageSize);
  listBody.innerHTML = '';
  for (const u of shown) {
    const created = u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '未知';
    const status = u.status || 'active';
    const actions = [];
    if (status === 'pending') actions.push(`<button onclick="setUserStatus('${escapeHtmlAttr(u.username)}','active')" class="btn btn-primary btn-small">✔ 通过审核</button>`);
    if (status === 'blocked') actions.push(`<button onclick="setUserStatus('${escapeHtmlAttr(u.username)}','active')" class="btn btn-secondary btn-small">解封</button>`);
    else if (status !== 'pending') actions.push(`<button onclick="setUserStatus('${escapeHtmlAttr(u.username)}','blocked')" class="btn btn-secondary btn-small">🚫 封禁</button>`);
    if (status !== 'pending' && status !== 'blocked') actions.push(`<button onclick="setUserStatus('${escapeHtmlAttr(u.username)}','pending')" class="btn btn-secondary btn-small">取消资格</button>`);
    actions.push(`<button onclick="deleteAdminUser('${escapeHtmlAttr(u.username)}')" class="btn btn-danger btn-small">删除</button>`);

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><a href="/admin-user?username=${encodeURIComponent(u.username)}" class="link-code" title="点击查看该用户的短链明细">📧 ${escapeHtml(u.username)}</a></td>
      <td>${userStatusBadge(status)}</td>
      <td><span class="date-text">${created}</span></td>
      <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${u.linkCount || 0} 条</span></td>
      <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${u.totalClicks || 0} 次</span></td>
      <td><div class="row-actions">${actions.join(' ')}</div></td>
    `;
    listBody.appendChild(row);
  }

  if (pageInfo) {
    pageInfo.textContent = allUsers.length > usersPageSize
      ? `已显示 ${shown.length} / 共 ${allUsers.length} 个用户（可在右上角调整每页显示数量）`
      : `共 ${allUsers.length} 个用户`;
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
 * USER LINKS DRILL-DOWN（独立页 /admin-user?username=xxx）
 * 弹窗方案依赖的边缘函数嵌套路由在线上不可靠，已改为独立页面
 * ---------------------------------------------------- */

async function deleteAdminUser(username) {
  if (!confirm(`确定删除用户 "${username}"？其短链将保留但不再归属任何账户。`)) return;
  try {
    const resp = await fetch('/api/admin/user-delete', {
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
 * MANUAL KV CLEANUP（手动清理无用数据）
 * ---------------------------------------------------- */

async function handleManualCleanup(btn) {
  if (!confirm('立即清理 KV 中的无用数据？\n（过期短链、超保留期的访客短链、失效的限流记录）')) return;
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '清理中...';
  try {
    const resp = await fetch('/api/admin/cleanup', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeAdminToken}` }
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '清理失败');
    showToast(data.message || '清理完成', 'success');
    // 数据可能变化，静默刷新仪表盘统计（不重复弹验证提示）
    attemptAdminLogin(activeAdminToken, true);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}