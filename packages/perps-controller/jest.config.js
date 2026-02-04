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
  // Note: Coverage thresholds lowered during migration from Mobile
  // TODO: Increase thresholds as more tests are migrated
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },

  // Module name mapper for mocking ESM packages
  // The @nktkas/hyperliquid package uses ES modules which Jest cannot handle
  moduleNameMapper: {
    '^@nktkas/hyperliquid$': '<rootDir>/src/__mocks__/hyperliquidMock.ts',
    '^@nktkas/hyperliquid(/.*)?$': '<rootDir>/src/__mocks__/hyperliquidMock.ts',
  },
});
