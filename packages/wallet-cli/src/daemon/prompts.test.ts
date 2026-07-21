// `@inquirer/confirm` and `@inquirer/password` are ESM-only and `prompts.ts`
// reaches them via dynamic `import()`. Use jest's ESM mock API and dynamic
// imports to mirror that. The import statements below tag this file as a
// module for the `import-x/unambiguous` lint rule, even though they import
// only types.
import type Confirm from '@inquirer/confirm';
import type Password from '@inquirer/password';
import { jest } from '@jest/globals';

jest.unstable_mockModule('@inquirer/confirm', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.unstable_mockModule('@inquirer/password', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type ConfirmMock = jest.MockedFunction<typeof Confirm>;
type PasswordMock = jest.MockedFunction<typeof Password>;

describe('confirmPurge', () => {
  it('invokes @inquirer/confirm with the purge prompt and returns its result', async () => {
    const confirm = (await import('@inquirer/confirm'))
      .default as unknown as ConfirmMock;
    confirm.mockResolvedValue(true);
    const { confirmPurge } = await import('./prompts.js');

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
    const { confirmPurge } = await import('./prompts.js');

    expect(await confirmPurge()).toBe(false);
  });
});

describe('promptPassword', () => {
  it('invokes @inquirer/password with masked input and returns the user input', async () => {
    const password = (await import('@inquirer/password'))
      .default as unknown as PasswordMock;
    password.mockResolvedValue('hunter2');
    const { promptPassword } = await import('./prompts.js');

    const result = await promptPassword();

    expect(result).toBe('hunter2');
    expect(password).toHaveBeenCalledWith({
      message: 'Wallet password:',
      mask: true,
    });
  });
});
