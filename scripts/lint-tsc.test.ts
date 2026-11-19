import { describe, expect, it, vi } from 'vitest';

import { lintTsc } from './lib/lint-tsc.ts';

vi.mock(import('./lib/lint-tsc.ts'), () => ({
  lintTsc: vi.fn(),
}));

describe('lint-tsc', () => {
  it('runs the linter with the arguments it was given', async () => {
    vi.mocked(lintTsc).mockResolvedValue(undefined);

    // Importing the entry point runs it, which is the behaviour under test.
    await import('./lint-tsc.ts');

    expect(lintTsc).toHaveBeenCalledTimes(1);
    expect(lintTsc).toHaveBeenCalledWith(process.argv.slice(2));
  });
});
