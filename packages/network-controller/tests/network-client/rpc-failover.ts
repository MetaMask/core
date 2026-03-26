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
 * @param args.getExpectedBreakError - Factory returning the expected error
 * upon circuit break. Defaults to using `getExpectedError`.
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
  getExpectedBreakError?: (url: string) => Error | jest.Constructable;
}): void {
  const blockNumber = '0x100';
  const backoffDuration = 100;
  const maxConsecutiveFailures = 15;
  const maxRetries = 4;
  const numRequestsToMake = isRetriableFailure
    ? maxConsecutiveFailures / (maxRetries + 1)
    : maxConsecutiveFailures;

  describe('if RPC failover functionality is enabled', () => {
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
                isRpcFailoverEnabled: true,
                failoverRpcUrls: ['https://failover.endpoint'],
                messenger,
                getRpcServiceOptions: () => ({
                  fetch,
                  btoa,
                  isOffline: (): boolean => false,
                  policyOptions: {
                    backoff: new ConstantBackoff(backoffDuration),
                  },
                }),
              },
              async ({ makeRpcCall }) => {
                messenger.subscribe(
                  'NetworkController:rpcEndpointRetried',
                  () => {
                    // Ensure that we advance to the next RPC request
                    // retry, not the next block tracker request.
                    // We also don't need to await this, it just needs to
                    // be added to the promise queue.
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    jest.advanceTimersByTimeAsync(backoffDuration);
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

    it('allows RPC service options to be customized', async () => {
      const customMaxConsecutiveFailures = 6;
      const customMaxRetries = 2;
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
                  isRpcFailoverEnabled: true,
                  failoverRpcUrls: ['https://failover.endpoint'],
                  messenger,
                  getRpcServiceOptions: (rpcEndpointUrl) => {
                    const commonOptions = {
                      fetch,
                      btoa,
                      isOffline: (): boolean => false,
                    };
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
                async ({ makeRpcCall }) => {
                  messenger.subscribe(
                    'NetworkController:rpcEndpointRetried',
                    () => {
                      // Ensure that we advance to the next RPC request
                      // retry, not the next block tracker request.
                      // We also don't need to await this, it just needs to
                      // be added to the promise queue.
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      jest.advanceTimersByTimeAsync(backoffDuration);
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

  describe('if RPC failover functionality is not enabled', () => {
    it(`throws even after ${maxConsecutiveFailures} unsuccessful attempts`, async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = requestToCall;
        const requestToMock = getRequestToMock(request, blockNumber);
        const additionalMockRpcCallOptions =
          failure instanceof Error || typeof failure === 'string'
            ? { error: failure }
            : { response: failure };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first.
        comms.mockNextBlockTrackerRequest({ blockNumber });
        comms.mockRpcCall({
          request: requestToMock,
          times: maxConsecutiveFailures,
          ...additionalMockRpcCallOptions,
        });

        const messenger = buildRootMessenger();

        await withNetworkClient(
          {
            providerType,
            isRpcFailoverEnabled: false,
            failoverRpcUrls: ['https://failover.endpoint'],
            messenger,
            getRpcServiceOptions: () => ({
              fetch,
              btoa,
              isOffline: (): boolean => false,
              policyOptions: {
                backoff: new ConstantBackoff(backoffDuration),
              },
            }),
          },
          async ({ makeRpcCall, rpcUrl }) => {
            messenger.subscribe('NetworkController:rpcEndpointRetried', () => {
              // Ensure that we advance to the next RPC request
              // retry, not the next block tracker request.
              // We also don't need to await this, it just needs to
              // be added to the promise queue.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.advanceTimersByTimeAsync(backoffDuration);
            });

            for (let i = 0; i < numRequestsToMake - 1; i++) {
              await ignoreRejection(makeRpcCall(request));
            }
            const promiseForResult = makeRpcCall(request);

            await expect(promiseForResult).rejects.toThrow(
              getExpectedError(rpcUrl),
            );
          },
        );
      });
    });
  });
}
