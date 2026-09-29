import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./lib/lint-tsc.ts', () => ({
  lintTsc: jest.fn(),
}));

const { lintTsc } = await import('./lib/lint-tsc.ts');

describe('lint-tsc', () => {
  it('runs the linter with the arguments it was given', async () => {
    jest.mocked(lintTsc).mockResolvedValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-tsc.ts');

    expect(lintTsc).toHaveBeenCalledTimes(1);
    expect(lintTsc).toHaveBeenCalledWith(process.argv.slice(2));
  });
});
