import { ConstantBackoff } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import type { MockRequest, MockResponse, ProviderType } from './helpers';
import { withMockedCommunications, withNetworkClient } from './helpers';
import { ignoreRejection } from '../../../../tests/helpers';
import { buildRootMessenger } from '../helpers';

/**
 * Tests for RPC failover behavior.
 *
 * @param args - The arguments.
 * @param args.providerType - The provider type.
 * @param args.requestToCall - The request to call.
 * @param args.getRequestToMock - Factory returning the request to mock.
 * @param args.failure - The failure mock response to use.
 * @param args.isRetriableFailure - Whether the failure gets retried.
 * @param args.getExpectedError - Factory returning the expected error.
 */
export function testsForRpcFailoverBehavior({
  providerType,
  requestToCall,
  getRequestToMock,
  failure,
  isRetriableFailure,
  getExpectedError,
}: {
  providerType: ProviderType;
  requestToCall: MockRequest;
  getRequestToMock: (request: MockRequest, blockNumber: Hex) => MockRequest;
  failure: MockResponse | Error | string;
  isRetriableFailure: boolean;
  getExpectedError: (url: string) => Error | jest.Constructable;
}) {
  const blockNumber = '0x100';
  const backoffDuration = 100;
  const maxConsecutiveFailures = 15;
  const maxRetries = 4;
  const numRequestsToMake = isRetriableFailure
    ? maxConsecutiveFailures / (maxRetries + 1)
    : maxConsecutiveFailures;

  describe('assuming RPC failover functionality is enabled', () => {
    it(`fails over to the provided alternate RPC endpoint after ${maxConsecutiveFailures} unsuccessful attempts`, async () => {
      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = requestToCall;
            const requestToMock = getRequestToMock(request, blockNumber);
            const additionalMockRpcCallOptions =
              // eslint-disable-next-line jest/no-conditional-in-test
              failure instanceof Error || typeof failure === 'string'
                ? { error: failure }
                : { response: failure };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest({
              blockNumber,
            });
            primaryComms.mockRpcCall({
              request: requestToMock,
              times: maxConsecutiveFailures,
              ...additionalMockRpcCallOptions,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request: requestToMock,
              response: {
                result: 'ok',
              },
            });

            const messenger = buildRootMessenger();

            const result = await withNetworkClient(
              {
                providerType,
                failoverRpcUrls: ['https://failover.endpoint'],
                messenger,
                getRpcServiceOptions: () => ({
                  fetch,
                  btoa,
                  policyOptions: {
                    backoff: new ConstantBackoff(backoffDuration),
                  },
                }),
              },
              async ({ makeRpcCall, clock }) => {
                messenger.subscribe(
                  'NetworkController:rpcEndpointRequestRetried',
                  () => {
                    // Ensure that we advance to the next RPC request
                    // retry, not the next block tracker request.
                    // We also don't need to await this, it just needs to
                    // be added to the promise queue.
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    clock.tickAsync(backoffDuration);
                  },
                );

                for (let i = 0; i < numRequestsToMake - 1; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }
                return await makeRpcCall(request);
              },
            );

            expect(result).toBe('ok');
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
      const failoverEndpointUrl = 'https://failover.endpoint/';

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: failoverEndpointUrl,
          },
          async (failoverComms) => {
            const request = requestToCall;
            const requestToMock = getRequestToMock(request, blockNumber);
            const additionalMockRpcCallOptions =
              // eslint-disable-next-line jest/no-conditional-in-test
              failure instanceof Error || typeof failure === 'string'
                ? { error: failure }
                : { response: failure };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest({
              blockNumber,
            });
            primaryComms.mockRpcCall({
              request: requestToMock,
              times: maxConsecutiveFailures,
              ...additionalMockRpcCallOptions,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request: requestToMock,
              response: {
                result: 'ok',
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
                providerType,
                failoverRpcUrls: [failoverEndpointUrl],
                messenger,
                getRpcServiceOptions: () => ({
                  fetch,
                  btoa,
                  policyOptions: {
                    backoff: new ConstantBackoff(backoffDuration),
                  },
                }),
              },
              async ({ makeRpcCall, clock, chainId, rpcUrl }) => {
                messenger.subscribe(
                  'NetworkController:rpcEndpointRequestRetried',
                  () => {
                    // Ensure that we advance to the next RPC request
                    // retry, not the next block tracker request.
                    // We also don't need to await this, it just needs to
                    // be added to the promise queue.
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    clock.tickAsync(backoffDuration);
                  },
                );

                for (let i = 0; i < numRequestsToMake - 1; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }
                await makeRpcCall(request);

                expect(rpcEndpointUnavailableEventHandler).toHaveBeenCalledWith(
                  {
                    chainId,
                    endpointUrl: rpcUrl,
                    failoverEndpointUrl,
                    error: getExpectedError(rpcUrl),
                  },
                );
              },
            );
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
      const failoverEndpointUrl = 'https://failover.endpoint/';

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: failoverEndpointUrl,
          },
          async (failoverComms) => {
            const request = requestToCall;
            const requestToMock = getRequestToMock(request, blockNumber);
            const additionalMockRpcCallOptions =
              // eslint-disable-next-line jest/no-conditional-in-test
              failure instanceof Error || typeof failure === 'string'
                ? { error: failure }
                : { response: failure };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest({
              blockNumber,
            });
            primaryComms.mockRpcCall({
              request: requestToMock,
              times: maxConsecutiveFailures,
              ...additionalMockRpcCallOptions,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request: requestToMock,
              times: maxConsecutiveFailures,
              ...additionalMockRpcCallOptions,
            });
            // Block tracker requests on the primary will fail over
            failoverComms.mockNextBlockTrackerRequest({
              blockNumber,
            });

            const messenger = buildRootMessenger();
            const rpcEndpointUnavailableEventHandler = jest.fn();
            messenger.subscribe(
              'NetworkController:rpcEndpointUnavailable',
              rpcEndpointUnavailableEventHandler,
            );

            await withNetworkClient(
              {
                providerType,
                failoverRpcUrls: [failoverEndpointUrl],
                messenger,
                getRpcServiceOptions: () => ({
                  fetch,
                  btoa,
                  policyOptions: {
                    backoff: new ConstantBackoff(backoffDuration),
                  },
                }),
              },
              async ({ makeRpcCall, clock, chainId }) => {
                messenger.subscribe(
                  'NetworkController:rpcEndpointRequestRetried',
                  () => {
                    // Ensure that we advance to the next RPC request
                    // retry, not the next block tracker request.
                    // We also don't need to await this, it just needs to
                    // be added to the promise queue.
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    clock.tickAsync(backoffDuration);
                  },
                );

                for (let i = 0; i < maxConsecutiveFailures - 1; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }
                for (let i = 0; i < maxConsecutiveFailures; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }

                expect(
                  rpcEndpointUnavailableEventHandler,
                ).toHaveBeenNthCalledWith(2, {
                  chainId,
                  endpointUrl: failoverEndpointUrl,
                  error: getExpectedError(failoverEndpointUrl),
                });
              },
            );
          },
        );
      });
    });

    it('allows RPC service options to be customized', async () => {
      const customMaxConsecutiveFailures = 6;
      const customMaxRetries = 2;
      // This is okay.
      // eslint-disable-next-line jest/no-conditional-in-test
      const customNumRequestsToMake = isRetriableFailure
        ? customMaxConsecutiveFailures / (customMaxRetries + 1)
        : customMaxConsecutiveFailures;

      await withMockedCommunications(
        {
          providerType,
          expectedHeaders: {
            'X-Foo': 'Bar',
          },
        },
        async (primaryComms) => {
          await withMockedCommunications(
            {
              providerType: 'custom',
              customRpcUrl: 'https://failover.endpoint',
              expectedHeaders: {
                'X-Baz': 'Qux',
              },
            },
            async (failoverComms) => {
              const request = requestToCall;
              const requestToMock = getRequestToMock(request, blockNumber);
              const additionalMockRpcCallOptions =
                // eslint-disable-next-line jest/no-conditional-in-test
                failure instanceof Error || typeof failure === 'string'
                  ? { error: failure }
                  : { response: failure };

              // The first time a block-cacheable request is made, the
              // latest block number is retrieved through the block
              // tracker first.
              primaryComms.mockNextBlockTrackerRequest({
                blockNumber,
              });
              primaryComms.mockRpcCall({
                request: requestToMock,
                times: customMaxConsecutiveFailures,
                ...additionalMockRpcCallOptions,
              });
              // The block-ref middleware will make the request as
              // specified except that the block param is replaced with
              // the latest block number.
              failoverComms.mockRpcCall({
                request: requestToMock,
                response: {
                  result: 'ok',
                },
              });

              const messenger = buildRootMessenger();

              const result = await withNetworkClient(
                {
                  providerType,
                  failoverRpcUrls: ['https://failover.endpoint'],
                  messenger,
                  getRpcServiceOptions: (rpcEndpointUrl) => {
                    const commonOptions = { fetch, btoa };
                    // We need to return different results.
                    // eslint-disable-next-line jest/no-conditional-in-test
                    if (rpcEndpointUrl === 'https://failover.endpoint') {
                      const headers: HeadersInit = {
                        'X-Baz': 'Qux',
                      };
                      return {
                        ...commonOptions,
                        fetchOptions: {
                          headers,
                        },
                      };
                    }
                    const headers: HeadersInit = {
                      'X-Foo': 'Bar',
                    };
                    return {
                      ...commonOptions,
                      fetchOptions: {
                        headers,
                      },
                      policyOptions: {
                        backoff: new ConstantBackoff(backoffDuration),
                        maxRetries: customMaxRetries,
                        maxConsecutiveFailures: customMaxConsecutiveFailures,
                      },
                    };
                  },
                },
                async ({ makeRpcCall, clock }) => {
                  messenger.subscribe(
                    'NetworkController:rpcEndpointRequestRetried',
                    () => {
                      // Ensure that we advance to the next RPC request
                      // retry, not the next block tracker request.
                      // We also don't need to await this, it just needs to
                      // be added to the promise queue.
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      clock.tickAsync(backoffDuration);
                    },
                  );

                  for (let i = 0; i < customNumRequestsToMake - 1; i++) {
                    await ignoreRejection(makeRpcCall(request));
                  }
                  return await makeRpcCall(request);
                },
              );

              expect(result).toBe('ok');
            },
          );
        },
      );
    });
  });
}
