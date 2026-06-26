import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import { createRetryOnEmptyMiddleware } from '.';
import type { ProviderRequestStub } from '../test/util/helpers';
import {
  createMockParamsWithBlockParamAt,
  createMockParamsWithoutBlockParamAt,
  createStubForBlockNumberRequest,
  expectProviderRequestNotToHaveBeenMade,
  requestMatches,
  stubProviderRequests,
  createProviderAndBlockTracker,
  createEngine,
  createRequest,
  createFinalMiddlewareWithDefaultResult,
} from '../test/util/helpers';

const originalSetTimeout = globalThis.setTimeout;

describe('createRetryOnEmptyMiddleware', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  let provider: ReturnType<typeof createProviderAndBlockTracker>['provider'];
  let blockTracker: ReturnType<
    typeof createProviderAndBlockTracker
  >['blockTracker'];

  beforeEach(() => {
    const providerAndBlockTracker = createProviderAndBlockTracker();
    provider = providerAndBlockTracker.provider;
    blockTracker = providerAndBlockTracker.blockTracker;
  });

  afterEach(async () => {
    jest.clearAllTimers();
    await blockTracker.destroy();
  });

  it('throws if not given a provider', () => {
    expect(() => createRetryOnEmptyMiddleware()).toThrow(
      new Error(
        'RetryOnEmptyMiddleware - mandatory "provider" option is missing.',
      ),
    );
  });

  it('throws if not given a block tracker', async () => {
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
        it('makes a direct request through the provider, retrying it request up to 10 times and returning the response if it does not have a result of undefined', async () => {
          const engine = createEngine(
            createRetryOnEmptyMiddleware({
              provider,
              blockTracker,
            }),
          );

          const blockNumber = '0x0';
          const request = createRequest({
            id: 1,
            method,
            params: createMockParamsWithBlockParamAt(
              blockParamIndex,
              blockNumber,
            ),
          });
          const requestSpy = stubProviderRequests(provider, [
            createStubForBlockNumberRequest(blockNumber),
            stubRequestThatFailsThenFinallySucceeds({
              request,
              numberOfTimesToFail: 9,
              successfulResult: async () => 'something',
            }),
          ]);

          const resultPromise = engine.handle(request);
          await waitForRequestToBeRetried({
            requestSpy,
            request,
            numberOfTimes: 10,
          });

          expect(await resultPromise).toBe('something');
        });

        it('returns an error if the request is still unsuccessful after 10 retries', async () => {
          const engine = createEngine(
            createRetryOnEmptyMiddleware({
              provider,
              blockTracker,
            }),
          );

          const blockNumber = '0x0';
          const request = createRequest({
            method,
            params: createMockParamsWithBlockParamAt(
              blockParamIndex,
              blockNumber,
            ),
          });
          const requestSpy = stubProviderRequests(provider, [
            createStubForBlockNumberRequest(blockNumber),
            stubGenericRequest({
              request,
              result: () => {
                throw providerErrors.custom({ code: -1, message: 'oops' });
              },
              remainAfterUse: true,
            }),
          ]);

          const resultPromise = engine.handle(request);
          await waitForRequestToBeRetried({
            requestSpy,
            request,
            numberOfTimes: 10,
          });

          await expect(resultPromise).rejects.toThrow(
            new Error('RetryOnEmptyMiddleware - retries exhausted'),
          );
        });

        it('does not proceed to the next middleware after making a request through the provider', async () => {
          const finalMiddleware = createFinalMiddlewareWithDefaultResult();

          const engine = createEngine(
            createRetryOnEmptyMiddleware({
              provider,
              blockTracker,
            }),
            finalMiddleware,
          );

          const blockNumber = '0x0';
          const request = createRequest({
            method,
            params: createMockParamsWithBlockParamAt(
              blockParamIndex,
              blockNumber,
            ),
          });
          stubProviderRequests(provider, [
            createStubForBlockNumberRequest(blockNumber),
            stubGenericRequest({
              request,
              result: async () => 'success',
            }),
          ]);

          await engine.handle(request);

          expect(finalMiddleware).not.toHaveBeenCalled();
        });

        describe('if the block number in the request params is higher than the latest block number reported by the block tracker', () => {
          // Using custom expect helper
          // eslint-disable-next-line jest/expect-expect
          it('does not make a direct request through the provider', async () => {
            const engine = createEngine(
              createRetryOnEmptyMiddleware({
                provider,
                blockTracker,
              }),
            );

            const request = createRequest({
              method,
              params: createMockParamsWithBlockParamAt(
                blockParamIndex,
                '0x100',
              ),
            });
            const requestSpy = stubProviderRequests(provider, [
              createStubForBlockNumberRequest('0x0'),
            ]);

            await engine.handle(request);

            expectProviderRequestNotToHaveBeenMade(requestSpy, request);
          });

          it('proceeds to the next middleware', async () => {
            const finalMiddleware = createFinalMiddlewareWithDefaultResult();

            const engine = createEngine(
              createRetryOnEmptyMiddleware({
                provider,
                blockTracker,
              }),
              finalMiddleware,
            );

            const request = createRequest({
              method,
              params: createMockParamsWithBlockParamAt(
                blockParamIndex,
                '0x100',
              ),
            });
            stubProviderRequests(provider, [
              createStubForBlockNumberRequest('0x0'),
            ]);

            await engine.handle(request);

            expect(finalMiddleware).toHaveBeenCalled();
          });
        });

        describe.each(['1', 'earliest', 'asdlsdfls'])(
          'if the block parameter is not a 0x-prefixed hex number such as %o',
          (blockParam) => {
            // Using custom expect helper
            // eslint-disable-next-line jest/expect-expect
            it('does not make a direct request through the provider', async () => {
              const engine = createEngine(
                createRetryOnEmptyMiddleware({
                  provider,
                  blockTracker,
                }),
              );

              const request = createRequest({
                method,
                params: createMockParamsWithBlockParamAt(
                  blockParamIndex,
                  blockParam,
                ),
              });
              const requestSpy = stubProviderRequests(provider, [
                createStubForBlockNumberRequest('0x0'),
              ]);

              await engine.handle(request);

              expectProviderRequestNotToHaveBeenMade(requestSpy, request);
            });

            it('proceeds to the next middleware', async () => {
              const finalMiddleware = createFinalMiddlewareWithDefaultResult();

              const engine = createEngine(
                createRetryOnEmptyMiddleware({
                  provider,
                  blockTracker,
                }),
                finalMiddleware,
              );

              const request = createRequest({
                method,
                params: createMockParamsWithBlockParamAt(
                  blockParamIndex,
                  blockParam,
                ),
              });
              stubProviderRequests(provider, [
                createStubForBlockNumberRequest('0x0'),
              ]);

              await engine.handle(request);

              expect(finalMiddleware).toHaveBeenCalled();
            });
          },
        );

        describe.each(['latest', 'pending'])(
          'if the block parameter is %o',
          (blockParam) => {
            // Using custom expect helper
            // eslint-disable-next-line jest/expect-expect
            it('does not make a direct request through the provider', async () => {
              const engine = createEngine(
                createRetryOnEmptyMiddleware({
                  provider,
                  blockTracker,
                }),
              );

              const request = createRequest({
                method,
                params: createMockParamsWithBlockParamAt(
                  blockParamIndex,
                  blockParam,
                ),
              });
              const requestSpy = stubProviderRequests(provider, [
                createStubForBlockNumberRequest(),
              ]);

              await engine.handle(request);

              expectProviderRequestNotToHaveBeenMade(requestSpy, request);
            });

            it('proceeds to the next middleware', async () => {
              const finalMiddleware = createFinalMiddlewareWithDefaultResult();

              const engine = createEngine(
                createRetryOnEmptyMiddleware({
                  provider,
                  blockTracker,
                }),
                finalMiddleware,
              );

              const request: JsonRpcRequest<string[]> = {
                id: 1,
                jsonrpc: '2.0',
                method,
                params: createMockParamsWithBlockParamAt(
                  blockParamIndex,
                  blockParam,
                ),
              };
              stubProviderRequests(provider, [
                createStubForBlockNumberRequest(),
              ]);

              await engine.handle(request);

              expect(finalMiddleware).toHaveBeenCalled();
            });
          },
        );

        describe('if no block parameter is given', () => {
          // Using custom expect helper
          // eslint-disable-next-line jest/expect-expect
          it('does not make a direct request through the provider', async () => {
            const engine = createEngine(
              createRetryOnEmptyMiddleware({
                provider,
                blockTracker,
              }),
            );

            const request = createRequest({
              method,
              params: createMockParamsWithoutBlockParamAt(blockParamIndex),
            });
            const requestSpy = stubProviderRequests(provider, [
              createStubForBlockNumberRequest(),
            ]);

            await engine.handle(request);

            expectProviderRequestNotToHaveBeenMade(requestSpy, request);
          });

          it('proceeds to the next middleware', async () => {
            const finalMiddleware = createFinalMiddlewareWithDefaultResult();

            const engine = createEngine(
              createRetryOnEmptyMiddleware({
                provider,
                blockTracker,
              }),
              finalMiddleware,
            );

            const request = createRequest({
              method,
              params: createMockParamsWithoutBlockParamAt(blockParamIndex),
            });
            stubProviderRequests(provider, [createStubForBlockNumberRequest()]);

            await engine.handle(request);

            expect(finalMiddleware).toHaveBeenCalled();
          });
        });
      });
    });
  });

  describe('a method that does not take a block parameter', () => {
    // Using custom expect helper
    // eslint-disable-next-line jest/expect-expect
    it('does not make a direct request through the provider', async () => {
      const engine = createEngine(
        createRetryOnEmptyMiddleware({
          provider,
          blockTracker,
        }),
      );

      const method = 'a_non_block_param_method';
      const request = createRequest({ method });
      const requestSpy = stubProviderRequests(provider, [
        createStubForBlockNumberRequest(),
      ]);

      await engine.handle(request);

      expectProviderRequestNotToHaveBeenMade(requestSpy, request);
    });

    it('proceeds to the next middleware', async () => {
      const finalMiddleware = createFinalMiddlewareWithDefaultResult();

      const engine = createEngine(
        createRetryOnEmptyMiddleware({
          provider,
          blockTracker,
        }),
        finalMiddleware,
      );

      const method = 'a_non_block_param_method';
      const request = createRequest({ method });

      await engine.handle(request);

      expect(finalMiddleware).toHaveBeenCalled();
    });
  });

  describe('when provider return execution revert error', () => {
    it('returns the same error to caller', async () => {
      const engine = createEngine(
        createRetryOnEmptyMiddleware({
          provider,
          blockTracker,
        }),
      );

      const request = createRequest({
        method: 'eth_call',
        params: createMockParamsWithBlockParamAt(1, '100'),
      });
      stubProviderRequests(provider, [
        createStubForBlockNumberRequest(),
        {
          request,
          result: (): never => {
            throw rpcErrors.invalidInput('execution reverted');
          },
        },
      ]);

      const resultPromise = engine.handle(request);
      await expect(resultPromise).rejects.toThrow(
        rpcErrors.invalidInput('execution reverted'),
      );
    });
  });
});

/**
 * Creates a canned result for a request made to `provider.request`. Intended
 * to be used in conjunction with `stubProviderRequests`. Although not strictly
 * necessary, it helps to assign a proper type to a request/result pair.
 *
 * @param requestStub - The request/response pair.
 * @returns The request/response pair, properly typed.
 */
function stubGenericRequest<Params extends JsonRpcParams, Result extends Json>(
  requestStub: ProviderRequestStub<Params, Result>,
): ProviderRequestStub<Params, Result> {
  return requestStub;
}

/**
 * Creates a canned result for a request made to `provider.request` which
 * will error for the first N instances and then succeed on the last instance.
 * Intended to be used in conjunction with `stubProviderRequests`.
 *
 * @param args - The arguments.
 * @param args.request - The request matcher for the stub.
 * @param args.numberOfTimesToFail - The number of times the request is expected to
 * be called until it returns a successful result.
 * @param args.successfulResult - The result that `provider.request` will
 * return when called past `numberOfTimesToFail`.
 * @returns The request/result pair, properly typed.
 */
function stubRequestThatFailsThenFinallySucceeds<
  Params extends JsonRpcParams,
  Result extends Json,
>({
  request,
  numberOfTimesToFail,
  successfulResult,
}: {
  request: ProviderRequestStub<Params, Result>['request'];
  numberOfTimesToFail: number;
  successfulResult: ProviderRequestStub<Params, Result>['result'];
}): ProviderRequestStub<Params, Result> {
  return stubGenericRequest({
    request,
    result: async (callNumber) => {
      if (callNumber <= numberOfTimesToFail) {
        throw providerErrors.custom({ code: -1, message: 'oops' });
      }

      return await successfulResult(callNumber);
    },
    remainAfterUse: true,
  });
}

/**
 * The `retryOnEmpty` middleware, as its name implies, uses the provider to make
 * the given request, retrying said request up to 10 times if the result is
 * empty before failing. Upon retrying, it will wait a brief time using
 * `setTimeout`. Because we are using Jest's fake timers, we have to manually
 * trigger the callback passed to `setTimeout` atfter it is called. The problem
 * is that we don't know when `setTimeout` will be called while the
 * `retryOnEmpty` middleware is running, so we have to wait. We do this by
 * recording how many times `provider.request` has been called with the
 * request, and when that number goes up, we assume that `setTimeout` has been
 * called too and advance through time. We stop the loop when
 * `provider.request` has been called the given number of times.
 *
 * @param args - The arguments.
 * @param args.requestSpy - The Jest spy object that represents
 * `provider.request`.
 * @param args.request - The request object.
 * @param args.numberOfTimes - The number of times that we expect
 * `provider.request` to be called with `request`.
 */
async function waitForRequestToBeRetried({
  requestSpy,
  request,
  numberOfTimes,
}: {
  requestSpy: jest.SpyInstance;
  request: JsonRpcRequest;
  numberOfTimes: number;
}): Promise<void> {
  let iterationNumber = 1;

  while (iterationNumber <= numberOfTimes) {
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    if (
      requestSpy.mock.calls.filter((args) => requestMatches(args[0], request))
        .length === iterationNumber
    ) {
      jest.runAllTimers();
      iterationNumber += 1;
    }
  }
}
