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
        branches: 69,
        functions: 78,
        lines: 80,
        statements: 80,
      },
    },
  }),

  // Coverage is collected from real source files. Barrel files are excluded
  // because they only re-export the tested modules.
  // Applied after merge to fully replace (not concat) the base array.
  collectCoverageFrom: ['./src/**/*.ts', '!./src/**/index.ts'],
};
