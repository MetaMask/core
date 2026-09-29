import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./lib/lint-tsc-ratchet.ts', () => ({
  lintTscRatchet: jest.fn(),
}));

const { lintTscRatchet } = await import('./lib/lint-tsc-ratchet.ts');

describe('lint-tsc-ratchet', () => {
  it('runs the check with the arguments it was given', async () => {
    jest.mocked(lintTscRatchet).mockResolvedValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-tsc-ratchet.ts');

    expect(lintTscRatchet).toHaveBeenCalledTimes(1);
    expect(lintTscRatchet).toHaveBeenCalledWith(process.argv.slice(2));
  });
});
