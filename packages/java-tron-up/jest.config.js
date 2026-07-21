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

  // The CLI entrypoint is exercised through package builds and installed-bin smoke tests.
  coveragePathIgnorePatterns: [
    ...baseConfig.coveragePathIgnorePatterns,
    './src/bin/java-tron-up.ts',
  ],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 60,
      lines: 65,
      statements: 65,
    },
  },
});
