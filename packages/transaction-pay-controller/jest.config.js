/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages');

const displayName = path.basename(__dirname);

const merged = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});

// Prepend a specific mapping for @metamask/eth-hd-keyring/v2 before the
// generic @metamask/(.+) catch-all so that Jest picks it up first.
// deepmerge appends keys, but Jest evaluates moduleNameMapper in insertion
// order, so the generic pattern would win otherwise.
module.exports = {
  ...merged,
  moduleNameMapper: {
    '^@metamask/eth-hd-keyring/v2$': path.resolve(
      __dirname,
      '../../node_modules/@metamask/eth-hd-keyring/dist/hd-keyring-v2.cjs',
    ),
    '^@metamask/eth-simple-keyring/v2$': path.resolve(
      __dirname,
      '../../node_modules/@metamask/eth-simple-keyring/dist/simple-keyring-v2.cjs',
    ),
    ...merged.moduleNameMapper,
  },
};
