/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages.cjs');

const displayName = path.basename(__dirname);

const config = merge(baseConfig, {
  // The display name when running multiple projects
  displayName,

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 95.87,
      functions: 100,
      lines: 99.17,
      statements: 99.18,
    },
  },
});

// This package depends on a preview build of `@metamask/keyring-sdk` via an
// npm alias, which Yarn resolves to a nested copy. The shared module name
// mapper would resolve the hoisted published version instead, so resolve
// the nested copy explicitly — and first, as Jest applies the patterns in
// the order they are defined, and the generic `^@metamask/(.+)$` pattern in
// the shared configuration would otherwise match first.
config.moduleNameMapper = {
  '^@metamask/keyring-sdk$': require.resolve('@metamask/keyring-sdk'),
  ...config.moduleNameMapper,
};

module.exports = config;
