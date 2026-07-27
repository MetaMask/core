import { BUILT_IN_NETWORKS, NetworkType } from '@metamask/controller-utils';
import { PollingBlockTrackerOptions } from '@metamask/eth-block-tracker';

import { mockNetwork } from '../../../tests/mock-network.js';
import { buildNetworkControllerMessenger } from '../tests/helpers.js';
import { createAutoManagedNetworkClient } from './create-auto-managed-network-client.js';
import * as createNetworkClientModule from './create-network-client.js';
import { RpcServiceOptions } from './rpc-service/rpc-service.js';
import type {
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
} from './types.js';
import { NetworkClientType } from './types.js';

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
          networkClientId: 'some-network-client-id',
          networkClientConfiguration,
          getRpcServiceOptions: () => ({
            fetch,
            btoa,
            isOffline: (): boolean => false,
          }),
          messenger: buildNetworkControllerMessenger(),
          rpcFailoverMode: 'disabled',
        });

        expect(configuration).toStrictEqual(networkClientConfiguration);
      });

      it('does not make any network requests initially', () => {
        // If unexpected requests occurred, then Nock would throw
        expect(() => {
          createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            messenger: buildNetworkControllerMessenger(),
            rpcFailoverMode: 'disabled',
          });
        }).not.toThrow();
      });

      it('returns a provider proxy that has the same interface as a provider', () => {
        const { provider } = createAutoManagedNetworkClient({
          networkClientId: 'some-network-client-id',
          networkClientConfiguration,
          getRpcServiceOptions: () => ({
            fetch,
            btoa,
            isOffline: (): boolean => false,
          }),
          messenger: buildNetworkControllerMessenger(),
          rpcFailoverMode: 'disabled',
        });

        // This also tests the `has` trap in the proxy
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
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            messenger: buildNetworkControllerMessenger(),
            rpcFailoverMode: 'disabled',
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
          const getRpcServiceOptions = (): Omit<
            RpcServiceOptions,
            'failoverService' | 'endpointUrl'
          > => ({
            btoa,
            fetch,
            isOffline: (): boolean => false,
          });
          const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
            pollingInterval: 5000,
          });
          const messenger = buildNetworkControllerMessenger();

          const { provider } = createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
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
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
        });

        it('allows setting the RPC failover mode to enabled, even after having already accessed the provider', async () => {
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
          const getRpcServiceOptions = (): Omit<
            RpcServiceOptions,
            'failoverService' | 'endpointUrl'
          > => ({
            btoa,
            fetch,
            isOffline: (): boolean => false,
          });
          const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
            pollingInterval: 5000,
          });
          const messenger = buildNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'disabled',
          });
          const { provider } = autoManagedNetworkClient;

          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });
          autoManagedNetworkClient.setRpcFailoverMode('enabled');
          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'disabled',
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
        });

        it('allows setting the RPC failover mode to disabled, even after having accessed the provider', async () => {
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
          const getRpcServiceOptions = (): Omit<
            RpcServiceOptions,
            'failoverService' | 'endpointUrl'
          > => ({
            btoa,
            fetch,
            isOffline: (): boolean => false,
          });
          const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
            pollingInterval: 5000,
          });
          const messenger = buildNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
          const { provider } = autoManagedNetworkClient;

          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });
          autoManagedNetworkClient.setRpcFailoverMode('disabled');
          await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'test_method',
            params: [],
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'disabled',
          });
        });
      });

      it('returns a block tracker proxy that has the same interface as a block tracker', () => {
        const { blockTracker } = createAutoManagedNetworkClient({
          networkClientId: 'some-network-client-id',
          networkClientConfiguration,
          getRpcServiceOptions: () => ({
            fetch,
            btoa,
            isOffline: (): boolean => false,
          }),
          messenger: buildNetworkControllerMessenger(),
          rpcFailoverMode: 'disabled',
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
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            messenger: buildNetworkControllerMessenger(),
            rpcFailoverMode: 'disabled',
          });

          const blockNumberViaLatest = await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });
          expect(blockNumberViaLatest).toBe('0x1');
          const blockNumberViaSync = await new Promise((resolve) => {
            blockTracker.once('sync', resolve);
          });
          // False positive.
          // eslint-disable-next-line n/no-sync
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
          const getRpcServiceOptions = (): Omit<
            RpcServiceOptions,
            'failoverService' | 'endpointUrl'
          > => ({
            btoa,
            fetch,
            isOffline: (): boolean => false,
          });
          const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
            pollingInterval: 5000,
          });
          const messenger = buildNetworkControllerMessenger();

          const { blockTracker } = createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
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
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
        });

        it('allows setting the RPC failover mode to enabled, even after having already accessed the block tracker', async () => {
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
          const getRpcServiceOptions = (): Omit<
            RpcServiceOptions,
            'failoverService' | 'endpointUrl'
          > => ({
            btoa,
            fetch,
            isOffline: (): boolean => false,
          });
          const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
            pollingInterval: 5000,
          });
          const messenger = buildNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'disabled',
          });
          const { blockTracker } = autoManagedNetworkClient;

          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });
          autoManagedNetworkClient.setRpcFailoverMode('enabled');
          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'disabled',
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
        });

        it('allows setting the RPC failover mode to disabled, even after having already accessed the block tracker', async () => {
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
          const getRpcServiceOptions = (): Omit<
            RpcServiceOptions,
            'failoverService' | 'endpointUrl'
          > => ({
            btoa,
            fetch,
            isOffline: (): boolean => false,
          });
          const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
            pollingInterval: 5000,
          });
          const messenger = buildNetworkControllerMessenger();

          const autoManagedNetworkClient = createAutoManagedNetworkClient({
            networkClientId: 'some-network-client-id',
            networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
          const { blockTracker } = autoManagedNetworkClient;

          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });
          autoManagedNetworkClient.setRpcFailoverMode('disabled');
          await new Promise((resolve) => {
            blockTracker.once('latest', resolve);
          });

          expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'enabled',
          });
          expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
            id: 'some-network-client-id',
            configuration: networkClientConfiguration,
            getRpcServiceOptions,
            getBlockTrackerOptions,
            messenger,
            rpcFailoverMode: 'disabled',
          });
        });
      });
    });

    it('allows setting the RPC failover mode to forced, even after having already accessed the provider', async () => {
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
      const getRpcServiceOptions = (): Omit<
        RpcServiceOptions,
        'failoverService' | 'endpointUrl'
      > => ({
        btoa,
        fetch,
        isOffline: (): boolean => false,
      });
      const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
        pollingInterval: 5000,
      });
      const messenger = buildNetworkControllerMessenger();

      const autoManagedNetworkClient = createAutoManagedNetworkClient({
        networkClientId: 'some-network-client-id',
        networkClientConfiguration,
        getRpcServiceOptions,
        getBlockTrackerOptions,
        messenger,
        rpcFailoverMode: 'disabled',
      });
      const { provider } = autoManagedNetworkClient;

      await provider.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'test_method',
        params: [],
      });
      autoManagedNetworkClient.setRpcFailoverMode('forced');
      await provider.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'test_method',
        params: [],
      });

      expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
        id: 'some-network-client-id',
        configuration: networkClientConfiguration,
        getRpcServiceOptions,
        getBlockTrackerOptions,
        messenger,
        rpcFailoverMode: 'disabled',
      });
      expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
        id: 'some-network-client-id',
        configuration: networkClientConfiguration,
        getRpcServiceOptions,
        getBlockTrackerOptions,
        messenger,
        rpcFailoverMode: 'forced',
      });
    });

    it('allows setting the RPC failover mode from forced back to disabled, even after having accessed the provider', async () => {
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
      const getRpcServiceOptions = (): Omit<
        RpcServiceOptions,
        'failoverService' | 'endpointUrl'
      > => ({
        btoa,
        fetch,
        isOffline: (): boolean => false,
      });
      const getBlockTrackerOptions = (): PollingBlockTrackerOptions => ({
        pollingInterval: 5000,
      });
      const messenger = buildNetworkControllerMessenger();

      const autoManagedNetworkClient = createAutoManagedNetworkClient({
        networkClientId: 'some-network-client-id',
        networkClientConfiguration,
        getRpcServiceOptions,
        getBlockTrackerOptions,
        messenger,
        rpcFailoverMode: 'forced',
      });
      const { provider } = autoManagedNetworkClient;

      await provider.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'test_method',
        params: [],
      });
      autoManagedNetworkClient.setRpcFailoverMode('disabled');
      await provider.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'test_method',
        params: [],
      });

      expect(createNetworkClientMock).toHaveBeenNthCalledWith(1, {
        id: 'some-network-client-id',
        configuration: networkClientConfiguration,
        getRpcServiceOptions,
        getBlockTrackerOptions,
        messenger,
        rpcFailoverMode: 'forced',
      });
      expect(createNetworkClientMock).toHaveBeenNthCalledWith(2, {
        id: 'some-network-client-id',
        configuration: networkClientConfiguration,
        getRpcServiceOptions,
        getBlockTrackerOptions,
        messenger,
        rpcFailoverMode: 'disabled',
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
        networkClientId: 'some-network-client-id',
        networkClientConfiguration,
        getRpcServiceOptions: () => ({
          fetch,
          btoa,
          isOffline: (): boolean => false,
        }),
        messenger: buildNetworkControllerMessenger(),
        rpcFailoverMode: 'disabled',
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
