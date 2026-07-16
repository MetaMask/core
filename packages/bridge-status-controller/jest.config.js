/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(import.meta.dirname);

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  coverageProvider: 'v8',

  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    '.*/strategy/types\\.ts$',
    '.*/quote-status-manager/types\\.ts$',
    '.*/index\\.ts',
    '.*-method-action-types\\.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    './src/bridge-status-controller.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/bridge-status-controller.intent.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    global: {
      branches: 96.5,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});
