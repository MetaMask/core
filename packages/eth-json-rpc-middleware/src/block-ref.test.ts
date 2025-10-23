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

const createProviderAndBlockTracker = (): {
  provider: SafeEventEmitterProvider;
  blockTracker: PollingBlockTracker;
} => {
  const engine = new JsonRpcEngine();
  engine.push(buildFinalMiddlewareWithDefaultResult());
  const provider = providerFromEngine(engine);
  const blockTracker = new PollingBlockTracker({
    provider,
  });

  return { provider, blockTracker };
};

const createEngine = (
  middlewareUnderTest: JsonRpcMiddleware<any, any>,
  ...otherMiddleware: JsonRpcMiddleware<any, any>[]
) => {
  const engine = new JsonRpcEngine();
  engine.push(middlewareUnderTest);
  if (otherMiddleware.length === 0) {
    otherMiddleware.push(buildFinalMiddlewareWithDefaultResult());
  }
  for (const middleware of otherMiddleware) {
    engine.push(middleware);
  }
  return engine;
};

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
            const { provider, blockTracker } = createProviderAndBlockTracker();

            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
            );

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
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

            const { provider, blockTracker } = createProviderAndBlockTracker();
            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
              finalMiddleware,
            );

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
          });
        });

        describe('if no block param is provided', () => {
          it('makes a direct request through the provider, replacing the block param with the latest block number', async () => {
            const { provider, blockTracker } = createProviderAndBlockTracker();
            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
            );

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
          });

          it('does not proceed to the next middleware after making a request through the provider', async () => {
            const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

            const { provider, blockTracker } = createProviderAndBlockTracker();
            const engine = createEngine(
              createBlockRefMiddleware({
                provider,
                blockTracker,
              }),
              finalMiddleware,
            );

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
          });
        });

        describe.each(['earliest', 'pending', '0x200'])(
          'if the block param is something other than "latest", like %o',
          (blockParam) => {
            it('does not make a direct request through the provider', async () => {
              const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

              const { provider, blockTracker } =
                createProviderAndBlockTracker();
              const engine = createEngine(
                createBlockRefMiddleware({
                  provider,
                  blockTracker,
                }),
                finalMiddleware,
              );

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
            });

            it('proceeds to the next middleware', async () => {
              const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

              const { provider, blockTracker } =
                createProviderAndBlockTracker();
              const engine = createEngine(
                createBlockRefMiddleware({
                  provider,
                  blockTracker,
                }),
                finalMiddleware,
              );

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
            });
          },
        );
      });
    });
  });

  describe('when the RPC method does not take a block parameter', () => {
    it('does not make a direct request through the provider', async () => {
      const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

      const { provider, blockTracker } = createProviderAndBlockTracker();
      const engine = createEngine(
        createBlockRefMiddleware({
          provider,
          blockTracker,
        }),
        finalMiddleware,
      );

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
    });

    it('proceeds to the next middleware', async () => {
      const finalMiddleware = buildFinalMiddlewareWithDefaultResult();

      const { provider, blockTracker } = createProviderAndBlockTracker();
      const engine = createEngine(
        createBlockRefMiddleware({
          provider,
          blockTracker,
        }),
        finalMiddleware,
      );

      stubProviderRequests(provider, [buildStubForBlockNumberRequest('0x100')]);

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
    });
  });
});
