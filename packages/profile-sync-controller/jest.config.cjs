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
      branches: 85.03,
      functions: 93.03,
      lines: 95.15,
      statements: 95.19,
    },
  },

  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    '/__fixtures__/',
    '/mocks/',
    'index.ts',
  ],

  // These tests rely on the Crypto API
  testEnvironment: '<rootDir>/jest.environment.cjs',
});
