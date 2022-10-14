/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const path = require('path');
const merge = require('deepmerge');
const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);
const overwriteArrays = (_destinationArray, sourceArray, _options) =>
  sourceArray;

module.exports = merge(
  baseConfig,
  {
    // The display name when running multiple projects
    displayName,

    // An object that configures minimum threshold enforcement for coverage results
    coverageThreshold: {
      global: {
        branches: 68.05,
        functions: 80.55,
        lines: 69.82,
        statements: 70.17,
      },
    },

    // We rely on `window` to make requests
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {},
  },
  { arrayMerge: overwriteArrays },
);
