/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages.cjs');

const displayName = path.basename(__dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    // This file is tested indirectly in other packages' test suites.
    '.*/MockPollingBlockTracker\\.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 98.38,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});
