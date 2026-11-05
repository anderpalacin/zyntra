import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api se reenvía al gateway (por defecto localhost:3000).
// Cambia el destino con GATEWAY_URL, p. ej. GATEWAY_URL=http://localhost:3001
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.GATEWAY_URL ?? 'http://localhost:3000', changeOrigin: true },
      },
    },
  };
});
