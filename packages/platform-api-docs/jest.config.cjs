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

  // Unlike most packages, these tests run as ESM. `execa` is ESM-only, and the
  // CommonJS transform would turn its import into a `require()` that Node
  // cannot resolve before v24.9.
  extensionsToTreatAsEsm: ['.ts'],

  // cli.ts is tested via execa subprocess in cli.test.ts; Jest can't instrument it
  coveragePathIgnorePatterns: ['./src/cli.ts'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 97.92,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
});

// `deepmerge` concatenates arrays, so the CommonJS transform inherited from the
// base config has to be replaced outright rather than merged into.
config.transform = {
  '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
};

module.exports = config;
