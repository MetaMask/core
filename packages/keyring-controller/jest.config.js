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
      branches: 80.55,
      functions: 98.93,
      lines: 96.11,
      statements: 96.14,
    },
  },

  // These tests rely on the Crypto API
  testEnvironment: '<rootDir>/jest.environment.js',
});
