/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages.cjs');

const displayName = `${path.basename(__dirname)}-unit`;

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // Separate from the combined (`coverage/`) and integration
  // (`coverage/integration/`) reports
  coverageDirectory: 'coverage/unit',

  // Integration suites are excluded so unit coverage and thresholds stand on
  // their own; restates Jest's default, which this list replaces
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.[tj]sx?$',
  ],

  // Reflects the unit suite alone, unlike the combined thresholds in
  // `jest.config.cjs`
  coverageThreshold: {
    global: {
      branches: 80.82,
      functions: 63.57,
      lines: 78.92,
      statements: 78.93,
    },
  },
});
