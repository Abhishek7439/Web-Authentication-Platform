import { Router } from 'express';

const router = Router();

/**
 * GET /health
 * Lightweight health check — no DB query, pure in-memory.
 * Used by external keep-alive pinger during demo window.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
