import { defineConfig } from 'vite';
import path from 'path';

function localEdgeFunctionsPlugin() {
  const attachMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/edge-functions/')) {
        return next();
      }

      const urlObj = new URL(req.url, 'http://localhost:3000');
      const slug = urlObj.pathname.replace(/^\/api\/edge-functions\//, '').split('/')[0].trim();
      if (!slug) {
        return next();
      }

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, apikey');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.end('ok');
        return;
      }

      try {
        // Ensure Deno shim is initialized before loading the Edge Function module
        await server.ssrLoadModule('/supabase/functions/_shared/deno_shim.ts');

        globalThis.__loadingEdgeFunctionSlug = slug;
        globalThis.__lastRegisteredEdgeHandler = null;
        const modulePath = `/supabase/functions/${slug}/index.ts`;
        await server.ssrLoadModule(modulePath);

        const handler =
          globalThis.__edgeFunctionHandlers?.get(slug) ||
          globalThis.__lastRegisteredEdgeHandler;

        if (typeof handler !== 'function') {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Edge function handler not found for ${slug}` }));
          return;
        }
        globalThis.__edgeFunctionHandlers.set(slug, handler);

        const chunks = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks);

        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers || {})) {
          if (Array.isArray(v)) headers.set(k, v.join(', '));
          else if (typeof v === 'string') headers.set(k, v);
        }

        const webReq = new Request(`http://localhost:3000/functions/v1/${slug}${urlObj.search}`, {
          method: req.method || 'POST',
          headers,
          body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : rawBody,
        });

        const webRes = await handler(webReq);
        res.statusCode = webRes.status || 200;
        webRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const responseText = await webRes.text();
        res.end(responseText);
      } catch (err) {
        console.error(`[localEdgeFunctionsPlugin] Error in ${slug}:`, err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            error: err?.message || String(err),
            details: err?.stack || String(err),
          })
        );
      }
    });
  };

  return {
    name: 'local-supabase-edge-functions',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'https://esm.sh/@supabase/supabase-js@2') {
        return path.resolve(process.cwd(), 'node_modules/@supabase/supabase-js/dist/main/index.js');
      }
      if (
        source === 'https://deno.land/std@0.177.0/http/server.ts' ||
        source === 'https://deno.land/std@0.168.0/http/server.ts'
      ) {
        return path.resolve(process.cwd(), 'supabase/functions/_shared/deno_shim.ts');
      }
      return null;
    },
    transform(code, id) {
      if (id.includes('/supabase/functions/') && (code.includes('https://deno.land/') || code.includes('https://esm.sh/'))) {
        const denoShimPath = path.resolve(process.cwd(), 'supabase/functions/_shared/deno_shim.ts');
        const transformed = code
          .replace(/['"]https:\/\/deno\.land\/std@[^'"]+\/http\/server\.ts['"]/g, JSON.stringify(denoShimPath))
          .replace(/['"]https:\/\/esm\.sh\/@supabase\/supabase-js@2['"]/g, '"@supabase/supabase-js"');
        return { code: transformed, map: null };
      }
      return null;
    },
    configureServer(server) {
      attachMiddleware(server);
    },
    configurePreviewServer(server) {
      attachMiddleware(server);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [localEdgeFunctionsPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
    watch: {
      ignored: ['**/tests/**', '**/test-results/**', '**/.system_generated/**', '**/.git/**'],
    },
    proxy: {
      '/api/supabase-mgmt': {
        target: 'https://api.supabase.com/v1',
        changeOrigin: true,
        rewrite: (pathStr) => pathStr.replace(/^\/api\/supabase-mgmt/, ''),
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      '/api/supabase-mgmt': {
        target: 'https://api.supabase.com/v1',
        changeOrigin: true,
        rewrite: (pathStr) => pathStr.replace(/^\/api\/supabase-mgmt/, ''),
      },
    },
  },
});
