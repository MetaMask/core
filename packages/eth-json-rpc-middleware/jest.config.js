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

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: ['!./src/**/*.test-d.ts'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 81.49,
      functions: 90.66,
      lines: 89.13,
      statements: 89.2,
    },
  },
});
