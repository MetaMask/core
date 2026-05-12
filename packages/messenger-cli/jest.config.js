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

  // cli.ts is tested via execa subprocess in cli.test.ts; Jest can't instrument it
  coveragePathIgnorePatterns: ['./src/cli.ts'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 97.33,
      functions: 100,
      lines: 97.59,
      statements: 97.6,
    },
  },
});
