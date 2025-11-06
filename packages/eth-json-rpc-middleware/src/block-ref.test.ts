import { MiddlewareContext } from '@metamask/json-rpc-engine/v2';

import { createBlockRefMiddleware } from '.';
import {
  createMockParamsWithBlockParamAt,
  stubProviderRequests,
  createStubForBlockNumberRequest,
  createStubForGenericRequest,
  createFinalMiddlewareWithDefaultResult,
  createMockParamsWithoutBlockParamAt,
  expectProviderRequestNotToHaveBeenMade,
  createProviderAndBlockTracker,
  createEngine,
  createRequest,
} from '../test/util/helpers';

describe('createBlockRefMiddleware', () => {
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
    await blockTracker.destroy();
  });

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
            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
            );

            const request = createRequest({
              method,
              params: createMockParamsWithBlockParamAt(
                blockParamIndex,
                'latest',
              ),
            });

            stubProviderRequests(provider, [
              createStubForBlockNumberRequest('0x100'),
              createStubForGenericRequest({
                request: {
                  ...request,
                  params: createMockParamsWithBlockParamAt(
                    blockParamIndex,
                    '0x100',
                  ),
                },
                result: async () => 'something',
              }),
            ]);

            const result = await engine.handle(request);

            expect(result).toBe('something');
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = createFinalMiddlewareWithDefaultResult();

            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
              finalMiddleware,
            );

            const request = createRequest({
              method,
              params: createMockParamsWithBlockParamAt(
                blockParamIndex,
                'latest',
              ),
            });

            stubProviderRequests(provider, [
              createStubForBlockNumberRequest('0x100'),
              createStubForGenericRequest({
                request: {
                  ...request,
                  params: createMockParamsWithBlockParamAt(
                    blockParamIndex,
                    '0x100',
                  ),
                },
                result: async () => 'something',
              }),
            ]);

            await engine.handle(request);

            expect(finalMiddleware).not.toHaveBeenCalled();
          });
        });

        describe('if no block param is provided', () => {
          it('makes a direct request through the provider, replacing the block param with the latest block number', async () => {
            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
            );

            const request = createRequest({
              method,
              params: createMockParamsWithoutBlockParamAt(blockParamIndex),
            });

            stubProviderRequests(provider, [
              createStubForBlockNumberRequest('0x100'),
              createStubForGenericRequest({
                request: {
                  ...request,
                  params: createMockParamsWithBlockParamAt(
                    blockParamIndex,
                    '0x100',
                  ),
                },
                result: async () => 'something',
              }),
            ]);

            const result = await engine.handle(request);

            expect(result).toBe('something');
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = createFinalMiddlewareWithDefaultResult();

            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
              finalMiddleware,
            );

            const request = createRequest({
              method,
              params: createMockParamsWithoutBlockParamAt(blockParamIndex),
            });

            stubProviderRequests(provider, [
              createStubForBlockNumberRequest('0x100'),
              createStubForGenericRequest({
                request: {
                  ...request,
                  params: createMockParamsWithBlockParamAt(
                    blockParamIndex,
                    '0x100',
                  ),
                },
                result: async () => 'something',
              }),
            ]);

            await engine.handle(request);

            expect(finalMiddleware).not.toHaveBeenCalled();
          });
        });

        describe.each(['earliest', 'pending', '0x200'])(
          'if the block param is something other than "latest", like %o',
          (blockParam) => {
            // Using custom expect helper
            // eslint-disable-next-line jest/expect-expect
            it('does not make a direct request through the provider', async () => {
              const finalMiddleware = createFinalMiddlewareWithDefaultResult();

              const engine = createEngine(
                createBlockRefMiddleware({
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

              const requestSpy = stubProviderRequests(provider, [
                createStubForBlockNumberRequest('0x100'),
              ]);

              await engine.handle(request);

              expectProviderRequestNotToHaveBeenMade(requestSpy, request);
            });

            it('proceeds to the next middleware', async () => {
              const finalMiddleware = createFinalMiddlewareWithDefaultResult();

              const engine = createEngine(
                createBlockRefMiddleware({
                  provider,
                  blockTracker,
                }),
                finalMiddleware,
              );

              stubProviderRequests(provider, [
                createStubForBlockNumberRequest('0x100'),
              ]);

              await engine.handle(
                createRequest({
                  method,
                  params: createMockParamsWithBlockParamAt(
                    blockParamIndex,
                    blockParam,
                  ),
                }),
              );

              expect(finalMiddleware).toHaveBeenCalledWith({
                request: expect.objectContaining({
                  params: createMockParamsWithBlockParamAt(
                    blockParamIndex,
                    blockParam,
                  ),
                }),
                context: expect.any(MiddlewareContext),
                next: expect.any(Function),
              });
            });
          },
        );
      });
    });
  });

  describe('when the RPC method does not take a block parameter', () => {
    // Using custom expect helper
    // eslint-disable-next-line jest/expect-expect
    it('does not make a direct request through the provider', async () => {
      const finalMiddleware = createFinalMiddlewareWithDefaultResult();

      const engine = createEngine(
        createBlockRefMiddleware({
          provider,
          blockTracker,
        }),
        finalMiddleware,
      );

      const request = createRequest({
        method: 'a_non_block_param_method',
        params: ['some value', '0x200'],
      });

      const requestSpy = stubProviderRequests(provider, [
        createStubForBlockNumberRequest('0x100'),
      ]);

      await engine.handle(request);

      expectProviderRequestNotToHaveBeenMade(requestSpy, request);
    });

    it('proceeds to the next middleware', async () => {
      const finalMiddleware = createFinalMiddlewareWithDefaultResult();

      const engine = createEngine(
        createBlockRefMiddleware({
          provider,
          blockTracker,
        }),
        finalMiddleware,
      );

      stubProviderRequests(provider, [
        createStubForBlockNumberRequest('0x100'),
      ]);

      await engine.handle(
        createRequest({
          method: 'a_non_block_param_method',
          params: ['some value', '0x200'],
        }),
      );

      expect(finalMiddleware).toHaveBeenCalledWith({
        request: expect.objectContaining({
          params: ['some value', '0x200'],
        }),
        context: expect.any(MiddlewareContext),
        next: expect.any(Function),
      });
    });
  });
});
