import { BUILT_IN_NETWORKS, NetworkType } from '@metamask/controller-utils';
import type { JsonRpcSuccess, Json } from '@metamask/utils';

import { mockNetwork } from '../../../tests/mock-network';
import { createAutoManagedNetworkClient } from './create-auto-managed-network-client';
import * as createNetworkClientModule from './create-network-client';
import type {
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
} from './types';
import { NetworkClientType } from './types';

describe('createAutoManagedNetworkClient', () => {
  const networkClientConfigurations: [
    CustomNetworkClientConfiguration,
    InfuraNetworkClientConfiguration,
  ] = [
    {
      type: NetworkClientType.Custom,
      rpcUrl: 'https://test.chain',
      chainId: '0x1337',
      ticker: 'ETH',
    } as const,
    {
      type: NetworkClientType.Infura,
      network: NetworkType.mainnet,
      chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
      infuraProjectId: 'some-infura-project-id',
      ticker: BUILT_IN_NETWORKS[NetworkType.mainnet].ticker,
    } as const,
  ];
  for (const networkClientConfiguration of networkClientConfigurations) {
    describe(`given configuration for a ${networkClientConfiguration.type} network client`, () => {
      it('allows the network client configuration to be accessed', () => {
        const { configuration } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        expect(configuration).toStrictEqual(networkClientConfiguration);
      });

      it('does not make any network requests initially', () => {
        // If unexpected requests occurred, then Nock would throw
        expect(() => {
          createAutoManagedNetworkClient(networkClientConfiguration);
        }).not.toThrow();
      });

      it('returns a provider proxy that has the same interface as a provider', () => {
        const { provider } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        // This also tests the `has` trap in the proxy
        expect('addListener' in provider).toBe(true);
        expect('on' in provider).toBe(true);
        expect('once' in provider).toBe(true);
        expect('removeListener' in provider).toBe(true);
        expect('off' in provider).toBe(true);
        expect('removeAllListeners' in provider).toBe(true);
        expect('setMaxListeners' in provider).toBe(true);
        expect('getMaxListeners' in provider).toBe(true);
        expect('listeners' in provider).toBe(true);
        expect('rawListeners' in provider).toBe(true);
        expect('emit' in provider).toBe(true);
        expect('listenerCount' in provider).toBe(true);
        expect('prependListener' in provider).toBe(true);
        expect('prependOnceListener' in provider).toBe(true);
        expect('eventNames' in provider).toBe(true);
        expect('send' in provider).toBe(true);
        expect('sendAsync' in provider).toBe(true);
        expect('request' in provider).toBe(true);
      });

      it('returns a provider proxy that acts like a provider, forwarding requests to the network', async () => {
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'test_method',
                params: [],
              },
              response: {
                result: 'test response',
              },
            },
          ],
        });

        const { provider } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        const response = await provider.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        expect((response as JsonRpcSuccess<Json>).result).toBe('test response');
      });

      it('creates the network client only once, even when the provider proxy is used to make requests multiple times', async () => {
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'test_method',
                params: [],
              },
              response: {
                result: 'test response',
              },
              discardAfterMatching: false,
            },
          ],
        });
        const createNetworkClientMock = jest.spyOn(
          createNetworkClientModule,
          'createNetworkClient',
        );

        const { provider } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        await provider.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        await provider.request({
          id: 2,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
        expect(createNetworkClientMock).toHaveBeenCalledWith(
          networkClientConfiguration,
        );
      });

      it('returns a block tracker proxy that has the same interface as a block tracker', () => {
        const { blockTracker } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        // This also tests the `has` trap in the proxy
        expect('addListener' in blockTracker).toBe(true);
        expect('on' in blockTracker).toBe(true);
        expect('once' in blockTracker).toBe(true);
        expect('removeListener' in blockTracker).toBe(true);
        expect('off' in blockTracker).toBe(true);
        expect('removeAllListeners' in blockTracker).toBe(true);
        expect('setMaxListeners' in blockTracker).toBe(true);
        expect('getMaxListeners' in blockTracker).toBe(true);
        expect('listeners' in blockTracker).toBe(true);
        expect('rawListeners' in blockTracker).toBe(true);
        expect('emit' in blockTracker).toBe(true);
        expect('listenerCount' in blockTracker).toBe(true);
        expect('prependListener' in blockTracker).toBe(true);
        expect('prependOnceListener' in blockTracker).toBe(true);
        expect('eventNames' in blockTracker).toBe(true);
        expect('destroy' in blockTracker).toBe(true);
        expect('isRunning' in blockTracker).toBe(true);
        expect('getCurrentBlock' in blockTracker).toBe(true);
        expect('getLatestBlock' in blockTracker).toBe(true);
        expect('checkForLatestBlock' in blockTracker).toBe(true);
      });

      it('returns a block tracker proxy that acts like a block tracker, exposing events to be listened to', async () => {
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
          ],
        });

        const { blockTracker } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        const blockNumberViaLatest = await new Promise((resolve) => {
          blockTracker.once('latest', resolve);
        });
        expect(blockNumberViaLatest).toBe('0x1');
        const blockNumberViaSync = await new Promise((resolve) => {
          blockTracker.once('sync', resolve);
        });
        expect(blockNumberViaSync).toStrictEqual({
          oldBlock: '0x1',
          newBlock: '0x2',
        });
      });

      it('creates the network client only once, even when the block tracker proxy is used multiple times', async () => {
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x2',
              },
            },
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x3',
              },
            },
          ],
        });
        const createNetworkClientMock = jest.spyOn(
          createNetworkClientModule,
          'createNetworkClient',
        );

        const { blockTracker } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );

        await new Promise((resolve) => {
          blockTracker.once('latest', resolve);
        });
        await new Promise((resolve) => {
          blockTracker.once('sync', resolve);
        });
        await blockTracker.getLatestBlock();
        await blockTracker.checkForLatestBlock();
        expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
        expect(createNetworkClientMock).toHaveBeenCalledWith(
          networkClientConfiguration,
        );
      });

      it('allows the block tracker to be destroyed', () => {
        mockNetwork({
          networkClientConfiguration,
          mocks: [
            {
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                result: '0x1',
              },
            },
          ],
        });
        const { blockTracker, destroy } = createAutoManagedNetworkClient(
          networkClientConfiguration,
        );
        // Start the block tracker
        blockTracker.on('latest', () => {
          // do nothing
        });

        destroy();

        expect(blockTracker.isRunning()).toBe(false);
      });
    });
  }
});
