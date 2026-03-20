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

  coveragePathIgnorePatterns: ['./src/generate-action-types/cli.ts'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    './src/Messenger.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/generate-action-types/': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
});
