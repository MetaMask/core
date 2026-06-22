// `@inquirer/confirm` is ESM-only and `prompts.ts` reaches it via a dynamic
// `import()`. Use jest's ESM mock API and dynamic imports to mirror that.
// The import statement below is what tags this file as a module for the
// `import-x/unambiguous` lint rule, even though it imports only the type.
import type Confirm from '@inquirer/confirm';

jest.unstable_mockModule('@inquirer/confirm', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type ConfirmMock = jest.MockedFunction<typeof Confirm>;

describe('confirmPurge', () => {
  it('invokes @inquirer/confirm with the purge prompt and returns its result', async () => {
    const confirm = (await import('@inquirer/confirm'))
      .default as unknown as ConfirmMock;
    confirm.mockResolvedValue(true);
    const { confirmPurge } = await import('./prompts');

    const result = await confirmPurge();

    expect(result).toBe(true);
    expect(confirm).toHaveBeenCalledWith({
      message: 'This will stop the daemon and delete all state. Continue?',
      default: false,
    });
  });

  it('returns false when the user declines', async () => {
    const confirm = (await import('@inquirer/confirm'))
      .default as unknown as ConfirmMock;
    confirm.mockResolvedValue(false);
    const { confirmPurge } = await import('./prompts');

    expect(await confirmPurge()).toBe(false);
  });
});
