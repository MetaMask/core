import { jest } from '@jest/globals';

jest.unstable_mockModule('./lib/lint-suppressions-ratchet.ts', () => ({
  lintSuppressionsRatchet: jest.fn(),
}));

const { lintSuppressionsRatchet } =
  await import('./lib/lint-suppressions-ratchet.ts');

describe('lint-suppressions-ratchet', () => {
  it('runs the check with the arguments it was given', async () => {
    jest.mocked(lintSuppressionsRatchet).mockResolvedValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-suppressions-ratchet.ts');

    expect(lintSuppressionsRatchet).toHaveBeenCalledTimes(1);
    expect(lintSuppressionsRatchet).toHaveBeenCalledWith(process.argv.slice(2));
  });
});
