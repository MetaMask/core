/*
 * Jest configuration for the subprocess daemon e2e suite (`*.daemon-e2e.test.ts`).
 *
 * Kept separate from `jest.config.js` because this suite spawns the BUILT `mm`
 * CLI and the native `better-sqlite3` addon as real child processes: it must
 * stay out of the fast unit `test` run and must not be held to that run's
 * 100%-coverage gate (subprocess work is invisible to in-process coverage).
 * Run it with `yarn test:e2e`.
 */

const merge = require('deepmerge');

const baseConfig = require('../../jest.config.packages');

module.exports = merge(baseConfig, {
  displayName: 'wallet-cli:e2e',

  // Only the subprocess e2e suite; the default config runs everything else.
  testMatch: ['**/*.daemon-e2e.test.ts'],

  // Coverage is meaningless here — the work happens in spawned processes — so
  // collecting it would only report the e2e harness as uncovered source.
  collectCoverage: false,

  // The CLI runs in a normal Node process with the Web Crypto globals, so this
  // suite needs neither the `jest.environment.js` polyfill nor any coverage
  // threshold.
  testEnvironment: 'node',
});
