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

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: ['!./src/**/*.test-d.ts'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 67.25,
      functions: 81.57,
      lines: 79.71,
      statements: 79.83,
    },
  },
});
