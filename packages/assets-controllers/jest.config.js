/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const path = require('path');
const merge = require('deepmerge');
const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 88.7,
      functions: 96.45,
      lines: 96.55,
      statements: 96.63,
    },
  },

  // We rely on `window` to make requests
  testEnvironment: 'jsdom',
});
