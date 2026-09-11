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

  // Fixtures hold data rather than logic, and `*.test-d.ts` files are type
  // tests run by `tsd` rather than Jest, so neither counts towards coverage.
  coveragePathIgnorePatterns: ['/__fixtures__/', '\\.test-d\\.ts$'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});
