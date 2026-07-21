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
  // TODO: Increase thresholds as more tests are added
  coverageThreshold: {
    global: {
      branches: 80.2,
      functions: 88.9,
      lines: 89.57,
      statements: 89.47,
    },
  },
});
