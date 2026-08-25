import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  // The shared .env lives at the repository root, not in web/. Without this,
  // VITE_API_BASE_URL in .env would never reach import.meta.env and api.ts
  // would silently use its fallback.
  const env = loadEnv(mode, repoRoot, 'VITE_');
  if (mode === 'development') {
    console.info(
      `[karea] API base URL: ${env.VITE_API_BASE_URL || '(unset, api.ts uses fallback)'}`,
    );
  }

  return {
    envDir: repoRoot,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  };
});
