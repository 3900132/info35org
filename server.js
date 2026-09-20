import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON and text bodies
app.use(express.json());
app.use(express.text());

// Initialize local mock KV storage
globalThis.__mockKV = new Map();

// Pre-populate with sample records for instant local validation
globalThis.__mockKV.set('link:google', JSON.stringify({
  type: 'url',
  code: 'google',
  url: 'https://www.google.com',
  createdAt: new Date().toISOString(),
  clicks: 12,
  viewLimit: null,
  customCode: true
}));
globalThis.__mockKV.set('link:note', JSON.stringify({
  type: 'text',
  code: 'note',
  text: 'Hello from EdgeLink! This is a secure text share note with a view count limit of 5.',
  createdAt: new Date().toISOString(),
  clicks: 0,
  viewLimit: 5,
  customCode: true
}));

// Local environment variables simulating EdgeOne console bindings
// (pass through all process.env so email provider keys work locally too)
const LOCAL_ENV = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'admin123',
  ...process.env
};

// Helper: Converts Express req/res to Web API Request/Response
function buildWebContext(req, res) {
  // Build headers
  const headers = new Headers();
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  });

  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  // Build Request object
  const webRequest = {
    method: req.method,
    url: fullUrl,
    headers: headers,
    // Emulate cloned json reader
    json: async () => req.body,
    clone: () => ({
      json: async () => req.body
    })
  };

  return {
    request: webRequest,
    params: req.params || {},
    env: LOCAL_ENV,
    waitUntil: (promise) => {
      // Execute in background
      promise.catch(err => console.error('[Local Emulation] Error in background task (waitUntil):', err));
    }
  };
}

// Helper: Send standard Response to Express res
async function sendResponse(webRes, expressRes) {
  // Copy headers
  webRes.headers.forEach((val, key) => {
    expressRes.setHeader(key, val);
  });
  
  // Send status
  expressRes.status(webRes.status);
  
  // Send body
  const body = await webRes.text();
  expressRes.send(body);
}

// API Routes
app.post('/api/create', async (req, res) => {
  try {
    const { default: handler } = await import('./edge-functions/api/create.js');
    const context = buildWebContext(req, res);
    const webRes = await handler(context);
    await sendResponse(webRes, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Local Emulation Error: ${err.message}` });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { default: handler } = await import('./edge-functions/api/stats.js');
    const context = buildWebContext(req, res);
    const webRes = await handler(context);
    await sendResponse(webRes, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Local Emulation Error: ${err.message}` });
  }
});

app.get('/api/admin/list', async (req, res) => {
  try {
    const { default: handler } = await import('./edge-functions/api/admin/list.js');
    const context = buildWebContext(req, res);
    const webRes = await handler(context);
    await sendResponse(webRes, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Local Emulation Error: ${err.message}` });
  }
});

app.delete('/api/admin/delete', async (req, res) => {
  try {
    const { default: handler } = await import('./edge-functions/api/admin/delete.js');
    const context = buildWebContext(req, res);
    const webRes = await handler(context);
    await sendResponse(webRes, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Local Emulation Error: ${err.message}` });
  }
});

// Serve frontend assets
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/qrcode.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'qrcode.min.js'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.js'));
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Serve self-hosted fonts
app.get('/fonts.css', (req, res) => {
  res.type('text/css').sendFile(path.join(__dirname, 'fonts.css'));
});
app.use('/fonts', express.static(path.join(__dirname, 'fonts'), {
  setHeaders: (res) => res.setHeader('Access-Control-Allow-Origin', '*'),
}));

app.get('/api/admin/trend', async (req, res) => {
  try {
    const { default: handler } = await import('./edge-functions/api/admin/trend.js');
    const context = buildWebContext(req, res);
    const webRes = await handler(context);
    await sendResponse(webRes, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Local Emulation Error: ${err.message}` });
  }
});

// Auth, settings and user management routes (local emulation)
const edgeRoutes = [
  { method: 'get',    path: '/api/settings',              file: './edge-functions/api/settings.js' },
  { method: 'get',    path: '/api/admin/settings',        file: './edge-functions/api/admin/settings.js' },
  { method: 'post',   path: '/api/admin/settings',        file: './edge-functions/api/admin/settings.js' },
  { method: 'post',   path: '/api/auth/register',         file: './edge-functions/api/auth/register.js' },
  { method: 'post',   path: '/api/auth/send-code',        file: './edge-functions/api/auth/send-code.js' },
  { method: 'post',   path: '/api/auth/login',            file: './edge-functions/api/auth/login.js' },
  { method: 'post',   path: '/api/auth/logout',           file: './edge-functions/api/auth/logout.js' },
  { method: 'get',    path: '/api/auth/me',               file: './edge-functions/api/auth/me.js' },
  { method: 'get',    path: '/api/my/links',              file: './edge-functions/api/my/links.js' },
  { method: 'get',    path: '/api/admin/users',           file: './edge-functions/api/admin/users.js' },
  { method: 'post',   path: '/api/admin/users/status',    file: './edge-functions/api/admin/users/status.js' },
  { method: 'get',    path: '/api/admin/users/links',     file: './edge-functions/api/admin/users/links.js' },
  { method: 'delete', path: '/api/admin/users/delete',    file: './edge-functions/api/admin/users/delete.js' },
  { method: 'post',   path: '/api/admin/users/delete',    file: './edge-functions/api/admin/users/delete.js' }
];

for (const route of edgeRoutes) {
  app[route.method](route.path, async (req, res) => {
    try {
      const { default: handler } = await import(route.file);
      const context = buildWebContext(req, res);
      const webRes = await handler(context);
      await sendResponse(webRes, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `Local Emulation Error: ${err.message}` });
    }
  });
}

// SEO / GEO static files
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').sendFile(path.join(__dirname, 'robots.txt'));
});
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').sendFile(path.join(__dirname, 'sitemap.xml'));
});
app.get('/llms.txt', (req, res) => {
  res.type('text/plain; charset=utf-8').sendFile(path.join(__dirname, 'llms.txt'));
});
app.get('/llms-full.txt', (req, res) => {
  res.type('text/plain; charset=utf-8').sendFile(path.join(__dirname, 'llms-full.txt'));
});

// Root path serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Redirection handler (/:code)
app.get('/:code', async (req, res) => {
  const code = req.params.code;
  
  // Skip static assets and API routes
  if (
    code.includes('.') || 
    code === 'api' || 
    code === 'admin' ||
    req.path.startsWith('/api/')
  ) {
    return res.status(404).send('Not Found');
  }

  try {
    const { default: handler } = await import('./edge-functions/[code].js');
    const context = buildWebContext(req, res);
    const webRes = await handler(context);
    await sendResponse(webRes, res);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Local Emulation Redirect Error: ${err.message}`);
  }
});

// Start listening
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🚀 EdgeLink Local Emulation Server running at:`);
  console.log(`   👉 http://localhost:${PORT}`);
  console.log('==================================================');
  console.log(`🔑 Default ADMIN_TOKEN for Admin Panel: admin123`);
  console.log('==================================================');
});
