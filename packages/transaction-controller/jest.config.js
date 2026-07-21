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
      branches: 91.76,
      functions: 92.46,
      lines: 96.83,
      statements: 96.82,
    },
  },

  // We rely on `XMLHttpRequest` to make requests
  testEnvironment: 'jsdom',
});
