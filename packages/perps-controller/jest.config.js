/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);

module.exports = {
  ...merge(baseConfig, {
    // The display name when running multiple projects
    displayName,

    // An object that configures minimum threshold enforcement for coverage results
    coverageThreshold: {
      global: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  }),

  // Coverage is scoped to the placeholder test file only (not synced source).
  // The real source files are synced from Mobile and tested there.
  // When tests are migrated from Mobile to Core, restore this to
  // the default ('./src/**/*.ts') and raise thresholds accordingly.
  // Applied after merge to fully replace (not concat) the base array.
  collectCoverageFrom: ['./tests/placeholder.test.ts'],
};
