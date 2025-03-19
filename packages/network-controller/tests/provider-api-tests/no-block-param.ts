import { ConstantBackoff } from '@metamask/controller-utils';

import type { ProviderType } from './helpers';
import {
  waitForPromiseToBeFulfilledAfterRunningAllTimers,
  withMockedCommunications,
  withNetworkClient,
} from './helpers';
import { ignoreRejection } from '../../../../tests/helpers';
import { buildRootMessenger } from '../helpers';

type TestsForRpcMethodAssumingNoBlockParamOptions = {
  providerType: ProviderType;
  numberOfParameters: number;
};

/**
 * Defines tests which exercise the behavior exhibited by an RPC method which is
 * assumed to not take a block parameter. Even if it does, the value of this
 * parameter will not be used in determining how to cache the method.
 *
 * @param method - The name of the RPC method under test.
 * @param additionalArgs - Additional arguments.
 * @param additionalArgs.numberOfParameters - The number of parameters
 * supported by the method under test.
 * @param additionalArgs.providerType - The type of provider being tested;
 * either `infura` or `custom`.
 */
export function testsForRpcMethodAssumingNoBlockParam(
  method: string,
  {
    numberOfParameters,
    providerType,
  }: TestsForRpcMethodAssumingNoBlockParamOptions,
) {
  it('does not hit the RPC endpoint more than once for identical requests', async () => {
    const requests = [{ method }, { method }];
    const mockResults = ['first result', 'second result'];

    await withMockedCommunications({ providerType }, async (comms) => {
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request: requests[0],
        response: { result: mockResults[0] },
      });

      const results = await withNetworkClient(
        { providerType },
        ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
      );

      expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
    });
  });

  for (const paramIndex of [...Array(numberOfParameters).keys()]) {
    it(`does not reuse the result of a previous request if parameter at index "${paramIndex}" differs`, async () => {
      const firstMockParams = [
        ...new Array(numberOfParameters).fill('some value'),
      ];
      const secondMockParams = firstMockParams.slice();
      secondMockParams[paramIndex] = 'another value';
      const requests = [
        {
          method,
          params: firstMockParams,
        },
        { method, params: secondMockParams },
      ];
      const mockResults = ['some result', 'another result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: requests[0],
          response: { result: mockResults[0] },
        });
        comms.mockRpcCall({
          request: requests[1],
          response: { result: mockResults[1] },
        });

        const results = await withNetworkClient(
          { providerType },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual([mockResults[0], mockResults[1]]);
      });
    });
  }

  it('hits the RPC endpoint and does not reuse the result of a previous request if the latest block number was updated since', async () => {
    const requests = [{ method }, { method }];
    const mockResults = ['first result', 'second result'];

    await withMockedCommunications({ providerType }, async (comms) => {
      // Note that we have to mock these requests in a specific order. The
      // first block tracker request occurs because of the first RPC request.
      // The second block tracker request, however, does not occur because of
      // the second RPC request, but rather because we call `clock.runAll()`
      // below.
      comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
      comms.mockRpcCall({
        request: requests[0],
        response: { result: mockResults[0] },
      });
      comms.mockNextBlockTrackerRequest({ blockNumber: '0x2' });
      comms.mockRpcCall({
        request: requests[1],
        response: { result: mockResults[1] },
      });

      const results = await withNetworkClient(
        { providerType },
        async (client) => {
          const firstResult = await client.makeRpcCall(requests[0]);
          // Proceed to the next iteration of the block tracker so that a new
          // block is fetched and the current block is updated.
          client.clock.runAll();
          const secondResult = await client.makeRpcCall(requests[1]);
          return [firstResult, secondResult];
        },
      );

      expect(results).toStrictEqual(mockResults);
    });
  });

  for (const emptyValue of [null, undefined, '\u003cnil\u003e']) {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    it(`does not retry an empty response of "${emptyValue}"`, async () => {
      const request = { method };
      const mockResult = emptyValue;

      await withMockedCommunications({ providerType }, async (comms) => {
        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request,
          response: { result: mockResult },
        });

        const result = await withNetworkClient(
          { providerType },
          ({ makeRpcCall }) => makeRpcCall(request),
        );

        expect(result).toStrictEqual(mockResult);
      });
    });

    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    it(`does not reuse the result of a previous request if it was "${emptyValue}"`, async () => {
      const requests = [{ method }, { method }];
      const mockResults = [emptyValue, 'some result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: requests[0],
          response: { result: mockResults[0] },
        });
        comms.mockRpcCall({
          request: requests[1],
          response: { result: mockResults[1] },
        });

        const results = await withNetworkClient(
          { providerType },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual(mockResults);
      });
    });
  }

  it('queues requests while a previous identical call is still pending, then runs the queue when it finishes, reusing the result from the first request', async () => {
    const requests = [{ method }, { method }, { method }];
    const mockResults = ['first result', 'second result', 'third result'];

    await withMockedCommunications({ providerType }, async (comms) => {
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request: requests[0],
        response: { result: mockResults[0] },
        delay: 100,
      });

      comms.mockRpcCall({
        request: requests[1],
        response: { result: mockResults[1] },
      });

      comms.mockRpcCall({
        request: requests[2],
        response: { result: mockResults[2] },
      });

      const results = await withNetworkClient(
        { providerType },
        async (client) => {
          const resultPromises = [
            client.makeRpcCall(requests[0]),
            client.makeRpcCall(requests[1]),
            client.makeRpcCall(requests[2]),
          ];
          const firstResult = await resultPromises[0];
          // The inflight cache middleware uses setTimeout to run the handlers,
          // so run them now
          client.clock.runAll();
          const remainingResults = await Promise.all(resultPromises.slice(1));
          return [firstResult, ...remainingResults];
        },
      );

      expect(results).toStrictEqual([
        mockResults[0],
        mockResults[0],
        mockResults[0],
      ]);
    });
  });

  describe.each([
    [405, 'The method does not exist / is not available.'],
    [429, 'Request is being rate limited.'],
  ])(
    'if the RPC endpoint returns a %d response',
    (httpStatus, errorMessage) => {
      it('throws a custom error', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = { method };

          // The first time a block-cacheable request is made, the latest block
          // number is retrieved through the block tracker first. It doesn't
          // matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request,
            response: {
              httpStatus,
            },
          });
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(errorMessage);
        });
      });

      it('fails over to the provided alternate RPC endpoint after 15 unsuccessful attempts', async () => {
        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block tracker
                // first. Note that to test that failovers work, all we
                // have to do is make this request fail.
                primaryComms.mockRpcCall({
                  request: {
                    method: 'eth_blockNumber',
                    params: [],
                  },
                  response: {
                    httpStatus,
                  },
                  times: 15,
                });
                failoverComms.mockNextBlockTrackerRequest();
                failoverComms.mockRpcCall({
                  request,
                  response: {
                    result: 'ok',
                  },
                });

                const result = await withNetworkClient(
                  {
                    providerType,
                    failoverRpcUrls: ['https://failover.endpoint'],
                  },
                  async ({ makeRpcCall, clock }) => {
                    // The block tracker will keep trying to poll until the
                    // eth_blockNumber request works, so we only have to make
                    // the request once.
                    return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                      makeRpcCall(request),
                      clock,
                    );
                  },
                );

                expect(result).toBe('ok');
              },
            );
          },
        );
      });

      it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  response: {
                    httpStatus,
                  },
                  times: 15,
                });
                failoverComms.mockRpcCall({
                  request,
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
                    failoverRpcUrls: ['https://failover.endpoint/'],
                    messenger,
                  },
                  async ({ makeRpcCall, chainId, rpcUrl }) => {
                    for (let i = 0; i < 14; i++) {
                      await ignoreRejection(makeRpcCall(request));
                    }
                    await makeRpcCall(request);

                    expect(
                      rpcEndpointUnavailableEventHandler,
                    ).toHaveBeenCalledWith({
                      chainId,
                      endpointUrl: rpcUrl,
                      failoverEndpointUrl: 'https://failover.endpoint/',
                      error: expect.objectContaining({
                        message: errorMessage,
                      }),
                    });
                  },
                );
              },
            );
          },
        );
      });

      it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint/',
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  response: {
                    httpStatus,
                  },
                  times: 15,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
                  response: {
                    httpStatus,
                  },
                  times: 15,
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
                    failoverRpcUrls: ['https://failover.endpoint/'],
                    messenger,
                  },
                  async ({ makeRpcCall, chainId }) => {
                    for (let i = 0; i < 14; i++) {
                      await ignoreRejection(makeRpcCall(request));
                    }
                    for (let i = 0; i < 15; i++) {
                      await ignoreRejection(makeRpcCall(request));
                    }

                    expect(
                      rpcEndpointUnavailableEventHandler,
                    ).toHaveBeenNthCalledWith(2, {
                      chainId,
                      endpointUrl: 'https://failover.endpoint/',
                      error: expect.objectContaining({
                        message: errorMessage,
                      }),
                    });
                  },
                );
              },
            );
          },
        );
      });

      it('allows RPC service options to be customized', async () => {
        const backoffDuration = 100;

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
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  response: {
                    httpStatus,
                  },
                  times: 6,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
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
                          maxRetries: 2,
                          maxConsecutiveFailures: 6,
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

                    for (let i = 0; i < 5; i++) {
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
    },
  );

  describe('if the RPC endpoint returns a response that is not 405, 429, 503, or 504', () => {
    const httpStatus = 500;
    const errorMessage = `Non-200 status code: '${httpStatus}'`;

    it('throws a generic, undescriptive error', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = { method };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request,
          response: {
            httpStatus,
          },
        });
        const promiseForResult = withNetworkClient(
          { providerType },
          async ({ makeRpcCall }) => makeRpcCall(request),
        );

        await expect(promiseForResult).rejects.toThrow(errorMessage);
      });
    });

    it('fails over to the provided alternate RPC endpoint after 15 unsuccessful attempts', async () => {
      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block tracker
            // first. Note that to test that failovers work, all we
            // have to do is make this request fail.
            primaryComms.mockRpcCall({
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                httpStatus,
              },
              times: 15,
            });
            failoverComms.mockNextBlockTrackerRequest();
            failoverComms.mockRpcCall({
              request,
              response: {
                result: 'ok',
              },
            });

            const result = await withNetworkClient(
              {
                providerType,
                failoverRpcUrls: ['https://failover.endpoint'],
              },
              async ({ makeRpcCall, clock }) => {
                // The block tracker will keep trying to poll until the
                // eth_blockNumber request works, so we only have to make
                // the request once.
                return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                  makeRpcCall(request),
                  clock,
                );
              },
            );

            expect(result).toBe('ok');
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              response: {
                httpStatus,
              },
              times: 15,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request,
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
                failoverRpcUrls: ['https://failover.endpoint/'],
                messenger,
              },
              async ({ makeRpcCall, chainId, rpcUrl }) => {
                for (let i = 0; i < 14; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }
                await makeRpcCall(request);

                expect(rpcEndpointUnavailableEventHandler).toHaveBeenCalledWith(
                  {
                    chainId,
                    endpointUrl: rpcUrl,
                    failoverEndpointUrl: 'https://failover.endpoint/',
                    error: expect.objectContaining({
                      message: errorMessage,
                    }),
                  },
                );
              },
            );
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              response: {
                httpStatus,
              },
              times: 15,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request,
              response: {
                httpStatus,
              },
              times: 15,
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
                failoverRpcUrls: ['https://failover.endpoint/'],
                messenger,
              },
              async ({ makeRpcCall, chainId }) => {
                for (let i = 0; i < 14; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }
                for (let i = 0; i < 15; i++) {
                  await ignoreRejection(makeRpcCall(request));
                }

                expect(
                  rpcEndpointUnavailableEventHandler,
                ).toHaveBeenNthCalledWith(2, {
                  chainId,
                  endpointUrl: 'https://failover.endpoint/',
                  error: expect.objectContaining({
                    message: errorMessage,
                  }),
                });
              },
            );
          },
        );
      });
    });

    it('allows RPC service options to be customized', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
            expectedHeaders: {
              'X-Foo': 'Bar',
            },
          },
          async (failoverComms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              response: {
                httpStatus,
              },
              times: 6,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request,
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
                      maxRetries: 2,
                      maxConsecutiveFailures: 6,
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

                for (let i = 0; i < 5; i++) {
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
  });

  describe.each([503, 504])(
    'if the RPC endpoint returns a %d response',
    (httpStatus) => {
      const errorMessage = 'Gateway timeout';

      it('retries the request up to 5 times until there is a 200 response', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = { method };

          // The first time a block-cacheable request is made, the latest block
          // number is retrieved through the block tracker first. It doesn't
          // matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then succeed
          // on the 5th try.
          comms.mockRpcCall({
            request,
            response: {
              error: 'Some error',
              httpStatus,
            },
            times: 4,
          });
          comms.mockRpcCall({
            request,
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });
          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toBe('the result');
        });
      });

      it(`throws a custom error if the response continues to be ${httpStatus} after 5 retries`, async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = { method };

          // The first time a block-cacheable request is made, the latest block
          // number is retrieved through the block tracker first. It doesn't
          // matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request,
            response: {
              error: 'Some error',
              httpStatus,
            },
            times: 5,
          });
          comms.mockNextBlockTrackerRequest();
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );
          await expect(promiseForResult).rejects.toThrow(errorMessage);
        });
      });

      it('fails over to the provided alternate RPC endpoint after 15 unsuccessful attempts', async () => {
        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block tracker
                // first. Note that to test that failovers work, all we
                // have to do is make this request fail.
                primaryComms.mockRpcCall({
                  request: {
                    method: 'eth_blockNumber',
                    params: [],
                  },
                  response: {
                    error: 'Some error',
                    httpStatus,
                  },
                  times: 15,
                });
                failoverComms.mockNextBlockTrackerRequest();
                failoverComms.mockRpcCall({
                  request,
                  response: {
                    result: 'ok',
                  },
                });

                const result = await withNetworkClient(
                  {
                    providerType,
                    failoverRpcUrls: ['https://failover.endpoint'],
                  },
                  async ({ makeRpcCall, clock }) => {
                    // The block tracker will keep trying to poll until the
                    // eth_blockNumber request works, so we only have to make
                    // the request once.
                    return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                      makeRpcCall(request),
                      clock,
                    );
                  },
                );

                expect(result).toBe('ok');
              },
            );
          },
        );
      });

      it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
        const backoffDuration = 100;

        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  response: {
                    error: 'Some error',
                    httpStatus,
                  },
                  times: 15,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
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
                    failoverRpcUrls: ['https://failover.endpoint/'],
                    messenger,
                    getRpcServiceOptions: () => ({
                      fetch,
                      btoa,
                      policyOptions: {
                        backoff: new ConstantBackoff(backoffDuration),
                      },
                    }),
                  },
                  async ({ makeRpcCall, chainId, clock, rpcUrl }) => {
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

                    await ignoreRejection(makeRpcCall(request));
                    await ignoreRejection(makeRpcCall(request));
                    await makeRpcCall(request);

                    expect(
                      rpcEndpointUnavailableEventHandler,
                    ).toHaveBeenCalledWith({
                      chainId,
                      endpointUrl: rpcUrl,
                      failoverEndpointUrl: 'https://failover.endpoint/',
                      error: expect.objectContaining({
                        message: expect.stringContaining(errorMessage),
                      }),
                    });
                  },
                );
              },
            );
          },
        );
      });

      it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
        const backoffDuration = 100;

        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  response: {
                    error: 'Some error',
                    httpStatus,
                  },
                  times: 15,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
                  response: {
                    error: 'Some error',
                    httpStatus,
                  },
                  times: 15,
                });
                // Block tracker requests on the primary will fail over
                failoverComms.mockNextBlockTrackerRequest();

                const messenger = buildRootMessenger();
                const rpcEndpointUnavailableEventHandler = jest.fn();
                messenger.subscribe(
                  'NetworkController:rpcEndpointUnavailable',
                  rpcEndpointUnavailableEventHandler,
                );

                await withNetworkClient(
                  {
                    providerType,
                    failoverRpcUrls: ['https://failover.endpoint/'],
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

                    // Exceed max retries on primary
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on primary again
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on primary for final time, fail over
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on failover
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on failover
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on failover for final time
                    await ignoreRejection(makeRpcCall(request));

                    expect(
                      rpcEndpointUnavailableEventHandler,
                    ).toHaveBeenNthCalledWith(2, {
                      chainId,
                      endpointUrl: 'https://failover.endpoint/',
                      error: expect.objectContaining({
                        message: expect.stringContaining(errorMessage),
                      }),
                    });
                  },
                );
              },
            );
          },
        );
      });

      it('allows RPC service options to be customized', async () => {
        const backoffDuration = 100;

        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
                expectedHeaders: {
                  'X-Foo': 'Bar',
                },
              },
              async (failoverComms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  response: {
                    error: 'Some error',
                    httpStatus,
                  },
                  times: 6,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
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
                          maxRetries: 2,
                          maxConsecutiveFailures: 6,
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

                    // There are a total of 3 attempts (2 retries),
                    // and we call this 2 times for a total of 6 failures
                    await ignoreRejection(makeRpcCall(request));
                    return await makeRpcCall(request);
                  },
                );

                expect(result).toBe('ok');
              },
            );
          },
        );
      });
    },
  );

  describe.each(['ETIMEDOUT', 'ECONNRESET'])(
    'if a %s error is thrown while making the request',
    (errorCode) => {
      it('retries the request up to 5 times until it is successful', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = { method };
          const error = new Error(errorCode);
          // @ts-expect-error `code` does not exist on the Error type, but is
          // still used by Node.
          error.code = errorCode;

          // The first time a block-cacheable request is made, the latest block
          // number is retrieved through the block tracker first. It doesn't
          // matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then succeed
          // on the 5th try.
          comms.mockRpcCall({
            request,
            error,
            times: 4,
          });
          comms.mockRpcCall({
            request,
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });

          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toBe('the result');
        });
      });

      it('re-throws the error if it persists after 5 retries', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = { method };
          const error = new Error(errorCode);
          // @ts-expect-error `code` does not exist on the Error type, but is
          // still used by Node.
          error.code = errorCode;

          // The first time a block-cacheable request is made, the latest block
          // number is retrieved through the block tracker first. It doesn't
          // matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request,
            error,
            times: 5,
          });
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          await expect(promiseForResult).rejects.toThrow(error.message);
        });
      });

      it('fails over to the provided alternate RPC endpoint after 15 unsuccessful attempts', async () => {
        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };
                const error = new Error(errorCode);
                // @ts-expect-error `code` does not exist on the Error type, but is
                // still used by Node.
                error.code = errorCode;

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block tracker
                // first. Note that to test that failovers work, all we
                // have to do is make this request fail.
                primaryComms.mockRpcCall({
                  request: {
                    method: 'eth_blockNumber',
                    params: [],
                  },
                  error,
                  times: 15,
                });
                failoverComms.mockNextBlockTrackerRequest();
                failoverComms.mockRpcCall({
                  request,
                  response: {
                    result: 'ok',
                  },
                });

                const result = await withNetworkClient(
                  {
                    providerType,
                    failoverRpcUrls: ['https://failover.endpoint'],
                  },
                  async ({ makeRpcCall, clock }) => {
                    // The block tracker will keep trying to poll until the
                    // eth_blockNumber request works, so we only have to make
                    // the request once.
                    return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                      makeRpcCall(request),
                      clock,
                    );
                  },
                );

                expect(result).toBe('ok');
              },
            );
          },
        );
      });

      it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
        const backoffDuration = 100;

        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };
                const error = new Error(errorCode);
                // @ts-expect-error `code` does not exist on the Error type, but is
                // still used by Node.
                error.code = errorCode;

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  error,
                  times: 15,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
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
                    failoverRpcUrls: ['https://failover.endpoint/'],
                    messenger,
                    getRpcServiceOptions: () => ({
                      fetch,
                      btoa,
                      policyOptions: {
                        backoff: new ConstantBackoff(backoffDuration),
                      },
                    }),
                  },
                  async ({ makeRpcCall, chainId, clock, rpcUrl }) => {
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

                    await ignoreRejection(makeRpcCall(request));
                    await ignoreRejection(makeRpcCall(request));
                    await makeRpcCall(request);

                    expect(
                      rpcEndpointUnavailableEventHandler,
                    ).toHaveBeenCalledWith({
                      chainId,
                      endpointUrl: rpcUrl,
                      failoverEndpointUrl: 'https://failover.endpoint/',
                      error: expect.objectContaining({
                        message: `request to ${rpcUrl} failed, reason: ${errorCode}`,
                      }),
                    });
                  },
                );
              },
            );
          },
        );
      });

      it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
        const backoffDuration = 100;

        await withMockedCommunications(
          { providerType },
          async (primaryComms) => {
            await withMockedCommunications(
              {
                providerType: 'custom',
                customRpcUrl: 'https://failover.endpoint',
              },
              async (failoverComms) => {
                const request = { method };
                const error = new Error(errorCode);
                // @ts-expect-error `code` does not exist on the Error type, but is
                // still used by Node.
                error.code = errorCode;

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  error,
                  times: 15,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
                  error,
                  times: 15,
                });
                // Block tracker requests on the primary will fail over
                failoverComms.mockNextBlockTrackerRequest();

                const messenger = buildRootMessenger();
                const rpcEndpointUnavailableEventHandler = jest.fn();
                messenger.subscribe(
                  'NetworkController:rpcEndpointUnavailable',
                  rpcEndpointUnavailableEventHandler,
                );

                await withNetworkClient(
                  {
                    providerType,
                    failoverRpcUrls: ['https://failover.endpoint/'],
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

                    // Exceed max retries on primary
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on primary again
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on primary for final time, fail over
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on failover
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on failover
                    await ignoreRejection(makeRpcCall(request));
                    // Exceed max retries on failover for final time
                    await ignoreRejection(makeRpcCall(request));

                    expect(
                      rpcEndpointUnavailableEventHandler,
                    ).toHaveBeenNthCalledWith(2, {
                      chainId,
                      endpointUrl: 'https://failover.endpoint/',
                      error: expect.objectContaining({
                        message: `request to https://failover.endpoint/ failed, reason: ${errorCode}`,
                      }),
                    });
                  },
                );
              },
            );
          },
        );
      });

      it('allows RPC service options to be customized', async () => {
        const backoffDuration = 100;

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
              },
              async (failoverComms) => {
                const request = { method };
                const error = new Error(errorCode);
                // @ts-expect-error `code` does not exist on the Error type, but is
                // still used by Node.
                error.code = errorCode;

                // The first time a block-cacheable request is made, the
                // latest block number is retrieved through the block
                // tracker first.
                primaryComms.mockNextBlockTrackerRequest();
                primaryComms.mockRpcCall({
                  request,
                  error,
                  times: 6,
                });
                // The block-ref middleware will make the request as
                // specified except that the block param is replaced with
                // the latest block number.
                failoverComms.mockRpcCall({
                  request,
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
                          maxRetries: 2,
                          maxConsecutiveFailures: 6,
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

                    // There are a total of 3 attempts (2 retries),
                    // and we call this 2 times for a total of 6 failures
                    await ignoreRejection(makeRpcCall(request));
                    return await makeRpcCall(request);
                  },
                );

                expect(result).toBe('ok');
              },
            );
          },
        );
      });
    },
  );

  describe('if the RPC endpoint responds with invalid JSON', () => {
    const errorMessage = 'not valid JSON';

    it('retries the request up to 5 times until it responds with valid JSON', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = { method };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        // Here we have the request fail for the first 4 tries, then succeed
        // on the 5th try.
        comms.mockRpcCall({
          request,
          response: {
            body: 'invalid JSON',
          },
          times: 4,
        });
        comms.mockRpcCall({
          request,
          response: {
            result: 'the result',
            httpStatus: 200,
          },
        });

        const result = await withNetworkClient(
          { providerType },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );

        expect(result).toBe('the result');
      });
    });

    it('throws a custom error if the result is still non-JSON-parseable after 5 retries', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = { method };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request,
          response: {
            body: 'invalid JSON',
          },
          times: 5,
        });
        const promiseForResult = withNetworkClient(
          { providerType },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );

        await expect(promiseForResult).rejects.toThrow(errorMessage);
      });
    });

    it('fails over to the provided alternate RPC endpoint after 15 unsuccessful attempts', async () => {
      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block tracker
            // first. Note that to test that failovers work, all we
            // have to do is make this request fail.
            primaryComms.mockRpcCall({
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              response: {
                body: 'invalid JSON',
              },
              times: 15,
            });
            failoverComms.mockNextBlockTrackerRequest();
            failoverComms.mockRpcCall({
              request,
              response: {
                result: 'ok',
              },
            });

            const result = await withNetworkClient(
              {
                providerType,
                failoverRpcUrls: ['https://failover.endpoint'],
              },
              async ({ makeRpcCall, clock }) => {
                // The block tracker will keep trying to poll until the
                // eth_blockNumber request works, so we only have to make
                // the request once.
                return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                  makeRpcCall(request),
                  clock,
                );
              },
            );

            expect(result).toBe('ok');
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };
            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              response: {
                body: 'invalid JSON',
              },
              times: 15,
            });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest
            // block number.
            failoverComms.mockRpcCall({
              request,
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
              async ({ makeRpcCall, chainId, clock, rpcUrl }) => {
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

                await ignoreRejection(makeRpcCall(request));
                await ignoreRejection(makeRpcCall(request));
                await makeRpcCall(request);

                expect(rpcEndpointUnavailableEventHandler).toHaveBeenCalledWith(
                  {
                    chainId,
                    endpointUrl: rpcUrl,
                    failoverEndpointUrl: 'https://failover.endpoint/',
                    error: expect.objectContaining({
                      message: expect.stringContaining(errorMessage),
                    }),
                  },
                );
              },
            );
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };
            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              response: {
                body: 'invalid JSON',
              },
              times: 15,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request,
              response: {
                body: 'invalid JSON',
              },
              times: 15,
            });
            // Block tracker requests on the primary will fail over
            failoverComms.mockNextBlockTrackerRequest();

            const messenger = buildRootMessenger();
            const rpcEndpointUnavailableEventHandler = jest.fn();
            messenger.subscribe(
              'NetworkController:rpcEndpointUnavailable',
              rpcEndpointUnavailableEventHandler,
            );

            await withNetworkClient(
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

                // Exceed max retries on primary
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on primary again
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on primary for final time, fail over
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on failover
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on failover
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on failover for final time
                await ignoreRejection(makeRpcCall(request));

                expect(
                  rpcEndpointUnavailableEventHandler,
                ).toHaveBeenNthCalledWith(2, {
                  chainId,
                  endpointUrl: 'https://failover.endpoint/',
                  error: expect.objectContaining({
                    message: expect.stringContaining(errorMessage),
                  }),
                });
              },
            );
          },
        );
      });
    });

    it('allows RPC service options to be customized', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
            expectedHeaders: {
              'X-Foo': 'Bar',
            },
          },
          async (failoverComms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              response: {
                body: 'invalid JSON',
              },
              times: 6,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request,
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
                      maxRetries: 2,
                      maxConsecutiveFailures: 6,
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

                // There are a total of 3 attempts (2 retries),
                // and we call this 2 times for a total of 6 failures
                await ignoreRejection(makeRpcCall(request));
                return await makeRpcCall(request);
              },
            );

            expect(result).toBe('ok');
          },
        );
      });
    });
  });

  describe('if making the request throws a connection error', () => {
    it('retries the request up to 5 times until there is no connection error', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = { method };
        const error = new TypeError('Failed to fetch');

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        // Here we have the request fail for the first 4 tries, then succeed
        // on the 5th try.
        comms.mockRpcCall({
          request,
          error,
          times: 4,
        });
        comms.mockRpcCall({
          request,
          response: {
            result: 'the result',
            httpStatus: 200,
          },
        });

        const result = await withNetworkClient(
          { providerType },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );

        expect(result).toBe('the result');
      });
    });

    it('re-throws the error if it persists after 5 retries', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = { method };
        const error = new TypeError('Failed to fetch');

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request,
          error,
          times: 5,
        });
        const promiseForResult = withNetworkClient(
          { providerType },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );

        await expect(promiseForResult).rejects.toThrow(error.message);
      });
    });

    it('fails over to the provided alternate RPC endpoint after 15 unsuccessful attempts', async () => {
      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };
            const error = new TypeError('Failed to fetch');

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block tracker
            // first. Note that to test that failovers work, all we
            // have to do is make this request fail.
            primaryComms.mockRpcCall({
              request: {
                method: 'eth_blockNumber',
                params: [],
              },
              error,
              times: 15,
            });
            failoverComms.mockNextBlockTrackerRequest();
            failoverComms.mockRpcCall({
              request,
              response: {
                result: 'ok',
              },
            });

            const result = await withNetworkClient(
              {
                providerType,
                failoverRpcUrls: ['https://failover.endpoint'],
              },
              async ({ makeRpcCall, clock }) => {
                // The block tracker will keep trying to poll until the
                // eth_blockNumber request works, so we only have to make
                // the request once.
                return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                  makeRpcCall(request),
                  clock,
                );
              },
            );

            expect(result).toBe('ok');
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover occurs', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };
            const error = new TypeError('Failed to fetch');

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              error,
              times: 15,
            });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest
            // block number.
            failoverComms.mockRpcCall({
              request,
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
                failoverRpcUrls: ['https://failover.endpoint/'],
                messenger,
                getRpcServiceOptions: () => ({
                  fetch,
                  btoa,
                  policyOptions: {
                    backoff: new ConstantBackoff(backoffDuration),
                  },
                }),
              },
              async ({ makeRpcCall, chainId, clock, rpcUrl }) => {
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

                await ignoreRejection(makeRpcCall(request));
                await ignoreRejection(makeRpcCall(request));
                await makeRpcCall(request);

                expect(rpcEndpointUnavailableEventHandler).toHaveBeenCalledWith(
                  {
                    chainId,
                    endpointUrl: rpcUrl,
                    failoverEndpointUrl: 'https://failover.endpoint/',
                    error: expect.objectContaining({
                      message: `request to ${rpcUrl} failed, reason: Failed to fetch`,
                    }),
                  },
                );
              },
            );
          },
        );
      });
    });

    it('publishes the NetworkController:rpcEndpointUnavailable event when the failover becomes unavailable', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
          },
          async (failoverComms) => {
            const request = { method };
            const error = new TypeError('Failed to fetch');

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              error,
              times: 15,
            });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest
            // block number.
            failoverComms.mockRpcCall({
              request,
              error,
              times: 15,
            });
            // Block tracker requests on the primary will fail over
            failoverComms.mockNextBlockTrackerRequest();

            const messenger = buildRootMessenger();
            const rpcEndpointUnavailableEventHandler = jest.fn();
            messenger.subscribe(
              'NetworkController:rpcEndpointUnavailable',
              rpcEndpointUnavailableEventHandler,
            );

            await withNetworkClient(
              {
                providerType,
                failoverRpcUrls: ['https://failover.endpoint/'],
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

                // Exceed max retries on primary
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on primary again
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on primary for final time, fail over
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on failover
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on failover
                await ignoreRejection(makeRpcCall(request));
                // Exceed max retries on failover for final time
                await ignoreRejection(makeRpcCall(request));

                expect(
                  rpcEndpointUnavailableEventHandler,
                ).toHaveBeenNthCalledWith(2, {
                  chainId,
                  endpointUrl: 'https://failover.endpoint/',
                  error: expect.objectContaining({
                    message: `request to https://failover.endpoint/ failed, reason: Failed to fetch`,
                  }),
                });
              },
            );
          },
        );
      });
    });

    it('allows RPC service options to be customized', async () => {
      const backoffDuration = 100;

      await withMockedCommunications({ providerType }, async (primaryComms) => {
        await withMockedCommunications(
          {
            providerType: 'custom',
            customRpcUrl: 'https://failover.endpoint',
            expectedHeaders: {
              'X-Foo': 'Bar',
            },
          },
          async (failoverComms) => {
            const request = { method };
            const error = new TypeError('Failed to fetch');

            // The first time a block-cacheable request is made, the
            // latest block number is retrieved through the block
            // tracker first.
            primaryComms.mockNextBlockTrackerRequest();
            primaryComms.mockRpcCall({
              request,
              error,
              times: 6,
            });
            // The block-ref middleware will make the request as
            // specified except that the block param is replaced with
            // the latest block number.
            failoverComms.mockRpcCall({
              request,
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
                      maxRetries: 2,
                      maxConsecutiveFailures: 6,
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

                // There are a total of 3 attempts (2 retries),
                // and we call this 2 times for a total of 6 failures
                await ignoreRejection(makeRpcCall(request));
                return await makeRpcCall(request);
              },
            );

            expect(result).toBe('ok');
          },
        );
      });
    });
  });
}
