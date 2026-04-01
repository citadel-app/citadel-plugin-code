import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const external = [
  'react', 'react-dom', 'react/jsx-runtime', 'react-router-dom',
  '@citadel-app/core', '@citadel-app/ui', '@citadel-app/sdk',
  'lucide-react', '@radix-ui/react-dropdown-menu', '@radix-ui/react-slot', 'clsx', 'tailwind-merge',
  'electron', '@electron-toolkit/utils', 'fs', 'fs-extra', 'path', 'os', 'http', 'net',
  'child_process', 'util', 'events', 'stream', 'url', 'crypto', 'module', 'better-sqlite3', 'ws'
];

export default defineConfig(({ mode }) => {
  const isMain = mode === 'main';

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: isMain || (!true && mode === 'renderer'), // clear outDir only on first run
      lib: {
        entry: path.resolve(__dirname, isMain ? 'src/main/index.ts' : 'src/renderer/index.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        external,
        output: {
          inlineDynamicImports: true,
          entryFileNames: isMain ? 'main.js' : 'renderer.js'
        }
      }
    }
  };
});
