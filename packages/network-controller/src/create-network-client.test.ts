import {
  waitForPromiseToBeFulfilledAfterRunningAllTimers,
  withMockedCommunications,
  withNetworkClient,
} from '../tests/network-client/helpers.js';
import { NetworkClientType } from './types.js';

describe('createNetworkClient timing options', () => {
  const originalInTest = process.env.IN_TEST;

  beforeEach(() => {
    process.env.IN_TEST = 'true';
  });

  afterEach(() => {
    if (originalInTest === undefined) {
      delete process.env.IN_TEST;
    } else {
      process.env.IN_TEST = originalInTest;
    }
  });

  for (const providerType of Object.values(NetworkClientType)) {
    it(`passes the endpoint and ${providerType} configuration to the options factory`, async () => {
      const getBlockTrackerOptions = jest.fn(() => ({ pollingInterval: 1000 }));

      await withNetworkClient(
        { providerType, getBlockTrackerOptions },
        async ({ rpcUrl, chainId }) => {
          expect(getBlockTrackerOptions).toHaveBeenCalledWith(
            rpcUrl,
            expect.objectContaining({ type: providerType, chainId }),
          );
        },
      );
    });

    for (const pollingInterval of [undefined, 1000]) {
      it(`uses ${pollingInterval ?? 20_000}ms polling for ${providerType} independently of IN_TEST`, async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          comms.mockNextBlockTrackerRequest();

          await withNetworkClient(
            {
              providerType,
              getBlockTrackerOptions: () =>
                pollingInterval === undefined ? {} : { pollingInterval },
            },
            async ({ blockTracker }) => {
              const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
              await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                blockTracker.getLatestBlock(),
              );

              expect(setTimeoutSpy).toHaveBeenCalledWith(
                expect.any(Function),
                pollingInterval ?? 20_000,
              );
            },
          );
        });
      });
    }
  }

  it('does not introduce a delay before custom-network gas estimation', async () => {
    const providerType = NetworkClientType.Custom;
    await withMockedCommunications({ providerType }, async (comms) => {
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request: { method: 'eth_estimateGas', params: [{}] },
        response: { result: '0x5208' },
      });

      await withNetworkClient({ providerType }, async ({ makeRpcCall }) => {
        const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
        const result: unknown =
          await waitForPromiseToBeFulfilledAfterRunningAllTimers(
            makeRpcCall({ method: 'eth_estimateGas', params: [{}] }),
          );

        expect(result).toBe('0x5208');
        expect(setTimeoutSpy).not.toHaveBeenCalledWith(
          expect.any(Function),
          2000,
        );
      });
    });
  });
});
