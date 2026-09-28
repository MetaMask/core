/**
 * Shared Vitest configuration for packages in `packages/`.
 *
 * This is the Vitest counterpart to `jest.config.packages.cjs`. Packages that
 * have been migrated extend this from their own `vitest.config.mts`; packages
 * that have not yet been migrated keep using `jest.config.cjs`.
 *
 * Like `metamask-module-template`, this deliberately does not enable
 * `globals: true` — test files import `describe`, `it`, `expect`, `vi` and the
 * hooks from `vitest` explicitly.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const monorepoRoot = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(monorepoRoot, 'packages');

/**
 * Resolves `@metamask/*` imports to the uncompiled source code for packages that
 * live in this repo, falling back to the published versions in `node_modules`
 * for those that do not.
 *
 * This replaces the `moduleNameMapper` entries in `jest.config.packages.cjs`.
 * `resolve.alias` cannot express it, because Jest's array form tries each target
 * in turn whereas an alias always wins; a `resolveId` hook can decline to
 * resolve, which gives us the same "workspace first, then `node_modules`"
 * behaviour.
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
    // Vitest enables watch mode by default. We disable it here, so it can be
    // explicitly enabled with `yarn test:watch`.
    watch: false,

    include: ['{src,tests}/**/*.test.ts', '{src,tests}/**/*.test.tsx'],

    environment: 'node',

    // Jest splits these into `setupFiles` (before the test framework) and
    // `setupFilesAfterEach` (after it); Vitest has a single hook for both.
    setupFiles: [
      path.join(monorepoRoot, 'tests/vitest/setup.ts'),
      path.join(monorepoRoot, 'tests/vitest/setup-after-env.ts'),
    ],

    // Jest's `resetMocks` and `restoreMocks`.
    mockReset: true,
    restoreMocks: true,

    fakeTimers: {
      // Under Jest these tests each passed
      // `doNotFake: ['nextTick', 'queueMicrotask']`. Vitest's fake-timer options
      // have no `doNotFake`, and it sets no default for `toFake` either, so
      // @sinonjs/fake-timers would otherwise fake everything it can - including
      // the two we need left alone. Stating the inclusive list here once keeps
      // the behaviour identical without repeating it at every call site.
      //
      // This is everything @sinonjs/fake-timers can fake except `nextTick` and
      // `queueMicrotask`. `Intl` matters: Jest was faking it, so leaving it out
      // would quietly stop `Intl.DateTimeFormat` following mocked time. The
      // browser-only entries are absent from the Node global and are ignored
      // there, but do apply under the jsdom environment.
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
      // The monorepo-wide run (`yarn test`) sets `COLLECT_COVERAGE=false` to skip
      // this, because collecting coverage for every package at once is slow.
      // `jest.config.packages.cjs` reads the same variable, which is what lets
      // the root script stay runner-agnostic.
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
