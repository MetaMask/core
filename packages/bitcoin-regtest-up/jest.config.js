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

  // The CLI entrypoint is exercised through package builds and installed-bin smoke tests.
  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    './src/bin/bitcoin-regtest-up.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 62.5,
      functions: 100,
      lines: 93.26,
      statements: 93.33,
    },
  },
});
