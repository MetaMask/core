/**
 * Shared Vitest configuration for packages in `packages/`, the counterpart to
 * `jest.config.packages.cjs`. Like `metamask-module-template`, it does not
 * enable `globals: true`.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const monorepoRoot = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(monorepoRoot, 'packages');

/**
 * Resolves `@metamask/*` to this repo's uncompiled source, falling back to
 * `node_modules`. `resolve.alias` cannot express the fallback, as an alias
 * always wins, whereas a `resolveId` hook can decline.
 *
 * NOTE: This must be synchronized with the `paths` option in
 * `tsconfig.packages.json`.
 *
 * @returns A Vite plugin.
 */
function resolveWorkspaceSources(): Plugin {
  const explicitTargets = new Map([
    ['@metamask/json-rpc-engine/v2', 'json-rpc-engine/src/v2/index.ts'],
    ['@metamask/utils/node', 'utils/src/node.ts'],
    [
      '@metamask/profile-sync-controller/auth',
      'profile-sync-controller/src/controllers/authentication/index.ts',
    ],
    [
      '@metamask/profile-sync-controller/user-storage',
      'profile-sync-controller/src/controllers/user-storage/index.ts',
    ],
  ]);

  return {
    name: 'metamask:resolve-workspace-sources',
    enforce: 'pre',
    resolveId(source) {
      const explicitTarget = explicitTargets.get(source);
      if (explicitTarget) {
        return path.join(packagesDir, explicitTarget);
      }

      const match = /^@metamask\/(?<name>[^/]+)$/u.exec(source);
      if (match?.groups) {
        const candidate = path.join(
          packagesDir,
          match.groups.name,
          'src',
          'index.ts',
        );
        if (existsSync(candidate)) {
          return candidate;
        }
      }

      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveWorkspaceSources()],

  test: {
    // On by default in Vitest; `yarn test:watch` opts back in.
    watch: false,

    include: ['{src,tests}/**/*.test.ts', '{src,tests}/**/*.test.tsx'],

    environment: 'node',

    // Jest's `setupFiles` and `setupFilesAfterEach`, which Vitest merges.
    setupFiles: [
      path.join(monorepoRoot, 'tests/vitest/setup.ts'),
      path.join(monorepoRoot, 'tests/vitest/setup-after-env.ts'),
    ],

    // Jest's `resetMocks` and `restoreMocks`.
    mockReset: true,
    restoreMocks: true,

    fakeTimers: {
      // Everything @sinonjs/fake-timers can fake except `nextTick` and
      // `queueMicrotask`, which the call sites used to exclude one by one with
      // Jest's `doNotFake`. Vitest has no `doNotFake` and no default `toFake`,
      // so the list has to be inclusive. Dropping `Intl` would quietly stop
      // `Intl.DateTimeFormat` following mocked time.
      toFake: [
        'Intl',
        'setTimeout',
        'clearTimeout',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'Date',
        'hrtime',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'performance',
      ],
    },

    coverage: {
      // `yarn test` sets `COLLECT_COVERAGE=false`, as does the Jest config, so
      // the root script need not know which runner a package uses.
      enabled: process.env.COLLECT_COVERAGE !== 'false',

      // `istanbul` is both more stable than `v8` and closer to the `babel`
      // provider used under Jest.
      provider: 'istanbul',

      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/index.ts', 'src/**/*.test.ts', 'src/**/*.test-d.ts'],

      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
