import { buildRootMessenger } from '../../tests/helpers.js';
import {
  withMockedCommunications,
  withNetworkClient,
} from '../../tests/network-client/helpers.js';

describe('createNetworkClient - RPC endpoint failover (forced)', () => {
  describe('when rpcFailoverMode is forced and providerType is infura', () => {
    it('routes requests to the failover endpoint instead of Infura when failover URLs are provided', async () => {
      const failoverUrl = 'https://failover.example.com';

      // Only mock the failover URL — if Infura is hit, nock will throw because
      // there is no matching mock for it.
      // eth_gasPrice is not served by local middleware so it actually reaches
      // the RPC endpoint, letting us confirm which host received the request.
      await withMockedCommunications(
        {
          providerType: 'custom',
          customRpcUrl: failoverUrl,
        },
        async (failoverComms) => {
          failoverComms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
          failoverComms.mockRpcCall({
            request: { method: 'eth_gasPrice', params: [] },
            response: { result: '0xabc' },
          });

          const messenger = buildRootMessenger();

          const result = await withNetworkClient(
            {
              providerType: 'infura',
              failoverRpcUrls: [failoverUrl],
              rpcFailoverMode: 'forced',
              messenger,
              getRpcServiceOptions: () => ({
                fetch,
                btoa,
                isOffline: (): boolean => false,
              }),
            },
            async ({ makeRpcCall }) => {
              return await makeRpcCall({ method: 'eth_gasPrice', params: [] });
            },
          );

          expect(result).toBe('0xabc');
        },
      );
    });

    it('falls back to Infura when no failover URLs are provided', async () => {
      // Only mock Infura — if any failover were hit, nock would throw.
      await withMockedCommunications(
        {
          providerType: 'infura',
        },
        async (infuraComms) => {
          infuraComms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
          infuraComms.mockRpcCall({
            request: { method: 'eth_gasPrice', params: [] },
            response: { result: '0xdef' },
          });

          const messenger = buildRootMessenger();

          const result = await withNetworkClient(
            {
              providerType: 'infura',
              failoverRpcUrls: [],
              rpcFailoverMode: 'forced',
              messenger,
              getRpcServiceOptions: () => ({
                fetch,
                btoa,
                isOffline: (): boolean => false,
              }),
            },
            async ({ makeRpcCall }) => {
              return await makeRpcCall({ method: 'eth_gasPrice', params: [] });
            },
          );

          expect(result).toBe('0xdef');
        },
      );
    });
  });

  describe('when rpcFailoverMode is forced and providerType is custom', () => {
    it('still routes requests to the custom primary endpoint, not the failover', async () => {
      const customRpcUrl = 'https://custom.example.com';
      const failoverUrl = 'https://failover.example.com';

      // Only mock the custom URL — if failover is hit, nock will throw.
      // eth_gasPrice is not served by local middleware so it actually reaches
      // the RPC endpoint, letting us confirm which host received the request.
      await withMockedCommunications(
        {
          providerType: 'custom',
          customRpcUrl,
        },
        async (customComms) => {
          customComms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
          customComms.mockRpcCall({
            request: { method: 'eth_gasPrice', params: [] },
            response: { result: '0xabc' },
          });

          const messenger = buildRootMessenger();

          const result = await withNetworkClient(
            {
              providerType: 'custom',
              customRpcUrl,
              failoverRpcUrls: [failoverUrl],
              rpcFailoverMode: 'forced',
              messenger,
              getRpcServiceOptions: () => ({
                fetch,
                btoa,
                isOffline: (): boolean => false,
              }),
            },
            async ({ makeRpcCall }) => {
              return await makeRpcCall({ method: 'eth_gasPrice', params: [] });
            },
          );

          expect(result).toBe('0xabc');
        },
      );
    });
  });
});
