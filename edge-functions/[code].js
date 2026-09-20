import { getKV, escapeHtml } from './lib/kv-helpers.js';

function htmlPage(title, bodyContent, style = '') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EdgeLink - ${title}</title>
  <link rel="preload" href="/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts.css">
  <style>
    :root {
      --bg-color: hsl(224, 25%, 7%);
      --card-bg: rgba(13, 17, 26, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-primary: hsl(0, 0%, 95%);
      --text-secondary: hsl(224, 12%, 68%);
      --text-muted: hsl(224, 10%, 45%);
      --primary-color: hsl(252, 100%, 67%);
      --accent-color: hsl(190, 100%, 50%);
      --success-color: hsl(145, 80%, 46%);
      --danger-color: hsl(355, 85%, 55%);
      --primary-gradient: linear-gradient(135deg, var(--primary-color), var(--accent-color));
      --radius-lg: 20px;
      --radius-md: 14px;
      --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', sfmono-regular, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-color);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      overflow-x: hidden;
    }
    .bg-glow {
      position: absolute;
      top: -10%; left: 50%;
      transform: translateX(-50%);
      width: 90vw; height: 60vh;
      background: radial-gradient(circle, hsla(252, 100%, 67%, 0.12) 0%, hsla(190, 100%, 50%, 0.04) 50%, transparent 80%);
      z-index: -1;
      pointer-events: none;
      filter: blur(80px);
    }
    .card {
      width: 100%;
      max-width: 600px;
      background: var(--card-bg);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 30px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(15px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 24px;
      font-size: 1.2rem;
      font-weight: 800;
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-decoration: none;
    }
    .logo span { font-weight: 300; color: var(--text-primary); -webkit-text-fill-color: initial; }
    h2 { font-size: 1.6rem; font-weight: 700; margin-bottom: 12px; }
    p { color: var(--text-secondary); margin-bottom: 20px; font-size: 0.95rem; }
    .content-box {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 20px;
      font-family: var(--font-mono);
      font-size: 0.95rem;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
      margin-bottom: 20px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 50px;
      font-size: 0.8rem;
      font-weight: 600;
      border: 1px solid var(--border-color);
      margin-bottom: 20px;
    }
    .badge-info { background: rgba(190, 100, 50, 0.08); color: var(--accent-color); border-color: rgba(190, 100, 50, 0.2); }
    .badge-danger { background: rgba(355, 85, 55, 0.08); color: var(--danger-color); border-color: rgba(355, 85, 55, 0.2); }
    .badge-success { background: rgba(145, 80, 46, 0.08); color: var(--success-color); border-color: rgba(145, 80, 46, 0.2); }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      font-family: var(--font-sans);
      font-size: 0.95rem;
      font-weight: 600;
      border-radius: var(--radius-md);
      border: 1px solid transparent;
      cursor: pointer;
      width: 100%;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--primary-gradient);
      color: white;
      box-shadow: 0 4px 14px hsla(252, 100%, 67%, 0.2);
    }
    .btn-primary:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
    .actions { display: flex; gap: 12px; }
    .toast {
      position: fixed;
      bottom: 24px; left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: rgba(18, 22, 33, 0.9);
      border: 1px solid var(--border-color);
      padding: 12px 24px;
      border-radius: 10px;
      color: white;
      font-size: 0.9rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 9999;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    ${style}
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  ${bodyContent}
  <div id="toast" class="toast">Content copied!</div>
  <script>
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }
    function copyText(val) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(() => showToast('Content copied!')).catch(() => showToast('Copy failed'));
      } else {
        const inp = document.createElement('textarea');
        inp.value = val; document.body.appendChild(inp); inp.select();
        try { document.execCommand('copy'); showToast('Content copied!'); } catch(e) { showToast('Copy failed'); }
        document.body.removeChild(inp);
      }
    }
  </script>
</body>
</html>`;
}

function redirectHtmlPage(url) {
  return htmlPage(
    '正在跳转...',
    `<div class="card" style="text-align: center; max-width: 500px;">
      <a href="/" class="logo" style="justify-content: center;">⚡ Edge<span>Link</span></a>
      <div id="loadingState">
        <div class="spinner"></div>
        <h2 style="font-weight: 700; margin-bottom: 8px;">正在跳转...</h2>
        <p style="font-size: 0.9rem; color: var(--text-secondary);">安全检查中，即将跳转到目标地址</p>
        <div class="url-text">${escapeHtml(url)}</div>
      </div>
      <div id="errorState" class="hidden">
        <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
        <h2 style="color: var(--danger-color); font-weight: 800; margin-bottom: 12px;">目标地址无法访问</h2>
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px;">我们尝试连接但目标地址似乎不可用。</p>
        <div class="url-text" style="background: rgba(255, 69, 58, 0.04); border-color: rgba(255, 69, 58, 0.15); color: var(--text-primary);">${escapeHtml(url)}</div>
        <div class="actions" style="margin-top: 24px; display: flex; gap: 12px;">
          <a href="${url}" class="btn btn-primary">强制跳转</a>
          <a href="/" class="btn btn-secondary">返回首页</a>
        </div>
      </div>
    </div>
    <script>
      (function() {
        const targetUrl = ${JSON.stringify(url)};
        let resolved = false;
        function doRedirect() {
          if (resolved) return;
          resolved = true;
          window.location.replace(targetUrl);
        }
        function showError() {
          if (resolved) return;
          resolved = true;
          document.getElementById('loadingState').classList.add('hidden');
          document.getElementById('errorState').classList.remove('hidden');
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          showError();
        }, 2500);
        fetch(targetUrl, { mode: 'no-cors', signal: controller.signal })
          .then(() => {
            clearTimeout(timeoutId);
            doRedirect();
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') return;
            showError();
          });
      })();
    </script>`,
    `
    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.08);
      border-radius: 50%;
      border-top-color: var(--primary-color);
      animation: spin 1s ease-in-out infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .url-text {
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: var(--text-secondary);
      word-break: break-all;
      margin: 16px 0;
      text-align: left;
    }
    .hidden {
      display: none !important;
    }
    `
  );
}

async function updateClickWithRetry(kv, code, linkData, isLastView, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (isLastView) {
        await kv.delete(`link:${code}`);
      } else {
        await kv.put(`link:${code}`, JSON.stringify(linkData));
      }

      const trendDate = new Date().toISOString().split('T')[0];
      const trendKey = `stats:clicks:${trendDate}`;
      const existing = await kv.get(trendKey);
      const trend = existing ? (typeof existing === 'string' ? JSON.parse(existing) : existing) : { date: trendDate, total: 0, links: 0 };
      trend.total = (trend.total || 0) + 1;
      await kv.put(trendKey, JSON.stringify(trend));

      return;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to update KV for ${code} after ${maxRetries} retries:`, err);
      } else {
        await new Promise(resolve => setTimeout(resolve, 200 * attempt));
      }
    }
  }
}

export default async function onRequest(context) {
  const { request, params } = context;
  const code = params.code;

  const urlStr = request.url || '';
  const isLocal = urlStr.includes('localhost') || urlStr.includes('127.0.0.1') || urlStr.includes('3000');

  // Serve static assets or directory root directly from origin storage/cache without checking KV.
  // This bypasses the edge function dynamic route matching for index.html, style.css, app.js, etc.
  if (!code || code.includes('.')) {
    if (isLocal) {
      // In local dev server emulation, static files are served by Express.
      // If a request hits here, it represents a non-existent static resource.
      return new Response('Not Found', { status: 404 });
    }
    return fetch(request);
  }

  if (code === 'admin') {
    const urlObj = new URL(request.url);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${urlObj.origin}/admin.html`
      }
    });
  }

  const kv = getKV(context);

  const unavailableHtml = htmlPage(
    '内容不可用',
    `<div class="card" style="text-align: center;">
      <a href="/" class="logo" style="justify-content: center;">⚡ Edge<span>Link</span></a>
      <div style="font-size: 3.5rem; margin-bottom: 16px;"></div>
      <h2 style="color: var(--danger-color); font-weight: 800;">内容不可用</h2>
      <p>此链接已过期、被删除或已达到查看次数限制。</p>
      <a href="/" class="btn btn-secondary">返回首页</a>
    </div>`
  );

  try {
    const linkJson = await kv.get(`link:${code}`);

    if (!linkJson) {
      return new Response(unavailableHtml, {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    let linkData;
    try {
      linkData = typeof linkJson === 'string' ? JSON.parse(linkJson) : linkJson;
    } catch (e) {
      linkData = {
        type: 'url',
        url: linkJson,
        code,
        createdAt: new Date().toISOString(),
        clicks: 0
      };
    }

    if (linkData.expiresAt) {
      const expiresTime = new Date(linkData.expiresAt).getTime();
      if (Date.now() > expiresTime) {
        await kv.delete(`link:${code}`);
        return new Response(unavailableHtml, {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Cache-Control': 'no-store'
          }
        });
      }
    }

    const clicks = linkData.clicks || 0;
    const viewLimit = linkData.viewLimit;

    const isText = linkData.type === 'text';
    if (isText && viewLimit) {
      const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie') || '';
      if (cookieHeader.includes(`viewed_${code}=true`)) {
        return new Response(unavailableHtml, {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
          }
        });
      }
    }

    const nextClicks = clicks + 1;
    const isLastView = viewLimit && (nextClicks >= viewLimit);

    const updateKVTask = updateClickWithRetry(kv, code, { ...linkData, clicks: nextClicks }, isLastView);

    if (context.waitUntil) {
      context.waitUntil(updateKVTask);
    }

    if (!linkData.type || linkData.type === 'url') {
      const redirectHtml = redirectHtmlPage(linkData.url);
      return new Response(redirectHtml, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    let badgeHtml = '';
    if (viewLimit) {
      badgeHtml = `<span class="badge badge-success">文字分享</span>`;
    } else {
      badgeHtml = `<span class="badge badge-success">文字分享 | 已查看: ${nextClicks} / 无限制</span>`;
    }

    const textSharingHtml = htmlPage(
      '文字分享',
      `<div class="card">
        <a href="/" class="logo">⚡ Edge<span>Link</span></a>
        <h2>文字分享内容</h2>
        ${badgeHtml}
        <div class="content-box" id="noteContent">${escapeHtml(linkData.text || '')}</div>
        <div class="actions">
          <a href="/" class="btn btn-primary">创建我的分享</a>
        </div>
      </div>
      ${viewLimit ? `
      <script>
        (function() {
          const key = 'viewed_' + ${JSON.stringify(code)};
          if (sessionStorage.getItem(key)) {
            document.body.innerHTML = \`<div class="bg-glow"></div>
            <div class="card" style="text-align: center;">
              <a href="/" class="logo" style="justify-content: center;">⚡ Edge<span>Link</span></a>
              <div style="font-size: 3.5rem; margin-bottom: 16px;"></div>
              <h2 style="color: var(--danger-color); font-weight: 800;">内容不可用</h2>
              <p>此链接已过期、被删除或已被安全销毁。</p>
              <a href="/" class="btn btn-secondary">返回首页</a>
            </div>\`;
          } else {
            sessionStorage.setItem(key, 'true');
          }
        })();
      </script>
      ` : ''}`
    );

    const responseHeaders = {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    if (viewLimit) {
      responseHeaders['Set-Cookie'] = `viewed_${code}=true; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`;
    }

    return new Response(textSharingHtml, {
      status: 200,
      headers: responseHeaders
    });

  } catch (err) {
    const errorHtml = htmlPage(
      'System Error',
      `<div class="card" style="text-align: center;">
        <a href="/" class="logo" style="justify-content: center;">⚡ Edge<span>Link</span></a>
        <div style="font-size: 3.5rem; margin-bottom: 16px;">⚠️</div>
        <h2 style="color: var(--danger-color); font-weight: 800;">System Error</h2>
        <p>${err.message}</p>
        <a href="/" class="btn btn-secondary">Go Home</a>
      </div>`
    );
    return new Response(errorHtml, {
      status: 500,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8'
      }
    });
  }
}