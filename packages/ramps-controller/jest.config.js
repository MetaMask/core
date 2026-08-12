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

  // An object that configures minimum threshold enforcement for coverage results.
  // Floored to the inherited #9848/#9851 autoramp-syncing coverage gap on this
  // stack (controller-integration.ts). Raise again when that area is filled in.
  coverageThreshold: {
    global: {
      branches: 92,
      functions: 96.7,
      lines: 96.4,
      statements: 96.4,
    },
  },
});
