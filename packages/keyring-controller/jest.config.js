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
      branches: 95.03,
      functions: 100,
      lines: 98.89,
      statements: 98.9,
    },
  },

  // These tests rely on the Crypto API
  testEnvironment: '<rootDir>/jest.environment.js',
});
