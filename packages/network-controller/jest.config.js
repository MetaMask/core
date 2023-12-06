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
      branches: 76.27,
      functions: 95,
      lines: 92.09,
      statements: 91.68,
    },
  },

  // Currently the tests for NetworkController have a race condition which
  // causes intermittent failures. This seems to fix it.
  testEnvironment: 'jsdom',
});
