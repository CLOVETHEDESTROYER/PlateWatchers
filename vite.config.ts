import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // When running under `vercel dev`, PORT is set — skip SSL since vercel handles it
  const isVercelDev = !!process.env.PORT;
  return {
    server: {
      port: parseInt(process.env.PORT || '3000'),
      host: '0.0.0.0',
    },
    plugins: [react(), ...(isVercelDev ? [] : [basicSsl()])],
    define: {
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
