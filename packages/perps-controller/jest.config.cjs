/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

const merge = require('deepmerge');
const path = require('path');

const baseConfig = require('../../jest.config.packages.cjs');

const displayName = path.basename(__dirname);

module.exports = {
  ...merge(baseConfig, {
    // The display name when running multiple projects
    displayName,

    // An object that configures minimum threshold enforcement for coverage results
    coverageThreshold: {
      global: {
        branches: 72.76,
        functions: 79.05,
        lines: 83.46,
        statements: 83.46,
      },
    },
  }),

  // Node 22 cannot require the SDK's ESM entrypoint through Jest. Compile the
  // real SDK and its ESM dependencies with the existing TypeScript transformer.
  transform: {
    ...baseConfig.transform,
    '^.+\\.js$': [
      'ts-jest',
      {
        // ts-jest follows Jest's supportsStaticESM flag: CommonJS on Node 22,
        // native ESM when Node 24 loads the SDK through require(esm).
        useESM: true,
        tsconfig: {
          allowJs: true,
          checkJs: false,
          module: 'ESNext',
          moduleResolution: 'Node',
          verbatimModuleSyntax: false,
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!@nktkas/(?:hyperliquid|rews)/|@noble/hashes/)',
  ],

  // Coverage is collected from real source files. Barrel files are excluded
  // because they only re-export the tested modules.
  // Applied after merge to fully replace (not concat) the base array.
  collectCoverageFrom: ['./src/**/*.ts', '!./src/**/index.ts'],
};
