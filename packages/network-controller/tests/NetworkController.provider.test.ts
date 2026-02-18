import {
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
} from '@metamask/controller-utils';
import nock from 'nock';

import {
  buildCustomNetworkConfiguration,
  buildCustomRpcEndpoint,
  withController,
} from './helpers';
import { NetworkStatus } from '../src/constants';

describe('NetworkController provider tests', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets the status of a network client to "available" the first time its (sole) RPC endpoint returns a 2xx response', async () => {
    const endpointUrl = 'https://some.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(endpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      })
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: endpointUrl,
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller }) => {
        const { provider } = controller.getNetworkClientById(networkClientId);

        await provider.request({
          id: 1,
          jsonrpc: '2.0',
          method: rpcMethod,
          params: [],
        });

        expect(controller.state.networksMetadata[networkClientId].status).toBe(
          NetworkStatus.Available,
        );
      },
    );
  });

  it('sets the status of a network client to "degraded" when its (sole) RPC endpoint responds with 2xx but slowly', async () => {
    const endpointUrl = 'https://some.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(endpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .reply(() => {
        jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
        return [
          200,
          {
            id: 1,
            jsonrpc: '2.0',
            result: 'ok',
          },
        ];
      })
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      })
      .reply(() => {
        jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
        return [
          200,
          {
            id: 1,
            jsonrpc: '2.0',
            result: 'ok',
          },
        ];
      });

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: endpointUrl,
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller }) => {
        const { provider } = controller.getNetworkClientById(networkClientId);

        await provider.request({
          id: 1,
          jsonrpc: '2.0',
          method: rpcMethod,
          params: [],
        });

        expect(controller.state.networksMetadata[networkClientId].status).toBe(
          NetworkStatus.Degraded,
        );
      },
    );
  });

  it('sets the status of a network client to "degraded" when failed requests to its (sole) RPC endpoint reach the max number of retries', async () => {
    const endpointUrl = 'https://some.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(endpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(5)
      .reply(503);

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: endpointUrl,
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const { provider } = controller.getNetworkClientById(networkClientId);

        await expect(
          provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: rpcMethod,
            params: [],
          }),
        ).rejects.toThrow('RPC endpoint not found or unavailable');

        expect(controller.state.networksMetadata[networkClientId].status).toBe(
          NetworkStatus.Degraded,
        );
      },
    );
  });

  it('transitions the status of a network client from "degraded" to "available" the first time a failover is activated and returns a 2xx response', async () => {
    const primaryEndpointUrl = 'https://first.endpoint';
    const secondaryEndpointUrl = 'https://second.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(primaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503);
    nock(secondaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      })
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: primaryEndpointUrl,
                  failoverUrls: [secondaryEndpointUrl],
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const stateChangeListener = jest.fn();
        messenger.subscribe(
          'NetworkController:stateChange',
          stateChangeListener,
        );
        const { provider } = controller.getNetworkClientById(networkClientId);
        const request = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: rpcMethod,
          params: [],
        };
        const expectedError = 'RPC endpoint not found or unavailable';

        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, break the circuit, fail over to the secondary.
        await provider.request(request);

        expect(stateChangeListener).toHaveBeenCalledTimes(2);
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          1,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'degraded',
            },
          ],
        );
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          2,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'available',
            },
          ],
        );
      },
    );
  });

  it('does not transition the status of a network client from "degraded" the first time a failover is activated if it returns a non-2xx response', async () => {
    const primaryEndpointUrl = 'https://first.endpoint';
    const secondaryEndpointUrl = 'https://second.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(primaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503);
    nock(secondaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(5)
      .reply(503);

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: primaryEndpointUrl,
                  failoverUrls: [secondaryEndpointUrl],
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const stateChangeListener = jest.fn();
        messenger.subscribe(
          'NetworkController:stateChange',
          stateChangeListener,
        );
        const { provider } = controller.getNetworkClientById(networkClientId);
        const request = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: rpcMethod,
          params: [],
        };
        const expectedError = 'RPC endpoint not found or unavailable';

        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, break the circuit, fail over to the secondary,
        // run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);

        expect(controller.state.networksMetadata[networkClientId].status).toBe(
          NetworkStatus.Degraded,
        );
      },
    );
  });

  it('does not transition the status of a network client from "degraded" the first time a failover is activated if requests are slow to complete', async () => {
    const primaryEndpointUrl = 'https://first.endpoint';
    const secondaryEndpointUrl = 'https://second.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(primaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503);
    nock(secondaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .reply(() => {
        jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
        return [
          200,
          {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          },
        ];
      })
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      })
      .reply(() => {
        jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
        return [
          200,
          {
            id: 1,
            jsonrpc: '2.0',
            result: 'ok',
          },
        ];
      });

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: primaryEndpointUrl,
                  failoverUrls: [secondaryEndpointUrl],
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const stateChangeListener = jest.fn();
        messenger.subscribe(
          'NetworkController:stateChange',
          stateChangeListener,
        );
        const { provider } = controller.getNetworkClientById(networkClientId);
        const request = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: rpcMethod,
          params: [],
        };
        const expectedError = 'RPC endpoint not found or unavailable';

        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, break the circuit, fail over to the secondary.
        await provider.request(request);

        expect(controller.state.networksMetadata[networkClientId].status).toBe(
          NetworkStatus.Degraded,
        );
      },
    );
  });

  it('sets the status of a network client to "unavailable" when all of its RPC endpoints consistently return 5xx errors, reaching the max consecutive number of failures', async () => {
    const primaryEndpointUrl = 'https://first.endpoint';
    const secondaryEndpointUrl = 'https://second.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(primaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503);
    nock(secondaryEndpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503);

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: primaryEndpointUrl,
                  failoverUrls: [secondaryEndpointUrl],
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const { provider } = controller.getNetworkClientById(networkClientId);
        const request = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: rpcMethod,
          params: [],
        };
        const expectedError = 'RPC endpoint not found or unavailable';

        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the primary, break the circuit, fail over to the secondary,
        // run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the secondary, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the secondary, break the circuit.
        await expect(provider.request(request)).rejects.toThrow(expectedError);

        expect(controller.state.networksMetadata[networkClientId].status).toBe(
          NetworkStatus.Unavailable,
        );
      },
    );
  });

  it('transitions the status of a network client from "unavailable" to "available" when its (sole) RPC endpoint consistently returns 5xx errors for a while and then recovers', async () => {
    const endpointUrl = 'https://some.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(endpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      })
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: endpointUrl,
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const stateChangeListener = jest.fn();
        messenger.subscribe(
          'NetworkController:stateChange',
          stateChangeListener,
        );
        const { provider } = controller.getNetworkClientById(networkClientId);
        const request = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: rpcMethod,
          params: [],
        };
        const expectedError = 'RPC endpoint not found or unavailable';

        // Hit the endpoint, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the endpoint, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the endpoint, break the circuit.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Wait until the circuit break duration passes and hit the endpoint
        // again.
        jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
        await provider.request(request);

        expect(stateChangeListener).toHaveBeenCalledTimes(3);
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          1,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'degraded',
            },
          ],
        );
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          2,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'unavailable',
            },
          ],
        );
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          3,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'available',
            },
          ],
        );
      },
    );
  });

  it('transitions the status of a network client from "available" to "unavailable" when its (sole) RPC endpoint responds with 2xx and then returns too many 5xx responses, reaching the max number of consecutive failures', async () => {
    const endpointUrl = 'https://some.endpoint';
    const networkClientId = 'AAAA-AAAA-AAAA-AAAA';
    const rpcMethod = 'eth_gasPrice';

    nock(endpointUrl)
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      })
      .post('/', {
        id: /^\d+$/u,
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
      })
      .times(15)
      .reply(503)
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      })
      .reply(200, {
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });

    await withController(
      {
        isRpcFailoverEnabled: true,
        state: {
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              name: 'Test Network',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId,
                  url: endpointUrl,
                }),
              ],
            }),
          },
          networksMetadata: {
            [networkClientId]: {
              EIPS: {},
              status: NetworkStatus.Unknown,
            },
          },
          selectedNetworkClientId: networkClientId,
        },
      },
      async ({ controller, messenger }) => {
        messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
          jest.advanceTimersToNextTimer();
        });
        const stateChangeListener = jest.fn();
        messenger.subscribe(
          'NetworkController:stateChange',
          stateChangeListener,
        );
        const { provider } = controller.getNetworkClientById(networkClientId);
        const request = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: rpcMethod,
          params: [],
        };
        const expectedError = 'RPC endpoint not found or unavailable';

        // Hit the endpoint and see that it is successful.
        await provider.request(request);
        // Wait for the block tracker to reset the cache. (For some reason,
        // multiple timers exist.)
        jest.runAllTimers();
        // Hit the endpoint, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the endpoint, run out of retries.
        await expect(provider.request(request)).rejects.toThrow(expectedError);
        // Hit the endpoint, break the circuit.
        await expect(provider.request(request)).rejects.toThrow(expectedError);

        expect(stateChangeListener).toHaveBeenCalledTimes(3);
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          1,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'available',
            },
          ],
        );
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          2,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'degraded',
            },
          ],
        );
        expect(stateChangeListener).toHaveBeenNthCalledWith(
          3,
          expect.any(Object),
          [
            {
              op: 'replace',
              path: ['networksMetadata', 'AAAA-AAAA-AAAA-AAAA', 'status'],
              value: 'unavailable',
            },
          ],
        );
      },
    );
  });
});
