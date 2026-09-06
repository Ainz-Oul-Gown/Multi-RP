import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
    proxy: {
      '/api/supabase-mgmt': {
        target: 'https://api.supabase.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supabase-mgmt/, ''),
      },
    },
  },
});
