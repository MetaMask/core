/**
 * Shared Vitest configuration for packages in `packages/`, the counterpart to
 * `jest.config.packages.cjs`. Like `metamask-module-template`, it does not
 * enable `globals: true`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const monorepoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Applies the `paths` option from the package's `tsconfig.json`, which
    // resolves `@metamask/*` to the uncompiled source of packages in this
    // repo and falls back to `node_modules` for the rest. One mapping, not
    // two.
    tsconfigPaths: true,
  },

  test: {
    // On by default in Vitest; `yarn test:watch` opts back in.
    watch: false,

    include: ['src/**/*.test.ts'],

    // Jest's `setupFiles` and `setupFilesAfterEach`, which Vitest merges.
    setupFiles: [
      path.join(monorepoRoot, 'tests/vitest/setup.ts'),
      path.join(monorepoRoot, 'tests/vitest/setup-after-env.ts'),
    ],

    // Jest's `resetMocks` and `restoreMocks`.
    mockReset: true,
    restoreMocks: true,

    fakeTimers: {
      // Jest's `doNotFake`, which the call sites used to pass one by one. With
      // neither option set, @sinonjs/fake-timers fakes everything it can.
      toNotFake: ['nextTick', 'queueMicrotask'],
    },

    coverage: {
      // `yarn test` sets `COLLECT_COVERAGE=false`, as does the Jest config, so
      // the root script need not know which runner a package uses.
      enabled: process.env.COLLECT_COVERAGE !== 'false',

      // `istanbul` is both more stable than `v8` and closer to the `babel`
      // provider used under Jest.
      provider: 'istanbul',

      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.test.ts', 'src/**/*.d.ts'],

      reporter: ['text', 'html', 'json-summary', 'lcovonly'],
      reportsDirectory: 'coverage',
    },
  },
});
