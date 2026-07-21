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

  // Use jsdom for BackendWebSocketService tests
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {},

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 99.81,
      functions: 99.26,
      lines: 99.78,
      statements: 99.78,
    },
  },
});
