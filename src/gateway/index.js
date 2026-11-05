// Zyntra API Gateway: punto de entrada único (/api/*) hacia los microservicios.
import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT = Number(process.env.PORT ?? 3000);
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL ?? 'http://127.0.0.1:8000';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://127.0.0.1:4000';
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');

const proxy = (target, pathFilter) =>
  createProxyMiddleware({
    target,
    pathFilter,
    changeOrigin: true,
    pathRewrite: { '^/api': '' }, // /api/events -> /events
    on: {
      error: (err, _req, res) => {
        console.error(`[gateway] ${target}: ${err.message}`);
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Servicio no disponible' }));
      },
    },
  });

const app = express();
app.use(cors({ origin: CORS_ORIGINS }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(proxy(EVENT_SERVICE_URL, '/api/events'));
app.use(proxy(USER_SERVICE_URL, ['/api/auth', '/api/users']));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`);
  console.log(`  /api/events      -> ${EVENT_SERVICE_URL}`);
  console.log(`  /api/auth|users  -> ${USER_SERVICE_URL}`);
});
