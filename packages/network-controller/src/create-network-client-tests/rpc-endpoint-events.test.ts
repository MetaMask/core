import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import {
  ConstantBackoff,
  DEFAULT_DEGRADED_THRESHOLD,
  HttpError,
} from '@metamask/controller-utils';
import { errorCodes } from '@metamask/rpc-errors';

import { buildRootMessenger } from '../../tests/helpers';
import {
  withMockedCommunications,
  withNetworkClient,
} from '../../tests/network-client/helpers';
import { DEFAULT_MAX_CONSECUTIVE_FAILURES } from '../rpc-service/rpc-service';
import { NetworkClientType } from '../types';

describe('createNetworkClient - RPC endpoint events', () => {
  for (const networkClientType of Object.values(NetworkClientType)) {
    describe(`${networkClientType}`, () => {
      const blockNumber = '0x100';
      const backoffDuration = 100;

      describe('with RPC failover', () => {
        it('publishes the NetworkController:rpcEndpointChainUnavailable event only when the max number of consecutive request failures is reached for all of the endpoints in a chain of endpoints', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedUnavailableError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  // The first time a block-cacheable request is made, the
                  // latest block number is retrieved through the block
                  // tracker first.
                  primaryComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });
                  failoverComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });

                  const messenger = buildRootMessenger();
                  const rpcEndpointChainUnavailableEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointChainUnavailable',
                    rpcEndpointChainUnavailableEventHandler,
                  );

                  await withNetworkClient(
                    {
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      providerType: networkClientType,
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId }) => {
                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries,
                      // breaking the circuit; then hit the failover and exceed
                      // the max of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the failover and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the failover and exceed the max number of retries,
                      // breaking the circuit
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );

                      expect(
                        rpcEndpointChainUnavailableEventHandler,
                      ).toHaveBeenCalledTimes(1);
                      expect(
                        rpcEndpointChainUnavailableEventHandler,
                      ).toHaveBeenCalledWith({
                        chainId,
                        error: expectedUnavailableError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      });
                    },
                  );
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointUnavailable event each time the max number of consecutive request failures is reached for any of the endpoints in a chain of endpoints', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedUnavailableError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  // The first time a block-cacheable request is made, the
                  // latest block number is retrieved through the block
                  // tracker first.
                  primaryComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });
                  failoverComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });

                  const messenger = buildRootMessenger();
                  const rpcEndpointUnavailableEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointUnavailable',
                    rpcEndpointUnavailableEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId, rpcUrl }) => {
                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries,
                      // breaking the circuit; then hit the failover and exceed
                      // the max of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the failover and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the failover and exceed the max number of retries,
                      // breaking the circuit
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );

                      expect(
                        rpcEndpointUnavailableEventHandler,
                      ).toHaveBeenCalledTimes(2);
                      expect(
                        rpcEndpointUnavailableEventHandler,
                      ).toHaveBeenCalledWith({
                        chainId,
                        endpointUrl: rpcUrl,
                        error: expectedUnavailableError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                      });
                      expect(
                        rpcEndpointUnavailableEventHandler,
                      ).toHaveBeenCalledWith({
                        chainId,
                        endpointUrl: failoverEndpointUrl,
                        error: expectedUnavailableError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                      });
                    },
                  );
                },
              );
            },
          );
        });

        it('does not retry requests when user is offline', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async () => {
                  // Mock only one failure - if retries were happening, we'd need more
                  primaryComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: 1,
                    response: {
                      httpStatus: 503,
                    },
                  });

                  const rootMessenger = buildRootMessenger({
                    connectivityStatus: CONNECTIVITY_STATUSES.Offline,
                  });

                  const rpcEndpointRetriedEventHandler = jest.fn();
                  rootMessenger.subscribe(
                    'NetworkController:rpcEndpointRetried',
                    rpcEndpointRetriedEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger: rootMessenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall }) => {
                      // When offline, errors are not retried, so the request
                      // should fail immediately without retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );

                      // Verify that retry event was not published
                      expect(
                        rpcEndpointRetriedEventHandler,
                      ).not.toHaveBeenCalled();
                    },
                  );
                },
              );
            },
          );
        });

        it('suppresses the NetworkController:rpcEndpointUnavailable event when user is offline', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  // The first time a block-cacheable request is made, the
                  // latest block number is retrieved through the block
                  // tracker first.
                  primaryComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });
                  failoverComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });

                  const rootMessenger = buildRootMessenger({
                    connectivityStatus: CONNECTIVITY_STATUSES.Offline,
                  });

                  const rpcEndpointUnavailableEventHandler = jest.fn();
                  rootMessenger.subscribe(
                    'NetworkController:rpcEndpointUnavailable',
                    rpcEndpointUnavailableEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger: rootMessenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall }) => {
                      rootMessenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // When offline, errors are not retried, so the circuit
                      // won't break and onServiceBreak won't be called
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );

                      // Event should be suppressed when offline because retries
                      // are prevented, so onServiceBreak is never called
                      expect(
                        rpcEndpointUnavailableEventHandler,
                      ).not.toHaveBeenCalled();
                    },
                  );
                },
              );
            },
          );
        });

        it('does not publish the NetworkController:rpcEndpointChainDegraded event again if the max number of retries is reached in making requests to a failover endpoint', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedDegradedError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  const messenger = buildRootMessenger();
                  const rpcEndpointChainDegradedEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointChainDegraded',
                    rpcEndpointChainDegradedEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId }) => {
                      // The first time a block-cacheable request is made, the
                      // latest block number is retrieved through the block
                      // tracker first.
                      primaryComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                        response: {
                          httpStatus: 503,
                        },
                      });
                      failoverComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        times: 5,
                        response: {
                          httpStatus: 503,
                        },
                      });

                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries,
                      // break the circuit; hit the failover and exceed the max
                      // number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );

                      expect(
                        rpcEndpointChainDegradedEventHandler,
                      ).toHaveBeenCalledTimes(1);
                      expect(
                        rpcEndpointChainDegradedEventHandler,
                      ).toHaveBeenCalledWith({
                        chainId,
                        type: 'retries_exhausted',
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                    },
                  );
                },
              );
            },
          );
        });

        it('does not publish the NetworkController:rpcEndpointChainDegraded event again when the time to complete a request to a failover endpoint is too long', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedDegradedError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  const messenger = buildRootMessenger();
                  const rpcEndpointChainDegradedEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointChainDegraded',
                    rpcEndpointChainDegradedEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId }) => {
                      // The first time a block-cacheable request is made, the
                      // latest block number is retrieved through the block
                      // tracker first.
                      primaryComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                        response: {
                          httpStatus: 503,
                        },
                      });
                      failoverComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        response: () => {
                          jest.advanceTimersByTime(
                            DEFAULT_DEGRADED_THRESHOLD + 1,
                          );
                          return {
                            result: '0x1',
                          };
                        },
                      });
                      failoverComms.mockRpcCall({
                        request,
                        response: () => {
                          jest.advanceTimersByTime(
                            DEFAULT_DEGRADED_THRESHOLD + 1,
                          );
                          return {
                            result: 'ok',
                          };
                        },
                      });

                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries,
                      // break the circuit; hit the failover
                      await makeRpcCall(request);

                      expect(
                        rpcEndpointChainDegradedEventHandler,
                      ).toHaveBeenCalledTimes(1);
                      expect(
                        rpcEndpointChainDegradedEventHandler,
                      ).toHaveBeenCalledWith({
                        chainId,
                        type: 'retries_exhausted',
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                    },
                  );
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointDegraded event again if the max number of retries is reached in making requests to a failover endpoint', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedDegradedError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  const messenger = buildRootMessenger();
                  const rpcEndpointDegradedEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointDegraded',
                    rpcEndpointDegradedEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId, rpcUrl }) => {
                      // The first time a block-cacheable request is made, the
                      // latest block number is retrieved through the block
                      // tracker first.
                      primaryComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                        response: {
                          httpStatus: 503,
                        },
                      });
                      failoverComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        times: 5,
                        response: {
                          httpStatus: 503,
                        },
                      });

                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries,
                      // break the circuit; hit the failover and exceed the max
                      // number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );

                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenCalledTimes(3);
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(1, {
                        chainId,
                        type: 'retries_exhausted',
                        endpointUrl: rpcUrl,
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(2, {
                        chainId,
                        type: 'retries_exhausted',
                        endpointUrl: rpcUrl,
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(3, {
                        chainId,
                        type: 'retries_exhausted',
                        endpointUrl: failoverEndpointUrl,
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                    },
                  );
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointDegraded event again when the time to complete a request to a failover endpoint is too long', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedDegradedError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  const messenger = buildRootMessenger();
                  const rpcEndpointDegradedEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointDegraded',
                    rpcEndpointDegradedEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId, rpcUrl }) => {
                      // The first time a block-cacheable request is made, the
                      // latest block number is retrieved through the block
                      // tracker first.
                      primaryComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                        response: {
                          httpStatus: 503,
                        },
                      });
                      failoverComms.mockRpcCall({
                        request: {
                          method: 'eth_blockNumber',
                          params: [],
                        },
                        response: () => {
                          jest.advanceTimersByTime(
                            DEFAULT_DEGRADED_THRESHOLD + 1,
                          );
                          return {
                            result: '0x1',
                          };
                        },
                      });
                      failoverComms.mockRpcCall({
                        request,
                        response: () => {
                          jest.advanceTimersByTime(
                            DEFAULT_DEGRADED_THRESHOLD + 1,
                          );
                          return {
                            result: 'ok',
                          };
                        },
                      });

                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the primary and exceed the max number of retries,
                      // break the circuit; hit the failover
                      await makeRpcCall(request);

                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenCalledTimes(4);
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(1, {
                        chainId,
                        type: 'retries_exhausted',
                        endpointUrl: rpcUrl,
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(2, {
                        chainId,
                        type: 'retries_exhausted',
                        endpointUrl: rpcUrl,
                        error: expectedDegradedError,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        retryReason: 'non_successful_http_status',
                        rpcMethodName: 'eth_blockNumber',
                      });
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(3, {
                        chainId,
                        type: 'slow_success',
                        endpointUrl: failoverEndpointUrl,
                        error: undefined,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        rpcMethodName: 'eth_blockNumber',
                      });
                      expect(
                        rpcEndpointDegradedEventHandler,
                      ).toHaveBeenNthCalledWith(4, {
                        chainId,
                        type: 'slow_success',
                        endpointUrl: failoverEndpointUrl,
                        error: undefined,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        primaryEndpointUrl: rpcUrl,
                        rpcMethodName: 'eth_gasPrice',
                      });
                    },
                  );
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointChainAvailable event the first time a successful request to a failover endpoint is made', async () => {
          const failoverEndpointUrl = 'https://failover.endpoint/';
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (primaryComms) => {
              await withMockedCommunications(
                {
                  providerType: 'custom',
                  customRpcUrl: failoverEndpointUrl,
                },
                async (failoverComms) => {
                  // The first time a block-cacheable request is made, the
                  // latest block number is retrieved through the block
                  // tracker first.
                  primaryComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                    response: {
                      httpStatus: 503,
                    },
                  });
                  failoverComms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    response: {
                      result: '0x1',
                    },
                  });
                  failoverComms.mockRpcCall({
                    request,
                    response: {
                      result: 'ok',
                    },
                  });

                  const messenger = buildRootMessenger();
                  const rpcEndpointChainAvailableEventHandler = jest.fn();
                  messenger.subscribe(
                    'NetworkController:rpcEndpointChainAvailable',
                    rpcEndpointChainAvailableEventHandler,
                  );

                  await withNetworkClient(
                    {
                      providerType: networkClientType,
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      isRpcFailoverEnabled: true,
                      failoverRpcUrls: [failoverEndpointUrl],
                      messenger,
                      getRpcServiceOptions: () => ({
                        fetch,
                        btoa,
                        policyOptions: {
                          backoff: new ConstantBackoff(backoffDuration),
                        },
                        isOffline: (): boolean => false,
                      }),
                    },
                    async ({ makeRpcCall, chainId }) => {
                      messenger.subscribe(
                        'NetworkController:rpcEndpointRetried',
                        () => {
                          // Ensure that we advance to the next RPC request
                          // retry, not the next block tracker request.
                          jest.advanceTimersByTime(backoffDuration);
                        },
                      );

                      // Hit the endpoint and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the endpoint and exceed the max number of retries
                      await expect(makeRpcCall(request)).rejects.toThrow(
                        expectedError,
                      );
                      // Hit the endpoint and exceed the max number of retries,
                      // breaking the circuit; hit the failover
                      await makeRpcCall(request);

                      expect(
                        rpcEndpointChainAvailableEventHandler,
                      ).toHaveBeenCalledTimes(1);
                      expect(
                        rpcEndpointChainAvailableEventHandler,
                      ).toHaveBeenCalledWith({
                        chainId,
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      });
                    },
                  );
                },
              );
            },
          );
        });
      });

      describe('without RPC failover', () => {
        it('publishes the NetworkController:rpcEndpointChainDegraded event only once, even if the max number of retries is continually reached in making requests to a primary endpoint', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedDegradedError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              // The first time a block-cacheable request is made, the
              // latest block number is retrieved through the block
              // tracker first.
              comms.mockRpcCall({
                request: {
                  method: 'eth_blockNumber',
                  params: [],
                },
                times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                response: {
                  httpStatus: 503,
                },
              });

              const messenger = buildRootMessenger();
              const rpcEndpointChainDegradedEventHandler = jest.fn();
              messenger.subscribe(
                'NetworkController:rpcEndpointChainDegraded',
                rpcEndpointChainDegradedEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger,
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall, chainId }) => {
                  messenger.subscribe(
                    'NetworkController:rpcEndpointRetried',
                    () => {
                      // Ensure that we advance to the next RPC request
                      // retry, not the next block tracker request.
                      jest.advanceTimersByTime(backoffDuration);
                    },
                  );

                  // Hit the endpoint and exceed the max number of retries
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );
                  // Hit the endpoint and exceed the max number of retries
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );
                  // Hit the endpoint and exceed the max number of retries,
                  // breaking the circuit
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );

                  expect(
                    rpcEndpointChainDegradedEventHandler,
                  ).toHaveBeenCalledTimes(1);
                  expect(
                    rpcEndpointChainDegradedEventHandler,
                  ).toHaveBeenCalledWith({
                    chainId,
                    type: 'retries_exhausted',
                    error: expectedDegradedError,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    retryReason: 'non_successful_http_status',
                    rpcMethodName: 'eth_blockNumber',
                  });
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointChainDegraded event only once, even if the time to complete a request to a primary endpoint is continually too long', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              const messenger = buildRootMessenger();
              const rpcEndpointChainDegradedEventHandler = jest.fn();
              messenger.subscribe(
                'NetworkController:rpcEndpointChainDegraded',
                rpcEndpointChainDegradedEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger,
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall, chainId }) => {
                  // The first time a block-cacheable request is made, the
                  // latest block number is retrieved through the block
                  // tracker first.
                  comms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    response: () => {
                      jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
                      return {
                        result: '0x1',
                      };
                    },
                  });
                  comms.mockRpcCall({
                    request,
                    response: () => {
                      jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
                      return {
                        result: 'ok',
                      };
                    },
                    times: 2,
                  });

                  await makeRpcCall(request);
                  await makeRpcCall(request);

                  expect(
                    rpcEndpointChainDegradedEventHandler,
                  ).toHaveBeenCalledTimes(1);
                  expect(
                    rpcEndpointChainDegradedEventHandler,
                  ).toHaveBeenCalledWith({
                    chainId,
                    type: 'slow_success',
                    error: undefined,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    rpcMethodName: 'eth_blockNumber',
                  });
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointDegraded event each time the max number of retries is reached in making requests to a primary endpoint', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);
          const expectedDegradedError = new HttpError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              // The first time a block-cacheable request is made, the
              // latest block number is retrieved through the block
              // tracker first.
              comms.mockRpcCall({
                request: {
                  method: 'eth_blockNumber',
                  params: [],
                },
                times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                response: {
                  httpStatus: 503,
                },
              });

              const messenger = buildRootMessenger();
              const rpcEndpointDegradedEventHandler = jest.fn();
              messenger.subscribe(
                'NetworkController:rpcEndpointDegraded',
                rpcEndpointDegradedEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger,
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall, chainId, rpcUrl }) => {
                  messenger.subscribe(
                    'NetworkController:rpcEndpointRetried',
                    () => {
                      // Ensure that we advance to the next RPC request
                      // retry, not the next block tracker request.
                      jest.advanceTimersByTime(backoffDuration);
                    },
                  );

                  // Hit the endpoint and exceed the max number of retries
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );
                  // Hit the endpoint and exceed the max number of retries
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );
                  // Hit the endpoint and exceed the max number of retries,
                  // breaking the circuit
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );

                  expect(rpcEndpointDegradedEventHandler).toHaveBeenCalledTimes(
                    2,
                  );
                  expect(rpcEndpointDegradedEventHandler).toHaveBeenCalledWith({
                    chainId,
                    type: 'retries_exhausted',
                    endpointUrl: rpcUrl,
                    error: expectedDegradedError,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    primaryEndpointUrl: rpcUrl,
                    retryReason: 'non_successful_http_status',
                    rpcMethodName: 'eth_blockNumber',
                  });
                  expect(rpcEndpointDegradedEventHandler).toHaveBeenCalledWith({
                    chainId,
                    type: 'retries_exhausted',
                    endpointUrl: rpcUrl,
                    error: expectedDegradedError,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    primaryEndpointUrl: rpcUrl,
                    retryReason: 'non_successful_http_status',
                    rpcMethodName: 'eth_blockNumber',
                  });
                },
              );
            },
          );
        });

        it('does not retry requests when user is offline (degraded scenario)', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              // Mock only one failure - if retries were happening, we'd need more
              comms.mockRpcCall({
                request: {
                  method: 'eth_blockNumber',
                  params: [],
                },
                times: 1,
                response: {
                  httpStatus: 503,
                },
              });
              comms.mockRpcCall({
                request: {
                  method: 'eth_gasPrice',
                  params: [],
                },
                times: 1,
                response: {
                  httpStatus: 503,
                },
              });

              const rootMessenger = buildRootMessenger({
                connectivityStatus: CONNECTIVITY_STATUSES.Offline,
              });

              const rpcEndpointRetriedEventHandler = jest.fn();
              rootMessenger.subscribe(
                'NetworkController:rpcEndpointRetried',
                rpcEndpointRetriedEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger: rootMessenger,
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall }) => {
                  // When offline, errors are not retried, so the request
                  // should fail immediately without retries
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );

                  // Verify that retry event was not published
                  expect(rpcEndpointRetriedEventHandler).not.toHaveBeenCalled();
                },
              );
            },
          );
        });

        it('suppresses the NetworkController:rpcEndpointDegraded event when user is offline', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };
          const expectedError = createResourceUnavailableError(503);

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              // The first time a block-cacheable request is made, the
              // latest block number is retrieved through the block
              // tracker first.
              comms.mockRpcCall({
                request: {
                  method: 'eth_blockNumber',
                  params: [],
                },
                times: DEFAULT_MAX_CONSECUTIVE_FAILURES,
                response: {
                  httpStatus: 503,
                },
              });

              const rootMessenger = buildRootMessenger({
                connectivityStatus: CONNECTIVITY_STATUSES.Offline,
              });

              const rpcEndpointDegradedEventHandler = jest.fn();
              rootMessenger.subscribe(
                'NetworkController:rpcEndpointDegraded',
                rpcEndpointDegradedEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger: rootMessenger,
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall }) => {
                  rootMessenger.subscribe(
                    'NetworkController:rpcEndpointRetried',
                    () => {
                      // Ensure that we advance to the next RPC request
                      // retry, not the next block tracker request.
                      jest.advanceTimersByTime(backoffDuration);
                    },
                  );

                  // When offline, errors are not retried, so the circuit
                  // won't accumulate failures and onServiceDegraded won't be called
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );
                  await expect(makeRpcCall(request)).rejects.toThrow(
                    expectedError,
                  );

                  // Event should be suppressed when offline because retries
                  // are prevented, so onServiceDegraded is never called
                  expect(
                    rpcEndpointDegradedEventHandler,
                  ).not.toHaveBeenCalled();
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointDegraded event when the time to complete a request to a primary endpoint is continually too long', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              const messenger = buildRootMessenger();
              const rpcEndpointDegradedEventHandler = jest.fn();
              messenger.subscribe(
                'NetworkController:rpcEndpointDegraded',
                rpcEndpointDegradedEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger,
                  getBlockTrackerOptions: () => ({
                    pollingInterval: 10000,
                  }),
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall, chainId, rpcUrl }) => {
                  // The first time a block-cacheable request is made, the
                  // latest block number is retrieved through the block
                  // tracker first.
                  comms.mockRpcCall({
                    request: {
                      method: 'eth_blockNumber',
                      params: [],
                    },
                    response: () => {
                      jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
                      return {
                        result: '0x1',
                      };
                    },
                  });
                  comms.mockRpcCall({
                    request,
                    response: () => {
                      jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
                      return {
                        result: 'ok',
                      };
                    },
                  });

                  await makeRpcCall(request);

                  expect(rpcEndpointDegradedEventHandler).toHaveBeenCalledTimes(
                    2,
                  );
                  expect(rpcEndpointDegradedEventHandler).toHaveBeenCalledWith({
                    chainId,
                    type: 'slow_success',
                    endpointUrl: rpcUrl,
                    error: undefined,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    primaryEndpointUrl: rpcUrl,
                    rpcMethodName: 'eth_blockNumber',
                  });
                  expect(rpcEndpointDegradedEventHandler).toHaveBeenCalledWith({
                    chainId,
                    type: 'slow_success',
                    endpointUrl: rpcUrl,
                    error: undefined,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    primaryEndpointUrl: rpcUrl,
                    rpcMethodName: 'eth_gasPrice',
                  });
                },
              );
            },
          );
        });

        it('publishes the NetworkController:rpcEndpointChainAvailable event the first time a successful request to a (primary) RPC endpoint is made', async () => {
          const request = {
            method: 'eth_gasPrice',
            params: [],
          };

          await withMockedCommunications(
            { providerType: networkClientType },
            async (comms) => {
              // The first time a block-cacheable request is made, the
              // latest block number is retrieved through the block
              // tracker first.
              comms.mockNextBlockTrackerRequest({
                blockNumber,
              });
              comms.mockRpcCall({
                request,
                response: {
                  result: 'ok',
                },
              });

              const messenger = buildRootMessenger();
              const rpcEndpointChainAvailableEventHandler = jest.fn();
              messenger.subscribe(
                'NetworkController:rpcEndpointChainAvailable',
                rpcEndpointChainAvailableEventHandler,
              );

              await withNetworkClient(
                {
                  providerType: networkClientType,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  messenger,
                  getRpcServiceOptions: () => ({
                    fetch,
                    btoa,
                    policyOptions: {
                      backoff: new ConstantBackoff(backoffDuration),
                    },
                    isOffline: (): boolean => false,
                  }),
                },
                async ({ makeRpcCall, chainId }) => {
                  await makeRpcCall(request);

                  expect(
                    rpcEndpointChainAvailableEventHandler,
                  ).toHaveBeenCalledTimes(1);
                  expect(
                    rpcEndpointChainAvailableEventHandler,
                  ).toHaveBeenCalledWith({
                    chainId,
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  });
                },
              );
            },
          );
        });
      });
    });
  }
});

/**
 * Creates a "resource unavailable" RPC error for testing.
 *
 * @param httpStatus - The HTTP status that the error represents.
 * @returns The RPC error.
 */
function createResourceUnavailableError(httpStatus: number): Error {
  return expect.objectContaining({
    code: errorCodes.rpc.resourceUnavailable,
    message: 'RPC endpoint not found or unavailable.',
    data: expect.objectContaining({
      httpStatus,
    }),
  });
}
