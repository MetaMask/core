/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

import merge from 'deepmerge';
import path from 'path';

import baseConfig from '../../jest.config.packages.js';

const displayName = path.basename(import.meta.dirname);

export default merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 78.12,
      functions: 77.58,
      lines: 87.3,
      statements: 86.5,
    },
  },

  // We rely on `window` to make requests
  testEnvironment: '<rootDir>/jest.environment.js',
});
