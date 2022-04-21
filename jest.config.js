module.exports = {
  collectCoverage: true,
  // Ensures that we collect coverage from all source files, not just tested
  // ones.
  collectCoverageFrom: ['./src/**/*.ts'],
  // TODO: Test index.ts
  coveragePathIgnorePatterns: ['./src/index.ts'],
  coverageReporters: ['json-summary', 'text', 'html'],
  coverageThreshold: {
    global: {
      branches: 90.4,
      functions: 96.42,
      lines: 95.77,
      statements: 95.82,
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
  testEnvironment: 'jsdom',
  testRegex: ['\\.test\\.(ts|js)$'],
  testTimeout: 5000,
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
