/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const path = require('path');
const merge = require('deepmerge');
const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);
const arrayMerge = (_destinationArray, sourceArray, _options) => sourceArray;

module.exports = merge(
  baseConfig,
  {
    // The display name when running multiple projects
    displayName,

    // An object that configures minimum threshold enforcement for coverage results
    coverageThreshold: {
      global: {
        branches: 81.51,
        functions: 98.86,
        lines: 95.79,
        statements: 95.97,
      },
    },

    // We rely on `XMLHttpRequest` to make requests
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {},
  },
  { arrayMerge },
);
