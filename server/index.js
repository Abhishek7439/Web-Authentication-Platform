import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { apiLimiter } from './middleware/rate-limiter.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import approvalsRouter from './routes/approvals.js';
import policiesRouter from './routes/policies.js';
import auditRouter from './routes/audit.js';
import recoveryRouter from './routes/recovery.js';
import { initializeRealtime } from './realtime/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// ── Core Middleware ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Relaxed for SPA
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ── Initialize Database + Seed ──────────────────────
const db = getDb();
seedDatabase();
console.log('[db] SQLite initialized at:', process.env.DB_PATH || './data/commander.db');

// ── Routes ──────────────────────────────────────────
// Health check (no /api prefix, no rate limit)
app.use(healthRouter);

// API routes
app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/recovery', recoveryRouter);

// ── Static Files ────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';
const distPath = path.join(__dirname, '..', 'dist');
const clientPath = path.join(__dirname, '..', 'client');
const distExists = fs.existsSync(path.join(distPath, 'index.html'));

if (distExists) {
  // Production: serve built assets
  app.use(express.static(distPath));
} else if (isDev) {
  // Dev: serve client/ directly (Vite handles JS/CSS hot reload via proxy)
  app.use(express.static(clientPath));
}

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    return res.status(404).json({ error: 'not_found', message: 'Route not found.' });
  }
  if (distExists) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  if (isDev) {
    return res.sendFile(path.join(clientPath, 'index.html'));
  }
  res.status(503).send('Run "npm run build" first, or use Vite dev server at http://localhost:5173');
});

// ── Socket.IO Real-Time ─────────────────────────
initializeRealtime(httpServer);

// ── Start Server ────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`[server] Commander Auth running on port ${PORT}`);
  console.log(`[server] WebAuthn RP: ${process.env.WEBAUTHN_RP_ID || 'localhost'}`);
  console.log(`[server] Origin: ${process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173'}`);
});

// ── Graceful Shutdown ───────────────────────────────
process.on('SIGINT', () => {
  console.log('[server] Shutting down...');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[server] Shutting down...');
  closeDb();
  process.exit(0);
});

export { app, httpServer };
