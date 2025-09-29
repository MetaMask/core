import { TimeoutError, withRetry, withTimeout } from './utils';

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
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(null);
          }, 600);
        }),
      ),
    ).rejects.toThrow(TimeoutError);
  });
});
