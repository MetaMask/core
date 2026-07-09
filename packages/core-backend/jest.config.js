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

  // Use jsdom for BackendWebSocketService tests
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {},

  // Exclude code generated from OpenAPI documents by Kubb (`yarn codegen`)
  // from coverage.
  coveragePathIgnorePatterns: ['/src/generated/'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 99,
      functions: 98,
      lines: 99,
      statements: 99,
    },
  },
});
