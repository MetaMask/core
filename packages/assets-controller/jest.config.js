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
  // TODO: Increase thresholds as more tests are added
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 5,
      lines: 5,
      statements: 5,
    },
  },
});
