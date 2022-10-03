import { inspect, isDeepStrictEqual } from 'util';
import { PollingBlockTracker, Provider } from 'eth-block-tracker';
import {
  JsonRpcEngine,
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcResponse,
} from 'json-rpc-engine';
import {
  SafeEventEmitterProvider,
  providerFromEngine,
  createBlockRefMiddleware,
} from '.';

/**
 * Objects used in each test.
 *
 * @property engine - The engine that holds the middleware stack, including the
 * one being tested.
 * @property provider - The provider that is used to make requests against
 * (which the middleware being tested will react to).
 * @property blockTracker - The block tracker which is used inside of the
 * middleware being tested.
 */
interface Setup {
  engine: JsonRpcEngine;
  provider: SafeEventEmitterProvider;
  blockTracker: PollingBlockTracker;
}

/**
 * Options supported by `withTestSetup`.
 *
 * @property configureMiddleware - A function which determines which middleware
 * should be added to the engine.
 */
interface WithTestSetupOptions {
  configureMiddleware: (setup: Setup) => {
    middlewareUnderTest: JsonRpcMiddleware<any, any>;
    otherMiddleware?: JsonRpcMiddleware<any, any>[];
  };
}

/**
 * The function that `withTestSetup` is expected to take and will call once the
 * setup objects are created.
 *
 * @template T - The type that the function will return, minus the promise
 * wrapper.
 */
type WithTestSetupCallback<T> = (setup: Setup) => Promise<T>;

/**
 * An object that can be used to assign a canned response to a request made via
 * `provider.sendAsync`.
 *
 * @template T - The type that represents the request params.
 * @template U - The type that represents the response result.
 * @property request - An object that represents a JsonRpcRequest. Keys such as
 * `id` or `jsonrpc` may be omitted if you don't care about them.
 * @property response - A function that returns a JsonRpcResponse for that
 * request. This function takes two arguments: the *real* request and a
 * `callNumber`, which is the number of times the request has been made
 * (counting the first request as 1). This latter argument be used to specify
 * different responses for different instances of the same request.
 * @property remainAfterUse - Usually, when a request is made via
 * `provider.sendAsync`, the ProviderRequestStub which matches that request is
 * removed from the list of stubs, so that if the same request comes through
 * again, there will be no matching stub and an error will be thrown. This
 * feature is useful for making sure that all requests have canned responses.
 */
interface ProviderRequestStub<T, U> {
  request: Partial<JsonRpcRequest<T>>;
  response: (
    request: JsonRpcRequest<T>,
    callNumber: number,
  ) => JsonRpcResponse<U>;
  remainAfterUse?: boolean;
}

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
                  jsonrpc: '2.0' as const,
                  id: 1,
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
                    response: (req) => ({
                      id: req.id,
                      jsonrpc: '2.0' as const,
                      result: 'something',
                    }),
                  }),
                ]);

                const response = await engine.handle(request);

                expect(response).toStrictEqual({
                  id: 1,
                  jsonrpc: '2.0',
                  result: 'something',
                  error: undefined,
                });
              },
            );
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = buildFinalMiddlewareWithDefaultResponse();

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
                  jsonrpc: '2.0' as const,
                  id: 1,
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
                    response: (req) => ({
                      id: req.id,
                      jsonrpc: '2.0' as const,
                      result: 'something',
                    }),
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
                    response: (req) => ({
                      id: req.id,
                      jsonrpc: '2.0' as const,
                      result: 'something',
                    }),
                  }),
                ]);

                const response = await engine.handle(request);

                expect(response).toStrictEqual({
                  id: 1,
                  jsonrpc: '2.0',
                  result: 'something',
                  error: undefined,
                });
              },
            );
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = buildFinalMiddlewareWithDefaultResponse();

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
                    response: (req) => ({
                      id: req.id,
                      jsonrpc: '2.0' as const,
                      result: 'something',
                    }),
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
            it('does not make a direct request through the provider, but proceeds to the next middleware', async () => {
              const finalMiddleware = buildFinalMiddlewareWithDefaultResponse();

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
                    jsonrpc: '2.0',
                    id: 1,
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
    it('does not make a direct request through the provider, but proceeds to the next middleware', async () => {
      const finalMiddleware = buildFinalMiddlewareWithDefaultResponse();

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
            jsonrpc: '2.0',
            id: 1,
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
  callback: WithTestSetupCallback<T>,
) {
  const engine = new JsonRpcEngine();
  const provider = providerFromEngine(engine);
  const blockTracker = new PollingBlockTracker({
    provider: provider as Provider,
  });

  const {
    middlewareUnderTest,
    otherMiddleware = [buildFinalMiddlewareWithDefaultResponse()],
  } = configureMiddleware({ engine, provider, blockTracker });

  for (const middleware of [middlewareUnderTest, ...otherMiddleware]) {
    engine.push(middleware);
  }

  return await callback({ engine, provider, blockTracker });
}

/**
 * Creates a middleware function that ends the request, but not before ensuring
 * that the response has been filled with a dummy response.
 *
 * @returns The created middleware, as a mock function.
 */
function buildFinalMiddlewareWithDefaultResponse<T, U>(): JsonRpcMiddleware<
  T,
  U | 'default response'
> {
  return jest.fn((req, res, _next, end) => {
    if (res.id === undefined) {
      res.id = req.id;
    }

    if (res.jsonrpc === undefined) {
      res.jsonrpc = '2.0';
    }

    if (res.result === undefined) {
      res.error = {
        code: -1,
        message:
          "It looks like your middleware called next(), but you didn't define a next middleware. Please provide `omitDefaultFinalMiddleware: true` as options to `withTestSetup` and push a final middleware onto the engine.",
      };
    }

    end();
  });
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function builds a `params` array for such an
 * endpoint with the given "block" param added at the end.
 *
 * @param index - The index within the `params` array to add the "block" param.
 * @param blockParam - The desired "block" param to add.
 * @returns The mock params.
 */
function buildMockParamsWithBlockParamAt(
  blockParamIndex: number,
  blockParam: string,
): string[] {
  const params = [];

  for (let i = 0; i < blockParamIndex; i++) {
    params.push('some value');
  }

  params.push(blockParam);
  return params;
}

/**
 * Some JSON-RPC endpoints take a "block" param (example: `eth_blockNumber`)
 * which can optionally be left out. Additionally, the endpoint may support some
 * number of arguments, although the "block" param will always be last, even if
 * it is optional. Given this, this function builds a mock `params` array for
 * such an endpoint, filling it with arbitrary values, but with the "block"
 * param missing.
 *
 * @param {number} index - The index within the `params` array where the "block"
 * param *would* appear.
 * @returns {string[]} The mock params.
 */
function buildMockParamsWithoutBlockParamAt(blockParamIndex: number): string[] {
  const params = [];

  for (let i = 0; i < blockParamIndex; i++) {
    params.push('some value');
  }

  return params;
}

/**
 * Builds a canned response for a `eth_blockNumber` request made to
 * `provider.sendAsync` such that the response will return the given block
 * number. Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param blockNumber - The block number (default: '0x0').
 * @returns The request/response pair.
 */
function buildStubForBlockNumberRequest(
  blockNumber = '0x0',
): ProviderRequestStub<undefined[], string> {
  return {
    request: {
      method: 'eth_blockNumber',
      params: [],
    },
    response: (req) => ({
      id: req.id,
      jsonrpc: '2.0',
      result: blockNumber,
    }),
  };
}

/**
 * Builds a canned response for a request made to `provider.sendAsync`. Intended
 * to be used in conjunction with `stubProviderRequests`. Although not strictly
 * necessary, it helps to assign a proper type to a request/response pair.
 *
 * @template T - The type that represents the request params.
 * @template U - The type that represents the response result.
 * @param requestStub - The request/response pair.
 * @returns The request/response pair, properly typed.
 */
function buildStubForGenericRequest<T, U>(
  requestStub: ProviderRequestStub<T, U>,
) {
  return requestStub;
}

/**
 * Provides a way to assign specific responses to specific requests that are
 * made through a provider. When `provider.sendAsync` is called, a stub matching
 * the request will be looked for; if one is found, it is used and then
 * discarded, unless `remainAfterUse` is set for the stub.
 *
 * @param provider - The provider.
 * @param stubs - A series of pairs, where each pair specifies a request object
 * — or part of one, at least — and a response for that request. The response
 * is actually a function that takes two arguments: the *real* request and the
 * number of times that that request has been made (counting the first as 1).
 * This latter argument be used to specify different responses for different
 * instances of the same request. The function should return a response object.
 * @returns The Jest spy object that represents `provider.sendAsync` (so that
 * you can make assertions on the method later, if you like).
 */
function stubProviderRequests(
  provider: SafeEventEmitterProvider,
  stubs: ProviderRequestStub<any, any>[],
) {
  const remainingStubs = [...stubs];
  const callNumbersByRequest = new Map<
    Partial<JsonRpcRequest<unknown>>,
    number
  >();
  return jest.spyOn(provider, 'sendAsync').mockImplementation((request, cb) => {
    const stubIndex = remainingStubs.findIndex((stub) =>
      requestMatches(stub, request),
    );

    if (stubIndex === -1) {
      throw new Error(
        `A stub is missing for request: ${inspect(request, { depth: null })}`,
      );
    } else {
      const stub = remainingStubs[stubIndex];
      const callNumber = callNumbersByRequest.get(stub.request) ?? 1;
      const response = stub.response(request, callNumber);

      cb(undefined, response);

      callNumbersByRequest.set(stub.request, callNumber + 1);

      if (!stub.remainAfterUse) {
        remainingStubs.splice(stubIndex, 1);
      }
    }
  });
}

/**
 * Determines whether a request stub matches an incoming request.
 *
 * @template T - The type that represents the request params.
 * @template U - The type that represents the response result.
 * @param requestStub - A request stub object.
 * @param request - A real request object.
 * @returns true or false, depending on whether the request stub matches the
 * request. (Always true if the request stub is simply a response builder
 * function.)
 */
function requestMatches<T, U>(
  requestStub: ProviderRequestStub<T, U>,
  request: JsonRpcRequest<T>,
): boolean {
  return (
    Object.keys(requestStub.request) as (keyof typeof requestStub.request)[]
  ).every((key) => isDeepStrictEqual(requestStub.request[key], request[key]));
}
