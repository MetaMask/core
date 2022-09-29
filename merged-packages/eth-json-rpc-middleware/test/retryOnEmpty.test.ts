import { isDeepStrictEqual } from 'util';
import clone from 'clone';
import { PollingBlockTracker, Provider } from 'eth-block-tracker';
import {
  JsonRpcEngine,
  JsonRpcRequest,
  JsonRpcResponse,
} from 'json-rpc-engine';
import {
  providerFromEngine,
  createRetryOnEmptyMiddleware,
  SafeEventEmitterProvider,
} from '../src';

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
 * @property withFinalMiddleware - Whether or not the middleware stack should be
 * capped with a middleware which ensures that `res.result` is set and that
 * `end()` is called.
 */
interface WithTestSetupOptions {
  withFinalMiddleware?: boolean;
}

/**
 * The callback that `withTestSetup` will call.
 */
type WithTestSetupCallback<T> = (setup: Setup) => Promise<T>;

/**
 * An object that can be used to assign a canned response to a request (or an
 * object that can be used to match a request) made via `provider.sendAsync`.
 *
 * @property request - An object that represents a JsonRpcRequest. Keys such as
 * `id` or `jsonrpc` may be omitted if you don't care about them.
 * @property response - A function that returns a JsonRpcResponse for that request.
 * This function takes two arguments: the *real* request and a `callNumber`,
 * which is the number of times the request has been made (counting the first
 * request as 1). This latter argument be used to specify different responses
 * for different instances of the same request.
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

const originalSetTimeout = setTimeout;

describe('createRetryOnEmptyMiddleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws if not given a provider', () => {
    expect(() => createRetryOnEmptyMiddleware()).toThrow(
      new Error(
        'RetryOnEmptyMiddleware - mandatory "provider" option is missing.',
      ),
    );
  });

  it('throws if not given a block tracker', () => {
    const { provider } = createTestSetup();

    expect(() => createRetryOnEmptyMiddleware({ provider })).toThrow(
      new Error(
        'RetryOnEmptyMiddleware - mandatory "blockTracker" option is missing.',
      ),
    );
  });

  // This list corresponds to the list in the `blockTagParamIndex` function
  // within `cache.ts`
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
      describe(`${method}`, () => {
        it('makes a request directly to the provider and retries the request up to 10 times, returning the response if it does not have a result of undefined', async () => {
          await withTestSetup(async ({ engine, provider }) => {
            const blockNumber = '0x0';
            const request: JsonRpcRequest<string[]> = {
              id: 1,
              jsonrpc: '2.0',
              method,
              params: buildMockParamsWithBlockParamAt(
                blockParamIndex,
                blockNumber,
              ),
            };
            const sendAsyncSpy = stubProviderRequests(provider, [
              stubBlockNumberRequest(blockNumber),
              stubRequestThatFailsThenFinallySucceeds({
                request,
                numberOfTimesToFail: 9,
                successfulResponse: (req) => ({
                  id: req.id,
                  jsonrpc: '2.0',
                  result: 'something',
                }),
              }),
            ]);

            const promiseForResponse = engine.handle(request);
            await waitForRequestToBeRetried({
              sendAsyncSpy,
              request,
              numberOfTimes: 10,
            });

            expect(await promiseForResponse).toStrictEqual({
              id: 1,
              jsonrpc: '2.0',
              result: 'something',
              error: undefined,
            });
          });
        });

        it('returns an error if the request is still unsuccessful after 10 retries', async () => {
          await withTestSetup(async ({ engine, provider }) => {
            const blockNumber = '0x0';
            const request: JsonRpcRequest<string[]> = {
              id: 1,
              jsonrpc: '2.0',
              method,
              params: buildMockParamsWithBlockParamAt(
                blockParamIndex,
                blockNumber,
              ),
            };
            const sendAsyncSpy = stubProviderRequests(provider, [
              stubBlockNumberRequest(blockNumber),
              stubGenericRequest({
                request,
                response: (req) => {
                  return {
                    id: req.id,
                    jsonrpc: '2.0',
                    error: {
                      code: -1,
                      message: 'oops',
                    },
                  };
                },
                remainAfterUse: true,
              }),
            ]);

            const promiseForResponse = engine.handle(request);
            await waitForRequestToBeRetried({
              sendAsyncSpy,
              request,
              numberOfTimes: 10,
            });

            expect(await promiseForResponse).toMatchObject({
              error: expect.objectContaining({
                message: 'RetryOnEmptyMiddleware - retries exhausted',
              }),
            });
          });
        });

        it('does not fall through to the next middleware after making a request to the provider', async () => {
          await withTestSetup(
            { withFinalMiddleware: false },
            async ({ engine, provider }) => {
              const blockNumber = '0x0';
              const request: JsonRpcRequest<string[]> = {
                id: 1,
                jsonrpc: '2.0',
                method,
                params: buildMockParamsWithBlockParamAt(
                  blockParamIndex,
                  blockNumber,
                ),
              };
              stubProviderRequests(provider, [
                stubBlockNumberRequest(blockNumber),
                stubGenericRequest({
                  request,
                  response: (req) => {
                    return {
                      id: req.id,
                      jsonrpc: '2.0',
                      result: 'success',
                    };
                  },
                }),
              ]);
              const finalMiddleware = buildFinalMiddleware();
              engine.push(finalMiddleware);

              await engine.handle(request);

              expect(finalMiddleware).not.toHaveBeenCalled();
            },
          );
        });

        describe('if the block number in the request params is higher than the latest block number reported by the block tracker', () => {
          it('does not make a request to the provider', async () => {
            await withTestSetup(async ({ engine, provider }) => {
              const request: JsonRpcRequest<string[]> = {
                id: 1,
                jsonrpc: '2.0',
                method,
                params: buildMockParamsWithBlockParamAt(
                  blockParamIndex,
                  '0x100',
                ),
              };
              const sendAsyncSpy = stubProviderRequests(provider, [
                stubBlockNumberRequest('0x0'),
              ]);

              await engine.handle(request);

              expectProviderRequestNotToHaveBeenMade(sendAsyncSpy, request);
            });
          });

          it('falls through to the next middleware', async () => {
            await withTestSetup(
              { withFinalMiddleware: false },
              async ({ engine, provider }) => {
                const request: JsonRpcRequest<string[]> = {
                  id: 1,
                  jsonrpc: '2.0',
                  method,
                  params: buildMockParamsWithBlockParamAt(
                    blockParamIndex,
                    '0x100',
                  ),
                };
                stubProviderRequests(provider, [stubBlockNumberRequest('0x0')]);
                const finalMiddleware = buildFinalMiddleware();
                engine.push(finalMiddleware);

                await engine.handle(request);

                expect(finalMiddleware).toHaveBeenCalled();
              },
            );
          });
        });

        describe.each(['1', 'earliest', 'asdlsdfls'])(
          'if the block parameter is not a 0x-prefixed hex number such as %o',
          (blockParam) => {
            it('does not make a request to the provider', async () => {
              await withTestSetup(async ({ engine, provider }) => {
                const request: JsonRpcRequest<string[]> = {
                  id: 1,
                  jsonrpc: '2.0',
                  method,
                  params: buildMockParamsWithBlockParamAt(
                    blockParamIndex,
                    blockParam,
                  ),
                };
                const sendAsyncSpy = stubProviderRequests(provider, [
                  stubBlockNumberRequest('0x0'),
                ]);

                await engine.handle(request);

                expectProviderRequestNotToHaveBeenMade(sendAsyncSpy, request);
              });
            });

            it('falls through to the next middleware', async () => {
              await withTestSetup(
                { withFinalMiddleware: false },
                async ({ engine, provider }) => {
                  const request: JsonRpcRequest<string[]> = {
                    id: 1,
                    jsonrpc: '2.0',
                    method,
                    params: buildMockParamsWithBlockParamAt(
                      blockParamIndex,
                      blockParam,
                    ),
                  };
                  stubProviderRequests(provider, [
                    stubBlockNumberRequest('0x0'),
                  ]);
                  const finalMiddleware = buildFinalMiddleware();
                  engine.push(finalMiddleware);

                  await engine.handle(request);

                  expect(finalMiddleware).toHaveBeenCalled();
                },
              );
            });
          },
        );

        describe.each(['latest', 'pending'])(
          'if the block parameter is %o',
          (blockParam) => {
            it('does not make a request to the provider', async () => {
              await withTestSetup(async ({ engine, provider }) => {
                const request: JsonRpcRequest<string[]> = {
                  id: 1,
                  jsonrpc: '2.0',
                  method,
                  params: buildMockParamsWithBlockParamAt(
                    blockParamIndex,
                    blockParam,
                  ),
                };
                const sendAsyncSpy = stubProviderRequests(provider, [
                  stubBlockNumberRequest(),
                ]);

                await engine.handle(request);

                expectProviderRequestNotToHaveBeenMade(sendAsyncSpy, request);
              });
            });

            it('falls through to the next middleware', async () => {
              await withTestSetup(
                { withFinalMiddleware: false },
                async ({ engine, provider }) => {
                  const request: JsonRpcRequest<string[]> = {
                    id: 1,
                    jsonrpc: '2.0',
                    method,
                    params: buildMockParamsWithBlockParamAt(
                      blockParamIndex,
                      blockParam,
                    ),
                  };
                  stubProviderRequests(provider, [stubBlockNumberRequest()]);
                  const finalMiddleware = buildFinalMiddleware();
                  engine.push(finalMiddleware);

                  await engine.handle(request);

                  expect(finalMiddleware).toHaveBeenCalled();
                },
              );
            });
          },
        );

        describe('if no block parameter is given', () => {
          it('does not make a request to the provider', async () => {
            await withTestSetup(async ({ engine, provider }) => {
              const request: JsonRpcRequest<string[]> = {
                id: 1,
                jsonrpc: '2.0',
                method,
                params: buildMockParamsWithoutBlockParamAt(blockParamIndex),
              };
              const sendAsyncSpy = stubProviderRequests(provider, [
                stubBlockNumberRequest(),
              ]);

              await engine.handle(request);

              expectProviderRequestNotToHaveBeenMade(sendAsyncSpy, request);
            });
          });

          it('falls through to the next middleware', async () => {
            await withTestSetup(
              { withFinalMiddleware: false },
              async ({ engine, provider }) => {
                const request: JsonRpcRequest<string[]> = {
                  id: 1,
                  jsonrpc: '2.0',
                  method,
                  params: buildMockParamsWithoutBlockParamAt(blockParamIndex),
                };
                stubProviderRequests(provider, [stubBlockNumberRequest()]);
                const finalMiddleware = buildFinalMiddleware();
                engine.push(finalMiddleware);

                await engine.handle(request);

                expect(finalMiddleware).toHaveBeenCalled();
              },
            );
          });
        });
      });
    });
  });

  describe('a method that does not take a block parameter', () => {
    it('does not make a request to the provider', async () => {
      await withTestSetup(async ({ engine, provider }) => {
        const method = 'a_non_block_param_method';
        const request: JsonRpcRequest<string[]> = {
          id: 1,
          jsonrpc: '2.0',
          method,
        };
        const sendAsyncSpy = stubProviderRequests(provider, [
          stubBlockNumberRequest(),
        ]);

        await engine.handle(request);

        expectProviderRequestNotToHaveBeenMade(sendAsyncSpy, request);
      });
    });

    it('falls through to the next middleware', async () => {
      await withTestSetup(
        { withFinalMiddleware: false },
        async ({ engine }) => {
          const method = 'a_non_block_param_method';
          const request: JsonRpcRequest<string[]> = {
            id: 1,
            jsonrpc: '2.0',
            method,
          };
          const finalMiddleware = buildFinalMiddleware();
          engine.push(finalMiddleware);

          await engine.handle(request);

          expect(finalMiddleware).toHaveBeenCalled();
        },
      );
    });
  });
});

/**
 * When using `stubProviderRequests` to list canned responses for specific
 * requests that are made to `provider.sendAsync`, you don't need to provide the
 * full request object to go along with the response, but only part of that
 * request object. When `provider.sendAsync` is then called, we can look up the
 * compare the real request object to the request object that was specified to
 * find a match. This function is used to do that comparison (and other
 * like comparisons).
 *
 * @param requestMatcher - A partial request object.
 * @param request - A real request object.
 * @returns True or false depending on whether the partial request object "fits
 * inside" the real request object.
 */
function requestMatches(
  requestMatcher: Partial<JsonRpcRequest<unknown>>,
  request: JsonRpcRequest<unknown>,
): boolean {
  return (Object.keys(requestMatcher) as (keyof typeof requestMatcher)[]).every(
    (key) => isDeepStrictEqual(requestMatcher[key], request[key]),
  );
}

/**
 * Builds the JsonRpcEngine instance, the provider object, and the block
 * tracker for use in tests.
 */
function createTestSetup() {
  const engine = new JsonRpcEngine();
  const provider = providerFromEngine(engine);
  const blockTracker = new PollingBlockTracker({
    provider: provider as Provider,
  });

  return { engine, provider, blockTracker };
}

/**
 * Wraps code within a test that needs to make use of a JsonRpcEngine instance,
 * a provider object, and/or a block tracker.
 *
 * @param args - Either an options bag and a function, or just a function. The
 * options bag takes a single option, `withFinalMiddleware` — true by default —
 * which places a final middleware in the middleware stack that ensures that the
 * response is fully set and that the stack ends properly. The function is
 * called with the JsonRpcEngine instance, provider, and block tracker.
 * @returns Whatever the callback returns.
 */
async function withTestSetup<T>(
  ...args:
    | [WithTestSetupOptions, WithTestSetupCallback<T>]
    | [WithTestSetupCallback<T>]
) {
  const [{ withFinalMiddleware = true }, fn] =
    args.length === 2 ? [args[0], args[1]] : [{}, args[0]];
  const setup = createTestSetup();

  setup.engine.push(
    createRetryOnEmptyMiddleware({
      provider: setup.provider,
      blockTracker: setup.blockTracker,
    }),
  );

  if (withFinalMiddleware) {
    setup.engine.push((req, res, _next, end) => {
      if (res.id === undefined) {
        res.id = req.id;
      }

      if (res.jsonrpc === undefined) {
        res.jsonrpc = '2.0';
      }

      if (res.result === undefined) {
        res.result = 'default response';
      }

      end();
    });
  }

  return await fn(setup);
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
  const remainingStubs = clone(stubs);
  const callNumbersByRequest = new Map<
    Partial<JsonRpcRequest<unknown>>,
    number
  >();
  return jest.spyOn(provider, 'sendAsync').mockImplementation((request, cb) => {
    const stubIndex = remainingStubs.findIndex((stub) =>
      requestMatches(stub.request, request),
    );

    if (stubIndex === -1) {
      throw new Error(`Unrecognized request ${JSON.stringify(request)}`);
    } else {
      const stub = remainingStubs[stubIndex];
      const callNumber = callNumbersByRequest.get(stub.request) ?? 1;

      cb(undefined, stub.response(request, callNumber));

      callNumbersByRequest.set(stub.request, callNumber + 1);

      if (!stub.remainAfterUse) {
        remainingStubs.splice(stubIndex, 1);
      }
    }
  });
}

/**
 * Builds a canned response for a `eth_blockNumber` request made to
 * `provider.sendAsync` such that the response will return the given block
 * number. Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param blockNumber - The block number (default: '0x0').
 * @returns The request/response pair.
 */
function stubBlockNumberRequest(
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
 * @param requestStub - The request/response pair.
 * @returns The request/response pair, properly typed.
 */
function stubGenericRequest<T, U>(requestStub: ProviderRequestStub<T, U>) {
  return requestStub;
}

/**
 * Builds a canned response for a request made to `provider.sendAsync` which
 * will error for the first N instances and then succeed on the last instance.
 * Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param request - The request matcher for the stub.
 * @param numberOfTimesToFail - The number of times the request is expected to
 * be called until it returns a successful response.
 * @param successfulResponse - The response that `provider.sendAsync` will
 * return when called past `numberOfTimesToFail`.
 * @returns The request/response pair, properly typed.
 */
function stubRequestThatFailsThenFinallySucceeds<T, U>({
  request,
  numberOfTimesToFail,
  successfulResponse,
}: {
  request: ProviderRequestStub<T, U>['request'];
  numberOfTimesToFail: number;
  successfulResponse: ProviderRequestStub<T, U>['response'];
}): ProviderRequestStub<T, U> {
  return stubGenericRequest({
    request,
    response: (req, callNumber) => {
      if (callNumber <= numberOfTimesToFail) {
        return {
          id: req.id,
          jsonrpc: '2.0',
          error: {
            code: -1,
            message: 'oops',
          },
        };
      }
      return successfulResponse(req, callNumber);
    },
    remainAfterUse: true,
  });
}

/**
 * The `retryOnEmpty` middleware, as its name implies, uses the provider to make
 * the given request, retrying said request up to 10 times if the response is
 * empty before failing. Upon retrying, it will wait a brief time using
 * `setTimeout`. Because we are using Jest's fake timers, we have to manually
 * trigger the callback passed to `setTimeout` atfter it is called. The problem
 * is that we don't know when `setTimeout` will be called while the
 * `retryOnEmpty` middleware is running, so we have to wait. We do this by
 * recording how many times `provider.sendAsync` has been called with the
 * request, and when that number goes up, we assume that `setTimeout` has been
 * called too and advance through time. We stop the loop when
 * `provider.sendAsync` has been called the given number of times.
 *
 * @param args - The arguments.
 * @param sendAsyncSpy - The Jest spy object that represents
 * `provider.sendAsync`.
 * @param request - The request object.
 * @param numberOfTimes - The number of times that we expect
 * `provider.sendAsync` to be called with `request`.
 */
async function waitForRequestToBeRetried({
  sendAsyncSpy,
  request,
  numberOfTimes,
}: {
  sendAsyncSpy: jest.SpyInstance;
  request: JsonRpcRequest<unknown>;
  numberOfTimes: number;
}) {
  let iterationNumber = 1;
  while (iterationNumber <= numberOfTimes) {
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    if (
      sendAsyncSpy.mock.calls.filter((args) => requestMatches(args[0], request))
        .length === iterationNumber
    ) {
      jest.runAllTimers();
      iterationNumber += 1;
    }
  }
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
 * Creates a middleware function that just ends the request, but is also a Jest
 * mock function so that you can make assertions on it.
 *
 * @returns The middleware mock function.
 */
function buildFinalMiddleware() {
  return jest.fn((_req, _res, _next, end) => {
    end();
  });
}

/**
 * Asserts that `provider.sendAsync` has not been called with the given request
 * object (or an object that can matched to that request).
 *
 * @param sendAsyncSpy - The Jest spy object that represents
 * `provider.sendAsync`.
 * @param requestMatcher - An object that can be matched to a request passed to
 * `provider.sendAsync`.
 */
function expectProviderRequestNotToHaveBeenMade(
  sendAsyncSpy: jest.SpyInstance,
  requestMatcher: Partial<JsonRpcRequest<unknown>>,
) {
  expect(
    sendAsyncSpy.mock.calls.some((args) =>
      requestMatches(requestMatcher, args[0]),
    ),
  ).toBe(false);
}
