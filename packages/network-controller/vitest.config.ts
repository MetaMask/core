import fs from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vitest/config';

const packagesDir = path.resolve(__dirname, '..');

/**
 * Vite plugin that resolves @metamask/* imports to local monorepo package
 * sources when available, falling back to node_modules for external packages.
 *
 * Unlike resolve.alias with a catch-all regex, this checks whether a local
 * package directory actually exists before rewriting the import.
 */
function resolveLocalMetaMaskPackages() {
  return {
    name: 'resolve-local-metamask-packages',
    enforce: 'pre' as const,
    resolveId(source: string) {
      const match = source.match(/^@metamask\/([^/]+)(?:\/(.+))?$/);
      if (!match) {
        return undefined;
      }

      const packageName = match[1];
      const subpath = match[2];

      const localSrc = path.join(packagesDir, packageName, 'src');
      if (!fs.existsSync(localSrc)) {
        return undefined;
      }

      if (subpath) {
        const subpathIndex = path.join(localSrc, subpath, 'index.ts');
        if (fs.existsSync(subpathIndex)) {
          return subpathIndex;
        }
        const subpathFile = path.join(localSrc, `${subpath}.ts`);
        if (fs.existsSync(subpathFile)) {
          return subpathFile;
        }
        return undefined;
      }

      return path.join(localSrc, 'index.ts');
    },
  };
}

export default defineConfig({
  plugins: [resolveLocalMetaMaskPackages()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: [
      '../../tests/vitest-setup.ts',
      '../../tests/setupAfterEnv/vitest-index.ts',
    ],
    testTimeout: 30_000,
    mockReset: true,
    restoreMocks: true,
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/index.ts'],
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      thresholds: {
        branches: 88.47,
        functions: 97.3,
        lines: 94.47,
        statements: 94.29,
      },
    },
  },
});
