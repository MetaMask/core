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

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 87.01,
      functions: 93.06,
      lines: 97.83,
      statements: 97.86,
    },
  },

  // We rely on `XMLHttpRequest` to make requests
  testEnvironment: 'jsdom',
});
