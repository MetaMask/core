// const { pathsToModuleNameMapper } = require('ts-jest')
// const { compilerOptions } = require('./tsconfig.scripts.json')

// console.log('compilerOptions.paths', compilerOptions.paths);
// console.log('pathsToModuleNameMapper(compilerOptions.paths)', pathsToModuleNameMapper(compilerOptions.paths));

/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: ['<rootDir>/scripts/**/*.ts'],

  // The directory where Jest should output its coverage files
  coverageDirectory: '<rootDir>/scripts/coverage',

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: ['/package-template/'],

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'babel',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ['text', 'html', 'json-summary'],

  // An object that configures minimum threshold enforcement for coverage results
  // <rootDir> does not work here.
  coverageThreshold: {
    './scripts/create-package/**/*.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  // Here we ensure that Jest resolves `@metamask/*` imports to the uncompiled source code for packages that live in this repo.
  // NOTE: This must be synchronized with the `paths` option in `tsconfig.scripts.json`.
  // moduleNameMapper: {
  //   '^@metamask/utils/(.+)$': ['<rootDir>/node_modules/@metamask/utils/dist/types/$1'],
  // },
  // moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),

  // moduleDirectories: ['node_modules'],
  // modulePaths: ['<rootDir>/node_modules/@metamask/utils/dist/types'],
  // modulePaths: ['<rootDir>'],

  // Disabled due to use of 'transform' below.
  // // A preset that is used as a base for Jest's configuration
  // preset: 'ts-jest',

  // "restoreMocks" restores all mocks created using jest.spyOn to their
  // original implementations, between each test. It does not affect mocked
  // modules.
  restoreMocks: true,

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // Options that will be passed to the testEnvironment
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },

  // The glob patterns Jest uses to detect test files
  testMatch: [
    '<rootDir>/scripts/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/scripts/**/?(*.)+(spec|test).[tj]s?(x)',
  ],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/package-template/'],

  // Default timeout of a test in milliseconds.
  testTimeout: 5000,

  // A map from regular expressions to paths to transformers
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.scripts.json',
        // tsconfig: '<rootDir>/scripts/create-package/tsconfig.json',
        // tsconfig: require('./tsconfig.scripts.json').compilerOptions,
      },
    ],
  },
};
