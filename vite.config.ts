import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    lib: {
      entry: {
        main: path.resolve(__dirname, 'src/main/index.ts'),
        renderer: path.resolve(__dirname, 'src/renderer/index.ts')
      },
      formats: ['cjs', 'es']
    },
    rollupOptions: {
      external: [
        // React ecosystem (provided by host)
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-router-dom',

        // Citadel host packages
        '@citadel-app/core',
        '@citadel-app/ui',
        '@citadel-app/sdk',

        // UI libraries (provided by host)
        'lucide-react',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-slot',
        'clsx',
        'tailwind-merge',

        // Electron & Node builtins (main process)
        'electron',
        '@electron-toolkit/utils',
        'fs',
        'fs-extra',
        'path',
        'os',
        'http',
        'net',
        'child_process',
        'util',
        'events',
        'stream',
        'url',
        'crypto',
        'module',
        'better-sqlite3',

        // ws is used by the LSP server in main — keep it external since host provides it
        'ws'
      ],
      output: [
        {
          dir: 'dist',
          format: 'cjs',
          entryFileNames: '[name].js',
          exports: 'named'
        }
      ]
    }
  }
});
