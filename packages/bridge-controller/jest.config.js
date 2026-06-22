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
      branches: 94.89,
      functions: 98.43,
      lines: 98.79,
      statements: 98.79,
    },
    './src/selectors.ts': {
      branches: 91.58,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    global: {
      branches: 93,
      functions: 98,
      lines: 99,
      statements: 99,
    },
  },
});
