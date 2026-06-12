module.exports = {
  collectCoverage: true,
  // Ensures that we collect coverage from all source files, not just tested
  // ones.
  collectCoverageFrom: ['./src/**.ts', '!./src/index.ts'],
  coverageReporters: ['text', 'html'],
  coverageThreshold: {
    global: {
      branches: 74.65,
      functions: 88.18,
      lines: 92.33,
      statements: 91.89,
    },
  },
  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],
  preset: 'ts-jest',
  // "resetMocks" resets all mocks, including mocked modules, to jest.fn(),
  // between each test case.
  resetMocks: true,
  // "restoreMocks" restores all mocks created using jest.spyOn to their
  // original implementations, between each test. It does not affect mocked
  // modules.
  restoreMocks: true,
  setupFiles: ['./setupJest.js'],
  testEnvironment: 'node',
  testRegex: ['\\.test\\.(ts|js)$'],
  testTimeout: 2500,
};
