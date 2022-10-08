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
      branches: 81.46,
      functions: 98.86,
      lines: 96.22,
      statements: 96.38,
    },
  },

  // We rely on `XMLHttpRequest` to make requests
  testEnvironment: 'jsdom',
});
