import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/replyai-intro/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.PORT || '22043'),
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
});
