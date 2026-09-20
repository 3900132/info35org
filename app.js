/* ----------------------------------------------------
 * EdgeLink Frontend Logic
 * Handles client actions, URL shortening, Local History,
 * and QR Code creation.
 * ---------------------------------------------------- */

// State management
let localHistory = [];

// Auth state
let authToken = localStorage.getItem('edgelink_token') || '';
let authUsername = localStorage.getItem('edgelink_username') || '';
let siteSettings = { requireRegister: false };
let authMode = 'login';

// Build headers for API calls (attaches token when logged in)
function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

// Initialize auth state on page load
async function initAuth() {
  try {
    const resp = await fetch('/api/settings');
    if (resp.ok) {
      const data = await resp.json();
      siteSettings.requireRegister = !!data.requireRegister;
    }
  } catch (e) { /* default off */ }
  updateAuthHint();

  if (authToken) {
    try {
      const resp = await fetch('/api/auth/me', { headers: authHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        authUsername = data.username || authUsername;
        setLoggedInView(true);
        loadMyLinks();
        return;
      }
    } catch (e) { /* fallthrough */ }
    clearAuthSession();
  }
  setLoggedInView(false);

  if (siteSettings.requireRegister) {
    showToast('本站已开启"注册用户才能生成短链"，请先登录或注册。', 'warning', 6000);
  }
}

function updateAuthHint() {
  const hint = document.getElementById('authHint');
  if (hint) {
    hint.textContent = siteSettings.requireRegister
      ? '本站已开启"注册用户才能生成短链"，请先注册并登录后再生成。'
      : '登录后您的短链将归属到您的账户，可在管理后台查看统计。（当前未登录也可直接生成）';
  }
}

function clearAuthSession() {
  authToken = '';
  authUsername = '';
  localStorage.removeItem('edgelink_token');
  localStorage.removeItem('edgelink_username');
}

function setLoggedInView(loggedIn) {
  document.getElementById('authLoggedIn').classList.toggle('hidden', !loggedIn);
  document.getElementById('authLoggedOut').classList.toggle('hidden', loggedIn);
  if (loggedIn) {
    document.getElementById('authDisplayName').textContent = authUsername;
    document.getElementById('myLinksCard').classList.remove('hidden');
  } else {
    document.getElementById('myLinksCard').classList.add('hidden');
  }
}

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tabLogin').style.fontWeight = mode === 'login' ? '800' : '400';
  document.getElementById('tabRegister').style.fontWeight = mode === 'register' ? '800' : '400';
  document.getElementById('btnAuthSubmit').textContent = mode === 'login' ? '登录' : '注册并登录';
  document.getElementById('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn = document.getElementById('btnAuthSubmit');
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? '登录中...' : '注册中...';

  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '操作失败');

    authToken = data.token;
    authUsername = data.username || username;
    localStorage.setItem('edgelink_token', authToken);
    localStorage.setItem('edgelink_username', authUsername);
    setLoggedInView(true);
    loadMyLinks();
    showToast(data.message || '登录成功', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? '登录' : '注册并登录';
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
  } catch (e) { /* ignore */ }
  clearAuthSession();
  setLoggedInView(false);
  switchAuthTab('login');
  showToast('已退出登录', 'info');
}

function toggleMyLinks() {
  const card = document.getElementById('myLinksCard');
  card.classList.toggle('hidden');
  if (!card.classList.contains('hidden')) loadMyLinks();
}

// Load links owned by the current user with live click stats
async function loadMyLinks() {
  if (!authToken) return;
  const listBody = document.getElementById('myLinksList');
  listBody.innerHTML = '<tr class="empty-row"><td colspan="5">加载中...</td></tr>';

  try {
    const resp = await fetch('/api/my/links', { headers: authHeaders() });
    if (resp.status === 401) { clearAuthSession(); setLoggedInView(false); return; }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '加载失败');

    const links = data.links || [];
    if (links.length === 0) {
      listBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无数据，生成短链后这里会自动出现。</td></tr>';
      return;
    }

    listBody.innerHTML = '';
    for (const item of links) {
      const shortUrl = `${window.location.origin}/${item.code}`;
      const typeLabel = item.type === 'text' ? '📝 文字' : '🔗 链接';
      const content = item.type === 'text'
        ? `<span style="color: var(--text-secondary); font-style: italic;">${escapeHtml((item.text || '').substring(0, 60))}</span>`
        : `<a href="${escapeHtml(item.url)}" target="_blank" class="link-url">${escapeHtml(item.url)}</a>`;
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未知';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${shortUrl}" target="_blank" class="link-code">/${escapeHtml(item.code)}</a></td>
        <td>${typeLabel}</td>
        <td title="${escapeHtml(item.url || item.text || '')}">${content}</td>
        <td><span class="clicks-badge" style="padding:1px 8px;font-size:0.8rem;">${item.clicks || 0} 次点击</span></td>
        <td><span class="date-text">${dateStr}</span></td>
      `;
      listBody.appendChild(row);
    }
  } catch (err) {
    listBody.innerHTML = `<tr class="empty-row"><td colspan="5">加载失败：${escapeHtml(err.message)}</td></tr>`;
  }
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initHistory();
  initAuth();
  checkUrlParams();
});

// Toast notification helper
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  
  toast.innerHTML = `<span>${icon}</span><span style="flex:1;">${message}</span>`;
  container.appendChild(toast);
  
  // Auto-remove toast
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}

// Clipboard Copy Helper
async function copyToClipboard(inputId) {
  const input = document.getElementById(inputId);
  input.select();
  input.setSelectionRange(0, 99999); // For mobile devices
  
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(input.value);
    } else {
      document.execCommand('copy');
    }
    showToast('链接复制成功！', 'success');
  } catch (err) {
    showToast('复制失败，请手动选择复制', 'error');
  }
}

function copyText(text) {
  const tempInput = document.createElement('input');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try {
    document.execCommand('copy');
    showToast('复制链接成功！', 'success');
  } catch (e) {
    showToast('复制失败', 'error');
  }
  document.body.removeChild(tempInput);
}

// URL query parameter check (for redirect error handling)
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('error')) {
    const errorType = params.get('error');
    const code = params.get('code') || '';
    if (errorType === 'notfound') {
      showToast(`短链接 /${code} 不存在或已被删除！`, 'warning', 5000);
    } else if (errorType === 'system') {
      const msg = params.get('message') || '未知系统错误';
      showToast(`重定向失败，系统异常: ${msg}`, 'error', 6000);
    }
    
    // Clean up URL query parameters without page reload
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/* ----------------------------------------------------
 * SHORTENER API ACTIONS
 * ---------------------------------------------------- */

// Toggle Custom Limit Input visibility
function toggleCustomLimit() {
  const viewLimit = document.getElementById('viewLimit').value;
  const customLimitGroup = document.getElementById('customLimitGroup');
  const customLimit = document.getElementById('customLimit');
  
  if (viewLimit === 'custom') {
    customLimitGroup.classList.remove('hidden');
    customLimit.required = true;
    customLimit.focus();
  } else {
    customLimitGroup.classList.add('hidden');
    customLimit.required = false;
    customLimit.value = '';
  }
}

// Simple HTML Escaper
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ----------------------------------------------------
 * SHORTENER API ACTIONS
 * ---------------------------------------------------- */

// Handle shortening form submission
async function handleShorten(e) {
  e.preventDefault();
  
  const longUrlInput = document.getElementById('longUrl');
  const customCodeInput = document.getElementById('customCode');
  const viewLimitSelect = document.getElementById('viewLimit');
  const customLimitInput = document.getElementById('customLimit');
  const ttlSelect = document.getElementById('ttl');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnLoader = btnSubmit.querySelector('.btn-loader');
  
  const rawInput = longUrlInput.value.trim();
  const customCode = customCodeInput.value.trim();
  
  let viewLimit = null;
  if (viewLimitSelect.value === 'custom') {
    viewLimit = parseInt(customLimitInput.value.trim(), 10) || null;
  } else if (viewLimitSelect.value) {
    viewLimit = parseInt(viewLimitSelect.value, 10);
  }

  const ttl = ttlSelect.value || undefined;
  
  // Split by newlines for batch creation
  const lines = rawInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const isBatch = lines.length > 1;

  // Custom code is not allowed in batch mode
  if (isBatch && customCode) {
    showToast('批量模式下不支持自定义别名，已忽略', 'warning');
  }
  
  // Set loading state
  btnSubmit.disabled = true;
  btnText.textContent = isBatch ? `正在批量生成 ${lines.length} 个...` : '正在生成...';
  btnLoader.classList.remove('hidden');
  
  try {
    if (isBatch) {
      // Batch creation
      const results = [];
      const errors = [];
      
      for (const line of lines) {
        try {
          const response = await fetch('/api/create', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ 
              url: line, 
              viewLimit: viewLimit,
              ttl: ttl
            })
          });
          const result = await response.json();
          if (response.ok && result.success) {
            results.push(result);
            addToHistory({
              code: result.code,
              type: result.type,
              url: line,
              shortUrl: result.shortUrl,
              createdAt: result.createdAt,
              clicks: 0,
              viewLimit: result.viewLimit,
              expiresAt: result.expiresAt
            });
          } else {
            errors.push({ url: line, error: result.error || '生成失败' });
          }
        } catch (err) {
          errors.push({ url: line, error: err.message });
        }
      }

      // Show batch results
      const resultCard = document.getElementById('resultCard');
      const shortUrlOutput = document.getElementById('shortUrlOutput');
      const btnVisitLink = document.getElementById('btnVisitLink');
      
      if (results.length > 0) {
        const allUrls = results.map(r => r.shortUrl).join('\n');
        shortUrlOutput.value = allUrls;
        btnVisitLink.href = results[0].shortUrl;
        btnVisitLink.textContent = `访问第 1 个链接`;
        resultCard.classList.remove('hidden');
        resultCard.scrollIntoView({ behavior: 'smooth' });
      }
      
      let msg = `批量生成完成：成功 ${results.length} 个`;
      if (errors.length > 0) {
        msg += `，失败 ${errors.length} 个`;
        console.warn('Batch errors:', errors);
      }
      showToast(msg, results.length > 0 ? 'success' : 'error');
      
    } else {
      // Single creation (original logic)
      const longUrl = lines[0] || rawInput;
      const response = await fetch('/api/create', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ 
          url: longUrl, 
          customCode: customCode || undefined,
          viewLimit: viewLimit,
          ttl: ttl
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '请求生成短链接失败');
      }
      
      // Show success panel
      const resultCard = document.getElementById('resultCard');
      const shortUrlOutput = document.getElementById('shortUrlOutput');
      const btnVisitLink = document.getElementById('btnVisitLink');
      
      shortUrlOutput.value = result.shortUrl;
      btnVisitLink.href = result.shortUrl;
      btnVisitLink.textContent = '⚡ 访问链接';
      resultCard.classList.remove('hidden');
      resultCard.scrollIntoView({ behavior: 'smooth' });
      
      showToast('短链接/分享生成成功！', 'success');
      
      addToHistory({
        code: result.code,
        type: result.type,
        url: longUrl,
        shortUrl: result.shortUrl,
        createdAt: result.createdAt,
        clicks: 0,
        viewLimit: result.viewLimit,
        expiresAt: result.expiresAt
      });
    }

    // Clear form
    longUrlInput.value = '';
    customCodeInput.value = '';
    viewLimitSelect.value = '';
    ttlSelect.value = '';
    toggleCustomLimit();
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    // Reset button state
    btnSubmit.disabled = false;
    btnText.textContent = '生成短链接/分享';
    btnLoader.classList.add('hidden');
  }
}

/* ----------------------------------------------------
 * LOCAL HISTORY MANAGEMENT
 * ---------------------------------------------------- */

function initHistory() {
  const historyData = localStorage.getItem('edgelink_history');
  if (historyData) {
    try {
      localHistory = JSON.parse(historyData);
    } catch (e) {
      localHistory = [];
    }
  }
  renderHistory();
  // Fetch live stats for history in background
  if (localHistory.length > 0) {
    refreshHistoryStats();
  }
}

function addToHistory(item) {
  localHistory = localHistory.filter(h => h.code !== item.code);
  localHistory.unshift(item); // Add to top
  
  if (localHistory.length > 30) {
    localHistory.pop();
  }
  
  localStorage.setItem('edgelink_history', JSON.stringify(localHistory));
  renderHistory();
}

function removeFromHistory(code) {
  localHistory = localHistory.filter(h => h.code !== code);
  localStorage.setItem('edgelink_history', JSON.stringify(localHistory));
  renderHistory();
  showToast('记录已移除', 'info');
}

function renderHistory() {
  const historyList = document.getElementById('historyList');
  
  if (localHistory.length === 0) {
    historyList.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">暂无生成记录，立即在上方创建一个吧！</td>
      </tr>
    `;
    return;
  }
  
  historyList.innerHTML = '';
  
  localHistory.forEach(item => {
    const row = document.createElement('tr');
    
    // Format date
    let dateStr = '未知';
    if (item.createdAt) {
      const d = new Date(item.createdAt);
      dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    
    // Determine type display
    const typeLabel = item.type === 'text' 
      ? '<span class="type-badge text-note" style="background: rgba(190, 100, 50, 0.08); color: var(--accent-color); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(190, 100, 50, 0.2);">📝 文字</span>' 
      : '<span class="type-badge text-url" style="background: rgba(145, 80, 46, 0.08); color: var(--success-color); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(145, 80, 46, 0.2);">🔗 链接</span>';
      
    // Determine preview content
    const displayContent = item.type === 'text'
      ? `<span class="text-note-preview" style="color: var(--text-secondary); font-style: italic; font-family: var(--font-mono); font-size: 0.85rem;">${escapeHtml(item.url)}</span>`
      : `<a href="${item.url}" target="_blank" class="link-url">${item.url}</a>`;

    // Determine status & clicks
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

    const expiresAt = item.expiresAt;
    let expiresLabel = '';
    if (expiresAt) {
      const expires = new Date(expiresAt);
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

    row.innerHTML = `
      <td><a href="${item.shortUrl}" target="_blank" class="link-code">/${item.code}</a></td>
      <td>${typeLabel}</td>
      <td title="${item.url}">${displayContent}</td>
      <td>${statusLabel}${expiresLabel}</td>
      <td>${limitLabel}</td>
      <td><span class="date-text">${dateStr}</span></td>
      <td>
        <div class="row-actions">
          <button onclick="copyText('${item.shortUrl}')" class="btn btn-secondary btn-small">复制</button>
          <button onclick="showQRCode('${item.shortUrl}', '${item.code}')" class="btn btn-secondary btn-small">二维码</button>
          <button onclick="removeFromHistory('${item.code}')" class="btn btn-danger btn-small" style="padding: 6px 8px;" title="从历史列表中移除">✕</button>
        </div>
      </td>
    `;
    historyList.appendChild(row);
  });
}

// Background poll to fetch real-time click statistics for user's history links
async function refreshHistoryStats() {
  if (localHistory.length === 0) return;
  
  let updated = false;
  
  await Promise.all(
    localHistory.map(async (item) => {
      try {
        const response = await fetch(`/api/stats?code=${item.code}`);
        if (response.status === 404) {
          // If response is 404, the link was deleted (likely because it reached viewLimit)
          if (item.viewLimit && item.clicks !== item.viewLimit) {
            item.clicks = item.viewLimit; // Force to limit to render "已销毁"
            updated = true;
          }
        } else if (response.ok) {
          const data = await response.json();
          if (data.clicks !== undefined && data.clicks !== item.clicks) {
            item.clicks = data.clicks;
            updated = true;
          }
          if (data.expiresAt !== undefined && data.expiresAt !== item.expiresAt) {
            item.expiresAt = data.expiresAt;
            updated = true;
          }
        }
      } catch (err) {
        // Fail silently for individual items
      }
    })
  );
  
  if (updated) {
    localStorage.setItem('edgelink_history', JSON.stringify(localHistory));
    renderHistory();
  }
}

/* ----------------------------------------------------
 * QR CODE GENERATION
 * ---------------------------------------------------- */

function showQRCode(shortUrl = null, code = null) {
  // If arguments omitted, pull from current successful shorten card
  if (!shortUrl) {
    shortUrl = document.getElementById('shortUrlOutput').value;
    code = shortUrl.split('/').pop();
  }
  
  const container = document.getElementById('qrcodeContainer');
  const qrUrlText = document.getElementById('qrUrlText');
  const btnDownloadQR = document.getElementById('btnDownloadQR');
  
  container.innerHTML = ''; // Clear container
  qrUrlText.textContent = shortUrl;
  
  // Trigger modal visibility
  document.getElementById('qrModal').classList.remove('hidden');
  
  if (typeof QRCode !== 'undefined') {
    const qrcode = new QRCode(container, {
      text: shortUrl,
      width: 220,
      height: 220,
      colorDark : '#0f141e',
      colorLight : '#ffffff',
      correctLevel : QRCode.CorrectLevel.H
    });
    
    // Bind download action
    btnDownloadQR.onclick = () => {
      // Find the canvas or img rendered by the library
      const canvas = container.querySelector('canvas');
      const img = container.querySelector('img');
      
      const link = document.createElement('a');
      link.download = `edgelink-${code}-qr.png`;
      
      if (canvas) {
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('二维码已开始下载', 'success');
      } else if (img && img.src && img.src.startsWith('data:')) {
        link.href = img.src;
        link.click();
        showToast('二维码已开始下载', 'success');
      } else {
        showToast('未找到可下载的二维码，请重试', 'error');
      }
    };
  } else {
    container.innerHTML = '<span style="color:red">二维码库正在加载，请重试</span>';
  }
}

function closeQRModal() {
  document.getElementById('qrModal').classList.add('hidden');
}
