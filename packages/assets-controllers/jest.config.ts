/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

import * as path from 'path';
import merge from 'ts-deepmerge';
import baseConfig from '../../jest.config.packages';

const displayName = path.basename(__dirname);

const config = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // We rely on `window` to make requests
  testEnvironment: 'jsdom',
});

export default config;
