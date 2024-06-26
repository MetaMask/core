/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 *
 * NOTE:
 * This config uses `babel-jest` due to ESM- / TypeScript-related incompatibilities with our
 * current version (`^27`) of `jest` and `ts-jest`. We can switch to `ts-jest` once we have
 * migrated our Jest dependencies to version `>=29`.
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
  // This ensures that Babel can resolve ESM exports correctly.
  moduleNameMapper: {
    '^@metamask/utils/(.+)$': [
      '<rootDir>/node_modules/@metamask/utils/dist/$1.js',
    ],
  },

  // Disabled due to use of 'transform' below.
  // // A preset that is used as a base for Jest's configuration
  // preset: 'ts-jest',

  // "resetMocks" resets all mocks, including mocked modules, to jest.fn(),
  // between each test case.
  resetMocks: true,

  // "restoreMocks" restores all mocks created using jest.spyOn to their
  // original implementations, between each test. It does not affect mocked
  // modules.
  restoreMocks: true,

  setupFilesAfterEnv: ['./tests/scripts-setup.ts'],

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
    '\\.[jt]sx?$': 'babel-jest',
  },
};
