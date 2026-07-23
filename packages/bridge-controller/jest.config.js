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
    './src/bridge-controller.ts': {
      branches: 93.49,
      functions: 98.43,
      lines: 97.98,
      statements: 97.99,
    },
    './src/selectors.ts': {
      branches: 91.42,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    global: {
      branches: 92,
      functions: 98,
      lines: 98,
      statements: 98,
    },
  },
});
