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
      branches: 86.88,
      functions: 92.26,
      lines: 96.67,
      statements: 97.71,
    },
  },

  // We rely on `XMLHttpRequest` to make requests
  testEnvironment: 'jsdom',
});
