/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // The e2e test constructs a real KeyringController, which needs the Web
  // Crypto API; this environment polyfills `crypto` when the test realm (Node
  // < 21 under --experimental-vm-modules) lacks it.
  testEnvironment: '<rootDir>/jest.environment.js',

  // The test harness in `src/test/` is exercised by the command tests but
  // not all of its error/edge branches are worth driving directly — it's
  // production code's test infrastructure, not production code itself. The
  // daemon e2e is skipped from this run (below), so it never executes here and
  // must also be excluded from coverage, or it would report as 0%-covered
  // source.
  coveragePathIgnorePatterns: [
    '.*/src/test/.*',
    '.*\\.daemon-e2e\\.test\\.ts$',
  ],

  // The subprocess daemon e2e (`*.daemon-e2e.test.ts`) spawns the built CLI and
  // the native sqlite addon; it has its own config (`jest.config.e2e.js`, run
  // via `yarn test:e2e`) and must not run in — or be coverage-gated by — the
  // fast unit suite.
  testPathIgnorePatterns: ['/node_modules/', '\\.daemon-e2e\\.test\\.ts$'],

  // The subprocess e2e suite lives in `tests/` and has its own config
  // (`jest.config.e2e.js`, run via `yarn test:e2e`); it spawns the built CLI
  // and must not run in the fast unit suite.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});
