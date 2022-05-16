/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

import merge from 'ts-deepmerge';
import baseConfig from '../../jest.config.packages';

const config = merge(baseConfig, {
  // The display name when running multiple projects
  displayName: 'controller-utils',
});

export default config;
