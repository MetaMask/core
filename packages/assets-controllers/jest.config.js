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
      branches: 84.86,
      functions: 92.35,
      lines: 94.26,
      statements: 94.19,
    },
  },

  // We rely on `window` to make requests
  testEnvironment: '<rootDir>/jest.environment.js',
});
