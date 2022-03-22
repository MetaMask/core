module.exports = {
  collectCoverage: true,
  // Ensures that we collect coverage from all source files, not just tested
  // ones.
  collectCoverageFrom: ['./src/**/*.ts'],
  // TODO: Test index.ts
  coveragePathIgnorePatterns: ['./src/index.ts'],
  coverageReporters: ['text', 'html'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 96,
      lines: 95,
      statements: 95,
    },
  },
  moduleFileExtensions: ['js', 'json', 'ts', 'node'],
  preset: 'ts-jest',
  // TODO: Enable resetMocks
  // "resetMocks" resets all mocks, including mocked modules, to jest.fn(),
  // between each test case.
  // resetMocks: true,
  // "restoreMocks" restores all mocks created using jest.spyOn to their
  // original implementations, between each test. It does not affect mocked
  // modules.
  restoreMocks: true,
  setupFiles: ['./tests/setupTests.ts'],
  setupFilesAfterEnv: ['./tests/setupTestsAfterEnv.ts'],
  testEnvironment: 'setup-polly-jest/jest-environment-node',
  testTimeout: 5000,
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
