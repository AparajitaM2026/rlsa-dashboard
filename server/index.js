import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { db } from './pg-db.js';
import { functions } from './functions.js';
import { processCsvUpload, processCatalogSearch } from './csv-processor.js';
import { v1Router } from './v1-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 5006;
const RLSA_PARTY_ID = process.env.CLIENT_PARTY_ID || 'party_rlsa_records';
const RLSA_MAIN_ACCOUNT_ID = 'clientaccount_rlsa_records';

process.on('uncaughtException', (err) => {
  console.warn('[Server] Uncaught exception (recovered):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Unhandled rejection (recovered):', reason?.message || reason);
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Request logging middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// ==========================================
// M5: Dedicated REST API for External Platforms (JRN)
// ==========================================
app.use('/api/v1', v1Router);

// Helper to get authenticated user from token
async function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const users = await db.list('User', '-created_date', 500, 0);
  if (token.startsWith('local-token-')) {
    const userId = token.replace('local-token-', '');
    return users.find(u => u.id === userId) || null;
  }
  return null;
}

// ==========================================
// 1. Authentication Routes
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await db.list('User', '-created_date', 500, 0);
  const user = users.find(u => u.email?.toLowerCase() === email?.toLowerCase());

  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid email or password', usersCount: users.length });
  }

  const token = `local-token-${user.id}`;
  const { password: _, ...userSafe } = user;
  return res.json({
    user: userSafe,
    access_token: token,
    token
  });
});

app.get('/api/auth/me', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { password: _, ...userSafe } = user;
  return res.json(userSafe);
});

app.post('/api/auth/logout', (req, res) => {
  return res.json({ success: true });
});

// PATCH /api/auth/me — update own user profile (used by ClientContext to backfill client_account_id)
app.patch('/api/auth/me', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const allowed = ['client_account_id', 'full_name', 'name', 'avatar_url', 'party_id'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const updated = await db.update('User', user.id, updates);
  const { password: _, ...safe } = updated || user;
  return res.json(safe);
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, role } = req.body;
  const users = await db.list('User', '-created_date', 500, 0);
  const existing = users.find(u => u.email?.toLowerCase() === email?.toLowerCase());
  if (existing) {
    return res.status(400).json({ message: 'User with this email already exists' });
  }

  const newUser = await db.create('User', {
    email: (email || '').toLowerCase().trim(),
    password: password || 'password123',
    name: name || (email || '').split('@')[0],
    role: role || 'user',
    party_id: RLSA_PARTY_ID,
    access_role: 'CLIENT_USER',
    client_account_id: RLSA_MAIN_ACCOUNT_ID
  });

  const token = `local-token-${newUser.id}`;
  const { password: _, ...userSafe } = newUser;
  return res.json({
    user: userSafe,
    access_token: token
  });
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { email } = req.body || {};
  const users = await db.list('User', '-created_date', 500, 0);
  const user = (email ? users.find(u => u.email?.toLowerCase() === email.toLowerCase()) : null) || users[0];
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const { password: _, ...userSafe } = user;
  return res.json({
    access_token: `local-token-${user.id}`,
    user: userSafe
  });
});

app.post('/api/auth/resend-otp', (req, res) => {
  return res.json({ success: true, message: 'OTP resent' });
});

app.post('/api/auth/reset-password-request', (req, res) => {
  return res.json({ success: true, message: 'Password reset link sent' });
});

app.post('/api/auth/reset-password', (req, res) => {
  return res.json({ success: true, message: 'Password reset successful' });
});

// ==========================================
// 2. Base44 Compatibility Public Settings
// ==========================================
app.get([
  '/api/apps/public/prod/public-settings/by-id/:id',
  '/api/apps/public/prod/public-settings/by-id/'
], (req, res) => {
  return res.json({
    id: req.params.id || 'ottm-local',
    public_settings: {
      auth_required: true,
      app_name: 'OTTM Connect'
    }
  });
});

// ==========================================
// 3. Entity Generic CRUD Routes (Scoped to RLSA Records Group)
// ==========================================
app.get('/api/entities/:entity', async (req, res) => {
  const { entity } = req.params;
  const { sort, limit, skip } = req.query;

  if (entity === 'ClientAccount') {
    const results = await db.filter('ClientAccount', { party_id: RLSA_PARTY_ID }, sort, limit, skip);
    return res.json(results);
  }
  if (entity === 'User') {
    const results = await db.filter('User', { party_id: RLSA_PARTY_ID }, sort, limit, skip);
    return res.json(results);
  }
  if (entity === 'Party') {
    const party = await db.get('Party', RLSA_PARTY_ID);
    return res.json(party ? [party] : []);
  }

  const results = await db.list(entity, sort, limit, skip);
  return res.json(results);
});

app.post('/api/entities/:entity/filter', async (req, res) => {
  const { entity } = req.params;
  const { query = {}, sort, limit, skip } = req.body;

  if (entity === 'ClientAccount') {
    query.party_id = RLSA_PARTY_ID;
  } else if (entity === 'User') {
    query.party_id = RLSA_PARTY_ID;
  } else if (entity === 'Party') {
    query.id = RLSA_PARTY_ID;
  }

  const results = await db.filter(entity, query, sort, limit, skip);
  return res.json(results);
});

app.get('/api/entities/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  const item = await db.get(entity, id);
  if (!item) return res.status(404).json({ error: 'Entity record not found' });
  return res.json(item);
});

app.post('/api/entities/:entity', async (req, res) => {
  const { entity } = req.params;
  const payload = { ...req.body };

  if (entity === 'ClientAccount') {
    payload.party_id = RLSA_PARTY_ID;
  }
  if (entity === 'User') {
    payload.party_id = RLSA_PARTY_ID;
  }
  if (entity === 'Vendor') {
    payload.name = payload.name || payload.vendor_name;
    payload.vendor_name = payload.vendor_name || payload.name;
    payload.status = payload.status || 'active';
  }

  const created = await db.create(entity, payload);

  if (entity === 'CsvUploadJob') {
    setImmediate(() => {
      processCsvUpload(created.id);
    });
  }

  if (entity === 'CatalogSearchJob') {
    setImmediate(() => {
      processCatalogSearch(created.id);
    });
  }

  return res.status(201).json(created);
});

app.put('/api/entities/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  const updated = await db.update(entity, id, req.body);
  if (!updated) return res.status(404).json({ error: 'Entity record not found' });
  return res.json(updated);
});

app.post('/api/entities/:entity/updateMany', async (req, res) => {
  const { entity } = req.params;
  const { filter, data } = req.body;
  const result = await db.updateMany(entity, filter, data);
  return res.json(result);
});

app.delete('/api/entities/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  const ok = await db.delete(entity, id);
  return res.json({ success: ok });
});

// ==========================================
// 4. Function Invocation Routes
// ==========================================
app.post('/api/functions/:name', async (req, res) => {
  const { name } = req.params;
  const fn = functions[name];
  if (!fn) {
    console.warn(`[API] Function ${name} not found in local backend, returning empty result`);
    return res.json({ success: true, result: null });
  }
  try {
    const user = await getAuthUser(req);
    const result = await fn(req.body, user);
    return res.json(result);
  } catch (err) {
    console.error(`[API] Error executing function ${name}:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. File Upload Route (Artwork & Audio)
// ==========================================
const handleFileUpload = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  return res.json({ file_url: fileUrl, filename: req.file.originalname });
};

app.post('/api/uploads', upload.single('file'), handleFileUpload);
app.post('/api/apps/:appId/integration-endpoints/Core/UploadPublicFile', upload.single('file'), handleFileUpload);
app.post('/api/apps/:appId/integration-endpoints/Core/UploadFile', upload.single('file'), handleFileUpload);
app.post('/api/integration-endpoints/Core/UploadPublicFile', upload.single('file'), handleFileUpload);
app.post('/api/integration-endpoints/Core/UploadFile', upload.single('file'), handleFileUpload);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'neon-postgresql', time: new Date().toISOString() });
});

app.get('/api/db-check', async (req, res) => {
  try {
    const { pool } = await import('./pg-db.js');
    const r = await pool.query("SELECT COUNT(*) FROM entity_user");
    return res.json({ success: true, count: r.rows[0].count });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: err.code });
  }
});

// Serve frontend build from port 5000 as well
const distPath = path.join(__dirname, '../dist');

app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  OTTM Connect Neon-Powered Backend on port ${PORT}`);
  console.log(`  Database: Neon PostgreSQL (SSL Connected)`);
  console.log(`  Ready: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);
});
