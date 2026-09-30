/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages.cjs');

const displayName = `${path.basename(__dirname)}-integration`;

module.exports = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // Separate from the combined (`coverage/`) and unit (`coverage/unit/`)
  // reports
  coverageDirectory: 'coverage/integration',

  // Only the integration suites; unit tests belong to `jest.config.unit.cjs`
  testMatch: ['**/*.integration.test.[tj]s?(x)'],

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    '/__fixtures__/',
    '\\.test\\.[tj]sx?$',
  ],

  // Coverage here is informational; the unit suite owns the quality gate
});
