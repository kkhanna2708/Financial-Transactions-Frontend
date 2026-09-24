import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // strictPort: the backend's CORS allow-list is http://localhost:5173, so fail loudly
  // instead of silently moving to 5174 (which would surface as CORS errors).
  server: { port: 5174, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    testTimeout: 10000,
  },
});
