import { errorCodes } from '@metamask/rpc-errors';

import { isExecutionRevertedError } from './error';

const executionRevertedError = {
  code: errorCodes.rpc.invalidInput,
  message: 'execution reverted',
};

describe('isExecutionRevertedError', () => {
  it('return false if object is not valid JSON RPC error', async () => {
    const result = isExecutionRevertedError({ test: 'dummy' });
    expect(result).toBe(false);
  });

  it('return false if error code is not same as errorCodes.rpc.invalidInput', async () => {
    const result = isExecutionRevertedError({
      ...executionRevertedError,
      code: 123,
    });
    expect(result).toBe(false);
  });

  it('return false if error message is not "execution reverted"', async () => {
    const result = isExecutionRevertedError({
      ...executionRevertedError,
      message: 'test',
    });
    expect(result).toBe(false);
  });

  it('return true for correct executionRevertedError', async () => {
    const result = isExecutionRevertedError(executionRevertedError);
    expect(result).toBe(true);
  });
});
