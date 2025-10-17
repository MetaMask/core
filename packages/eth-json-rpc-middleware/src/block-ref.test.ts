import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { providerFromEngine } from '@metamask/eth-json-rpc-provider';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';

import { createBlockRefMiddleware } from '.';
import {
  buildMockParamsWithBlockParamAt,
  stubProviderRequests,
  buildStubForBlockNumberRequest,
  buildStubForGenericRequest,
  buildFinalMiddlewareWithDefaultResult,
  buildMockParamsWithoutBlockParamAt,
  expectProviderRequestNotToHaveBeenMade,
} from '../test/util/helpers';

/**
 * Objects used in each test.
 */
type Setup = {
  /**
   * The engine that holds the middleware stack, including the
   * one being tested.
   */
  engine: JsonRpcEngine;
  /**
   * provider - The provider that is used to make requests against
   * (which the middleware being tested will react to).
   */
  provider: SafeEventEmitterProvider;
  /**
   * The block tracker which is used inside of the
   * middleware being tested.
   */
  blockTracker: PollingBlockTracker;
};

/**
 * Options supported by `withTestSetup`.
 */
type WithTestSetupOptions = {
  /**
   * A function which determines which middleware
   * should be added to the engine.
   */
  configureMiddleware: (setup: Setup) => {
    middlewareUnderTest: JsonRpcMiddleware<any, any>;
    otherMiddleware?: JsonRpcMiddleware<any, any>[];
  };
};

/**
 * The function that `withTestSetup` is expected to take and will call once the
 * setup objects are created.
 *
 * @template T - The type that the function will return, minus the promise
 * wrapper.
 */
type WithTestSetupCallback<T> = (setup: Setup) => Promise<T>;

describe('createBlockRefMiddleware', () => {
  // This list corresponds to the list in the `blockTagParamIndex` function
  // within `src/utils/cache.ts`
  (
    [
      { blockParamIndex: 0, methods: ['eth_getBlockByNumber'] },
      {
        blockParamIndex: 1,
        methods: [
          'eth_getBalance',
          'eth_getCode',
          'eth_getTransactionCount',
          'eth_call',
        ],
      },
      { blockParamIndex: 2, methods: ['eth_getStorageAt'] },
    ] as const
  ).forEach(({ blockParamIndex, methods }) => {
    methods.forEach((method: string) => {
      describe(`when the RPC method is ${method}`, () => {
        describe('if the block param is "latest"', () => {
          it('makes a direct request through the provider, replacing the block param with the latest block number', async () => {
            await withTestSetup(
              {
                configureMiddleware: ({ provider, blockTracker }) => {
                  return {
                    middlewareUnderTest: createBlockRefMiddleware({
                      provider,
                      blockTracker,
                    }),
                  };
                },
              },
              async ({ engine, provider }) => {
                const request = {
                  id: 1,
                  jsonrpc: '2.0' as const,
                  method,
                  params: buildMockParamsWithBlockParamAt(
                    blockParamIndex,
                    'latest',
                  ),
                };
                stubProviderRequests(provider, [
                  buildStubForBlockNumberRequest('0x100'),
                  buildStubForGenericRequest({
                    request: {
                      ...request,
                      params: buildMockParamsWithBlockParamAt(
                        blockParamIndex,
                        '0x100',
                      ),
                    },
                    result: async () => 'something',
                  }),
                ]);

                const response = await engine.handle(request);

                expect(response).toStrictEqual({
                  id: 1,
                  jsonrpc: '2.0',
                  result: 'something',
                });
              },
            );
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

            await withTestSetup(
              {
                configureMiddleware: ({ provider, blockTracker }) => {
                  return {
                    middlewareUnderTest: createBlockRefMiddleware({
                      provider,
                      blockTracker,
                    }),
                    otherMiddleware: [finalMiddleware],
                  };
                },
              },
              async ({ engine, provider }) => {
                const request = {
                  id: 1,
                  jsonrpc: '2.0' as const,
                  method,
                  params: buildMockParamsWithBlockParamAt(
                    blockParamIndex,
                    'latest',
                  ),
                };
                stubProviderRequests(provider, [
                  buildStubForBlockNumberRequest('0x100'),
                  buildStubForGenericRequest({
                    request: {
                      ...request,
                      params: buildMockParamsWithBlockParamAt(
                        blockParamIndex,
                        '0x100',
                      ),
                    },
                    result: async () => 'something',
                  }),
                ]);

                await engine.handle(request);

                expect(finalMiddleware).not.toHaveBeenCalled();
              },
            );
          });
        });

        describe('if no block param is provided', () => {
          it('makes a direct request through the provider, replacing the block param with the latest block number', async () => {
            await withTestSetup(
              {
                configureMiddleware: ({ provider, blockTracker }) => {
                  return {
                    middlewareUnderTest: createBlockRefMiddleware({
                      provider,
                      blockTracker,
                    }),
                  };
                },
              },
              async ({ engine, provider }) => {
                const request = {
                  jsonrpc: '2.0' as const,
                  id: 1,
                  method,
                  params: buildMockParamsWithoutBlockParamAt(blockParamIndex),
                };
                stubProviderRequests(provider, [
                  buildStubForBlockNumberRequest('0x100'),
                  buildStubForGenericRequest({
                    request: {
                      ...request,
                      params: buildMockParamsWithBlockParamAt(
                        blockParamIndex,
                        '0x100',
                      ),
                    },
                    result: async () => 'something',
                  }),
                ]);

                const response = await engine.handle(request);

                expect(response).toStrictEqual({
                  id: 1,
                  jsonrpc: '2.0',
                  result: 'something',
                });
              },
            );
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

            await withTestSetup(
              {
                configureMiddleware: ({ provider, blockTracker }) => {
                  return {
                    middlewareUnderTest: createBlockRefMiddleware({
                      provider,
                      blockTracker,
                    }),
                    otherMiddleware: [finalMiddleware],
                  };
                },
              },
              async ({ engine, provider }) => {
                const request = {
                  id: 1,
                  jsonrpc: '2.0' as const,
                  method,
                  params: buildMockParamsWithoutBlockParamAt(blockParamIndex),
                };
                stubProviderRequests(provider, [
                  buildStubForBlockNumberRequest('0x100'),
                  buildStubForGenericRequest({
                    request: {
                      ...request,
                      params: buildMockParamsWithBlockParamAt(
                        blockParamIndex,
                        '0x100',
                      ),
                    },
                    result: async () => 'something',
                  }),
                ]);

                await engine.handle(request);

                expect(finalMiddleware).not.toHaveBeenCalled();
              },
            );
          });
        });

        describe.each(['earliest', 'pending', '0x200'])(
          'if the block param is something other than "latest", like %o',
          (blockParam) => {
            it('does not make a direct request through the provider', async () => {
              const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

              await withTestSetup(
                {
                  configureMiddleware: ({ provider, blockTracker }) => {
                    return {
                      middlewareUnderTest: createBlockRefMiddleware({
                        provider,
                        blockTracker,
                      }),
                      otherMiddleware: [finalMiddleware],
                    };
                  },
                },
                async ({ engine, provider }) => {
                  const request = {
                    id: 1,
                    jsonrpc: '2.0' as const,
                    method,
                    params: buildMockParamsWithBlockParamAt(
                      blockParamIndex,
                      blockParam,
                    ),
                  };
                  const requestSpy = stubProviderRequests(provider, [
                    buildStubForBlockNumberRequest('0x100'),
                  ]);

                  await engine.handle(request);

                  expectProviderRequestNotToHaveBeenMade(requestSpy, request);
                },
              );
            });

            it('proceeds to the next middleware', async () => {
              const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

              await withTestSetup(
                {
                  configureMiddleware: ({ provider, blockTracker }) => {
                    return {
                      middlewareUnderTest: createBlockRefMiddleware({
                        provider,
                        blockTracker,
                      }),
                      otherMiddleware: [finalMiddleware],
                    };
                  },
                },
                async ({ engine, provider }) => {
                  stubProviderRequests(provider, [
                    buildStubForBlockNumberRequest('0x100'),
                  ]);

                  await engine.handle({
                    id: 1,
                    jsonrpc: '2.0' as const,
                    method,
                    params: buildMockParamsWithBlockParamAt(
                      blockParamIndex,
                      blockParam,
                    ),
                  });

                  expect(finalMiddleware).toHaveBeenCalledWith(
                    expect.objectContaining({
                      params: buildMockParamsWithBlockParamAt(
                        blockParamIndex,
                        blockParam,
                      ),
                    }),
                    expect.anything(),
                    expect.anything(),
                    expect.anything(),
                  );
                },
              );
            });
          },
        );
      });
    });
  });

  describe('when the RPC method does not take a block parameter', () => {
    it('does not make a direct request through the provider', async () => {
      const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

      await withTestSetup(
        {
          configureMiddleware: ({ provider, blockTracker }) => {
            return {
              middlewareUnderTest: createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
              otherMiddleware: [finalMiddleware],
            };
          },
        },
        async ({ engine, provider }) => {
          const request = {
            id: 1,
            jsonrpc: '2.0' as const,
            method: 'a_non_block_param_method',
            params: ['some value', '0x200'],
          };
          const requestSpy = stubProviderRequests(provider, [
            buildStubForBlockNumberRequest('0x100'),
          ]);

          await engine.handle(request);

          expectProviderRequestNotToHaveBeenMade(requestSpy, request);
        },
      );
    });

    it('proceeds to the next middleware', async () => {
      const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

      await withTestSetup(
        {
          configureMiddleware: ({ provider, blockTracker }) => {
            return {
              middlewareUnderTest: createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
              otherMiddleware: [finalMiddleware],
            };
          },
        },
        async ({ engine, provider }) => {
          stubProviderRequests(provider, [
            buildStubForBlockNumberRequest('0x100'),
          ]);

          await engine.handle({
            id: 1,
            jsonrpc: '2.0' as const,
            method: 'a_non_block_param_method',
            params: ['some value', '0x200'],
          });

          expect(finalMiddleware).toHaveBeenCalledWith(
            expect.objectContaining({
              params: ['some value', '0x200'],
            }),
            expect.anything(),
            expect.anything(),
            expect.anything(),
          );
        },
      );
    });
  });
});

/**
 * Calls the given function, which should represent a test of some kind, with
 * data that the test can use, namely, a JsonRpcEngine instance, a provider
 * object, and a block tracker.
 *
 * @template T - The type that the function will return, minus the promise
 * wrapper.
 * @param options - Options.
 * @param options.configureMiddleware - A function that is called to add the
 * middleware-under-test, along with any other necessary middleware, to the
 * engine.
 * @param callback - A function.
 * @returns Whatever the function returns.
 */
async function withTestSetup<T>(
  { configureMiddleware }: WithTestSetupOptions,
  callback?: WithTestSetupCallback<T>,
) {
  const engine = new JsonRpcEngine();
  const provider = providerFromEngine(engine);
  const blockTracker = new PollingBlockTracker({
    provider,
  });

  const {
    middlewareUnderTest,
    otherMiddleware = [buildFinalMiddlewareWithDefaultResult()],
  } = configureMiddleware({ engine, provider, blockTracker });

  for (const middleware of [middlewareUnderTest, ...otherMiddleware]) {
    engine.push(middleware);
  }

  if (callback === undefined) {
    return undefined;
  }
  return await callback({ engine, provider, blockTracker });
}
