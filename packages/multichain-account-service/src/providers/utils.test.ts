import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
} from '@metamask/keyring-controller';

import {
  TimeoutError,
  isKeyringControllerLockedError,
  isTimeoutError,
  withRetry,
  withTimeout,
} from './utils';

describe('utils', () => {
  it('retries RPC request up to 3 times if it fails and throws the last error', async () => {
    const mockNetworkCall = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 1');
      })
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 2');
      })
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 3');
      })
      .mockImplementationOnce(() => {
        throw new Error('RPC request failed 4');
      });

    await expect(withRetry(mockNetworkCall)).rejects.toThrow(
      'RPC request failed 3',
    );
  });

  it('throws if the RPC request times out', async () => {
    await expect(
      withTimeout(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(null);
            }, 600);
          }),
      ),
    ).rejects.toThrow(TimeoutError);
  });

  it('includes the timeout duration in the error message', async () => {
    await expect(
      withTimeout(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(null);
            }, 600);
          }),
        500,
      ),
    ).rejects.toThrow('Timed out after: 500ms');
  });

  it('isTimeoutError returns true for TimeoutError instances', () => {
    expect(isTimeoutError(new TimeoutError('Timed out after: 500ms'))).toBe(
      true,
    );
  });

  it('isTimeoutError returns false for non-TimeoutError instances', () => {
    expect(isTimeoutError(new Error('some error'))).toBe(false);
    expect(isTimeoutError('string')).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });

  it('isKeyringControllerLockedError returns true for KeyringControllerLockedError instances', () => {
    expect(
      isKeyringControllerLockedError(
        new KeyringControllerError(
          KeyringControllerErrorMessage.ControllerLocked,
        ),
      ),
    ).toBe(true);
  });

  it.each([new Error('some error'), 'string', null])(
    'isKeyringControllerLockedError returns false for %p',
    (error) => {
      expect(isKeyringControllerLockedError(error)).toBe(false);
    },
  );
});
