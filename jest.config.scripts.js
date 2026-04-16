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

  moduleNameMapper: {
    '^uuid$': require.resolve('uuid'),
  },

  preset: 'ts-jest',

  // The path to the Prettier executable used to format snapshots
  // Jest doesn't support Prettier 3 yet, so we use Prettier 2
  prettierPath: require.resolve('prettier-2'),

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
};
