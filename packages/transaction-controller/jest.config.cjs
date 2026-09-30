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

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 94.04,
      functions: 93.9,
      lines: 97.29,
      statements: 97.26,
    },
  },

  // We rely on `XMLHttpRequest` to make requests
  testEnvironment: 'jsdom',
});
