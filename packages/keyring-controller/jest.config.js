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
      branches: 93.85,
      functions: 100,
      lines: 98.93,
      statements: 98.94,
    },
  },

  // These tests rely on the Crypto API
  testEnvironment: '<rootDir>/jest.environment.js',
});
