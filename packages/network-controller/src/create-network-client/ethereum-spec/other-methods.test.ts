import {
  withMockedCommunications,
  withNetworkClient,
} from '../../../tests/network-client/helpers';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods included in the Ethereum JSON-RPC spec - other methods', () => {
  for (const networkClientType of [
    NetworkClientType.Infura,
    NetworkClientType.Custom,
  ]) {
    describe('eth_getTransactionByHash', () => {
      it("refreshes the block tracker's current block if it is less than the block number that comes back in the response", async () => {
        const method = 'eth_getTransactionByHash';

        await withMockedCommunications(
          { providerType: networkClientType },
          async (comms) => {
            const request = { method };

            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // This is our request.
            comms.mockRpcCall({
              request,
              response: {
                result: {
                  blockNumber: '0x200',
                },
              },
            });
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x300' });

            await withNetworkClient(
              { providerType: networkClientType },
              async ({ makeRpcCall, blockTracker }) => {
                await makeRpcCall(request);
                expect(blockTracker.getCurrentBlock()).toBe('0x300');
              },
            );
          },
        );
      });
    });

    describe('eth_getTransactionReceipt', () => {
      it("refreshes the block tracker's current block if it is less than the block number that comes back in the response", async () => {
        const method = 'eth_getTransactionReceipt';

        await withMockedCommunications(
          { providerType: networkClientType },
          async (comms) => {
            const request = { method };

            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // This is our request.
            comms.mockRpcCall({
              request,
              response: {
                result: {
                  blockNumber: '0x200',
                },
              },
            });
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x300' });

            await withNetworkClient(
              { providerType: networkClientType },
              async ({ makeRpcCall, blockTracker }) => {
                await makeRpcCall(request);
                expect(blockTracker.getCurrentBlock()).toBe('0x300');
              },
            );
          },
        );
      });
    });

    if (networkClientType === NetworkClientType.Custom) {
      describe('eth_chainId', () => {
        it('does not hit the RPC endpoint, instead returning the configured chain id', async () => {
          const chainId = await withNetworkClient(
            { providerType: networkClientType, customChainId: '0x1' },
            ({ makeRpcCall }) => {
              return makeRpcCall({ method: 'eth_chainId' });
            },
          );

          expect(chainId).toBe('0x1');
        });
      });
    }
  }
});
