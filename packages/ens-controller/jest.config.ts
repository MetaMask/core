/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

// import * as path from 'path';
import merge from 'ts-deepmerge';
import baseConfig from '../../jest.config.packages';

const config = merge(baseConfig, {
  // The display name when running multiple projects
  displayName: 'ens-controller',
  /*
  globals: {
    'ts-jest': {
      tsconfig: path.join(__dirname, '../../tsconfig.json'),
    },
  },
  */
});

export default config;
