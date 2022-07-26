/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
module.exports = {
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: ['./src/**/*.ts'],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ['html', 'json-summary', 'text'],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 69.23,
      functions: 88.88,
      lines: 93.75,
      statements: 93.75,
    },
  },

  // A preset that is used as a base for Jest's configuration
  preset: 'ts-jest',

  // "resetMocks" resets all mocks, including mocked modules, to jest.fn(),
  // between each test case.
  resetMocks: true,

  // "restoreMocks" restores all mocks created using jest.spyOn to their
  // original implementations, between each test. It does not affect mocked
  // modules.
  restoreMocks: true,

  // Reduce the default test timeout from 5s to 2.5s
  testTimeout: 2500,
};
