import { jest } from '@jest/globals';

jest.unstable_mockModule('./lib/lint-suppressions.ts', () => ({
  lintSuppressions: jest.fn(),
}));

const { lintSuppressions } = await import('./lib/lint-suppressions.ts');

describe('lint-suppressions', () => {
  it('runs the check with the arguments it was given', async () => {
    jest.mocked(lintSuppressions).mockResolvedValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-suppressions.ts');

    expect(lintSuppressions).toHaveBeenCalledTimes(1);
    expect(lintSuppressions).toHaveBeenCalledWith(process.argv.slice(2));
  });
});
