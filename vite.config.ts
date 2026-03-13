import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001'
  return {
    base: env.VITE_BASE_PATH || '/',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      sourcemap: false,
      // Raise warning threshold slightly — we split at chunk level now
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          /**
           * Manual chunk grouping strategy:
           * - "vendor-fabric": Fabric.js (~700KB) — large canvas lib, rarely changes
           * - "vendor-dnd": @dnd-kit/* — drag-and-drop utilities
           * - "vendor-react": React core — long-lived cache hits
           * - "vendor-supabase": Supabase client
           * Each chunk gets its own immutable cache hash, so users only re-download
           * the chunk that actually changed in a deploy.
           */
          manualChunks(id) {
            // Fabric.js — the largest single dependency
            if (id.includes('node_modules/fabric')) {
              return 'vendor-fabric';
            }
            // DND-kit family
            if (id.includes('node_modules/@dnd-kit')) {
              return 'vendor-dnd';
            }
            // Supabase
            if (id.includes('node_modules/@supabase')) {
              return 'vendor-supabase';
            }
            // React & React-DOM core
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react-router-dom') ||
                id.includes('node_modules/scheduler/')) {
              return 'vendor-react';
            }
            // Lucide icons — medium size, changes with app icon updates
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
          }
        }
      }
    },
    resolve: {
      dedupe: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
      alias: {
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
        'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
        'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
        'react-dom/server': path.resolve(__dirname, 'node_modules/react-dom/server'),
        'react-dom/test-utils': path.resolve(__dirname, 'node_modules/react-dom/test-utils'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
      ],
    },
    plugins: [
      react(),
      tsconfigPaths()
    ],
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/openai/, ''),
        },
      },
    },
  }
})

// Trigger dev server restart for version update (v7.0 - deployed)
