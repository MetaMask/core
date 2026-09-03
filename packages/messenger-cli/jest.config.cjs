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

  // Unlike the other packages, these tests run as ESM. `generate-content.ts`
  // reaches for the ESM-only `oxfmt` through a dynamic `import()`, which the
  // CommonJS transform would turn into a `require()` that cannot load it.
  extensionsToTreatAsEsm: ['.ts'],

  // cli.ts is tested via execa subprocess in cli.test.ts; Jest can't instrument it
  coveragePathIgnorePatterns: ['./src/cli.ts'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 90.65,
      functions: 100,
      lines: 97.39,
      statements: 97.4,
    },
  },
});

// `deepmerge` concatenates arrays, so the CommonJS transform inherited from the
// base config has to be replaced outright rather than merged into.
config.transform = {
  '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
};

module.exports = config;
