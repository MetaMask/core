import { Messenger } from '@metamask/base-controller';
import { BUILT_IN_NETWORKS, NetworkType } from '@metamask/controller-utils';

import { createAutoManagedNetworkClient } from './create-auto-managed-network-client';
import * as createNetworkClientModule from './create-network-client';
import type {
  NetworkControllerActions,
  NetworkControllerEvents,
} from './NetworkController';
import type {
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
} from './types';
import { NetworkClientType } from './types';
import { mockNetwork } from '../../../tests/mock-network';

describe('createAutoManagedNetworkClient', () => {
  const networkClientConfigurations: [
    CustomNetworkClientConfiguration,
    InfuraNetworkClientConfiguration,
  ] = [
    {
      type: NetworkClientType.Custom,
      failoverRpcUrls: [],
      rpcUrl: 'https://test.chain',
      chainId: '0x1337',
      ticker: 'ETH',
    },
    {
      type: NetworkClientType.Infura,
      network: NetworkType.mainnet,
      chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
      infuraProjectId: 'some-infura-project-id',
      ticker: BUILT_IN_NETWORKS[NetworkType.mainnet].ticker,
      failoverRpcUrls: [],
    },
  ];
  for (const networkClientConfiguration of networkClientConfigurations) {
    describe(`given configuration for a ${networkClientConfiguration.type} network client`, () => {
      it('allows the network client configuration to be accessed', () => {
        const { configuration } = createAutoManagedNetworkClient({
          networkClientConfiguration,
          getRpcServiceOptions: () => ({
            fetch,
            btoa,
          }),
          messenger: getNetworkControllerMessenger(),
          isRpcFailoverEnabled: false,
        });

        expect(configuration).toStrictEqual(networkClientConfiguration);
      });

      it('does not make any network requests initially', () => {
        // If unexpected requests occurred, then Nock would throw
        expect(() => {
          createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
            }),
            messenger: getNetworkControllerMessenger(),
            isRpcFailoverEnabled: false,
          });
        }).not.toThrow();
      });

      it('returns a provider proxy that has the same interface as a provider', () => {
        const { provider } = createAutoManagedNetworkClient({
          networkClientConfiguration,
          getRpcServiceOptions: () => ({
            fetch,
            btoa,
          }),
          messenger: getNetworkControllerMessenger(),
          isRpcFailoverEnabled: false,
        });

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

      describe('when accessing the provider proxy', () => {
        it('forwards requests to the network', async () => {
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

          const { provider } = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
            }),
            messenger: getNetworkControllerMessenger(),
            isRpcFailoverEnabled: false,
          });

          const result = await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });
          expect(result).toBe('test response');
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
          const getRpcServiceOptions = () => ({
            btoa,
            fetch,
          });
          const getBlockTrackerOptions = () => ({
            pollingInterval: 5000,
          });
          const messenger = getNetworkControllerMessenger();

          const { provider } = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });

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
          expect(createNetworkClientMock).toHaveBeenCalledWith({
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
        });

        it('allows for enabling the RPC failover behavior, even after having already accessed the provider', async () => {
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
          const getRpcServiceOptions = () => ({
            btoa,
            fetch,
          });
          const getBlockTrackerOptions = () => ({
            pollingInterval: 5000,
          });
          const messenger = getNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: false,
          });
          const { provider } = autoManagedNetworkClient;

          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });
          autoManagedNetworkClient.enableRpcFailover();
          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: false,
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
        });

        it('allows for disabling the RPC failover behavior, even after having accessed the provider', async () => {
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
          const getRpcServiceOptions = () => ({
            btoa,
            fetch,
          });
          const getBlockTrackerOptions = () => ({
            pollingInterval: 5000,
          });
          const messenger = getNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
          const { provider } = autoManagedNetworkClient;

          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });
          autoManagedNetworkClient.disableRpcFailover();
          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: false,
          });
        });
      });

      it('returns a block tracker proxy that has the same interface as a block tracker', () => {
        const { blockTracker } = createAutoManagedNetworkClient({
          networkClientConfiguration,
          getRpcServiceOptions: () => ({
            fetch,
            btoa,
          }),
          messenger: getNetworkControllerMessenger(),
          isRpcFailoverEnabled: false,
        });

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

      describe('when accessing the block tracker proxy', () => {
        it('exposes events to be listened to', async () => {
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

          const { blockTracker } = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
            }),
            messenger: getNetworkControllerMessenger(),
            isRpcFailoverEnabled: false,
          });

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
          const getRpcServiceOptions = () => ({
            btoa,
            fetch,
          });
          const getBlockTrackerOptions = () => ({
            pollingInterval: 5000,
          });
          const messenger = getNetworkControllerMessenger();

          const { blockTracker } = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });

          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });
          await new Promise((resolve) => {
            blockTracker.once('sync', resolve);
          });
          await blockTracker.getLatestBlock();
          await blockTracker.checkForLatestBlock();
          expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
          expect(createNetworkClientMock).toHaveBeenCalledWith({
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
        });

        it('allows for enabling the RPC failover behavior, even after having already accessed the provider', async () => {
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
                discardAfterMatching: false,
              },
            ],
          });
          const createNetworkClientMock = jest.spyOn(
            createNetworkClientModule,
            'createNetworkClient',
          );
          const getRpcServiceOptions = () => ({
            btoa,
            fetch,
          });
          const getBlockTrackerOptions = () => ({
            pollingInterval: 5000,
          });
          const messenger = getNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: false,
          });
          const { blockTracker } = autoManagedNetworkClient;

          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });
          autoManagedNetworkClient.enableRpcFailover();
          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: false,
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
        });

        it('allows for disabling the RPC failover behavior, even after having already accessed the provider', async () => {
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
                discardAfterMatching: false,
              },
            ],
          });
          const createNetworkClientMock = jest.spyOn(
            createNetworkClientModule,
            'createNetworkClient',
          );
          const getRpcServiceOptions = () => ({
            btoa,
            fetch,
          });
          const getBlockTrackerOptions = () => ({
            pollingInterval: 5000,
          });
          const messenger = getNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
          const { blockTracker } = autoManagedNetworkClient;

          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });
          autoManagedNetworkClient.disableRpcFailover();
          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: true,
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            isRpcFailoverEnabled: false,
          });
        });
      });
    });

    it('destroys the block tracker when destroyed', () => {
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
      const { blockTracker, destroy } = createAutoManagedNetworkClient({
        networkClientConfiguration,
        getRpcServiceOptions: () => ({
          fetch,
          btoa,
        }),
        messenger: getNetworkControllerMessenger(),
        isRpcFailoverEnabled: false,
      });
      // Start the block tracker
      blockTracker.on('latest', () => {
        // do nothing
      });

      destroy();

      expect(blockTracker.isRunning()).toBe(false);
    });
  }
});

/**
 * Constructs a NetworkController messenger.
 *
 * @returns The NetworkController messenger.
 */
function getNetworkControllerMessenger() {
  return new Messenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >().getRestricted({
    name: 'NetworkController',
    allowedActions: [],
    allowedEvents: [],
  });
}
