import { errorCodes } from '@metamask/rpc-errors';

import { isExecutionRevertedError } from './error';

const gethStyleRevert = {
  code: errorCodes.rpc.invalidInput,
  message: 'execution reverted',
};

const infuraStyleRevert = {
  code: 3,
  message: 'execution reverted: ERC20: transfer amount exceeds balance',
  data: '0x08c379a0',
};

describe('isExecutionRevertedError', () => {
  it('returns false if the value is not a valid JSON-RPC error', () => {
    expect(isExecutionRevertedError({ test: 'dummy' })).toBe(false);
  });

  it('returns false if the error code is unrelated to reverts', () => {
    expect(isExecutionRevertedError({ ...gethStyleRevert, code: 123 })).toBe(
      false,
    );
  });

  it('returns false if the error message does not start with "execution reverted"', () => {
    expect(
      isExecutionRevertedError({ ...gethStyleRevert, message: 'test' }),
    ).toBe(false);
  });

  it('returns true for geth-style reverts (code -32000, exact message)', () => {
    expect(isExecutionRevertedError(gethStyleRevert)).toBe(true);
  });

  it('returns true for EIP-1474 / Infura-style reverts (code 3, suffixed message)', () => {
    expect(isExecutionRevertedError(infuraStyleRevert)).toBe(true);
  });

  it('returns true for code 3 with the bare "execution reverted" message', () => {
    expect(
      isExecutionRevertedError({ code: 3, message: 'execution reverted' }),
    ).toBe(true);
  });

  it('returns true for geth-style reverts with a suffixed message', () => {
    expect(
      isExecutionRevertedError({
        code: errorCodes.rpc.invalidInput,
        message: 'execution reverted: custom reason',
      }),
    ).toBe(true);
  });

  it('returns false when the message is not a string', () => {
    expect(isExecutionRevertedError({ ...gethStyleRevert, message: 123 })).toBe(
      false,
    );
  });
});
