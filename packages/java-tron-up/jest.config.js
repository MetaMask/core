/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(import.meta.dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // The CLI entrypoint is exercised through package builds and installed-bin smoke tests.
  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    './src/bin/java-tron-up.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 60,
      lines: 65,
      statements: 65,
    },
  },
});
