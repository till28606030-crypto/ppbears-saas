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
      sourcemap: false, // 關閉 sourcemap 以節省空間且減少上傳負擔
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

// Trigger dev server restart for version update (v4.4)
