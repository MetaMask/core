import {
  JsonRpcEngineV2,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import type { Hex, Json } from '@metamask/utils';

import { createBlockCacheMiddleware } from '.';
import {
  createProviderAndBlockTracker,
  createRequest,
  stubProviderRequests,
} from '../test/util/helpers';

describe('block cache middleware', () => {
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

  it('throws error when no blockTracker is provided', () => {
    expect(() => createBlockCacheMiddleware()).toThrow(
      'createBlockCacheMiddleware - No PollingBlockTracker specified',
    );
  });

  describe('request handling', () => {
    it('skips caching when request has skipCache flag', async () => {
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<'0x1'> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234'],
      });

      const context = new MiddlewareContext<{ skipCache?: boolean }>([
        ['skipCache', true],
      ]);

      const result1 = await engine.handle(request, { context });
      const result2 = await engine.handle(request, { context });

      expect(hitCount).toBe(2);
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x2');
    });

    it('skips caching methods with Never strategy', async () => {
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      // eth_sendTransaction is a method that is not cacheable
      const request = createRequest({
        method: 'eth_sendTransaction',
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(2);
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x2');
    });

    it('skips caching requests with pending blockTag', async () => {
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234', 'pending'],
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(2);
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x2');
    });

    it('caches requests with cacheable method and valid blockTag', async () => {
      const getLatestBlockSpy = jest.spyOn(blockTracker, 'getLatestBlock');
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234', 'latest'],
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(1);
      expect(getLatestBlockSpy).toHaveBeenCalledTimes(2);
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x1');
    });

    it('defaults cacheable request block tags to "latest"', async () => {
      const getLatestBlockSpy = jest.spyOn(blockTracker, 'getLatestBlock');
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234'],
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(1);
      expect(getLatestBlockSpy).toHaveBeenCalledTimes(2);
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x1');
    });

    it('caches requests with "earliest" block tag', async () => {
      const getLatestBlockSpy = jest.spyOn(blockTracker, 'getLatestBlock');
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234', 'earliest'],
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(1);
      expect(getLatestBlockSpy).not.toHaveBeenCalled();
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x1');
    });

    it('caches requests with hex block tag', async () => {
      const getLatestBlockSpy = jest.spyOn(blockTracker, 'getLatestBlock');
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x2'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234', '0x2'],
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(1);
      expect(getLatestBlockSpy).not.toHaveBeenCalled();
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x1');
    });
  });

  describe('cache strategy edge cases', () => {
    // `undefined` is also an empty value, but returning that causes the engine to throw
    it.each([null, '\u003cnil\u003e'])(
      'skips caching "empty" result values: %s',
      async (emptyValue) => {
        stubProviderRequests(provider, [
          {
            request: { method: 'eth_blockNumber' },
            result: (): Promise<Hex> => Promise.resolve('0x1'),
          },
        ]);

        let hitCount = 0;
        const engine = JsonRpcEngineV2.create({
          middleware: [
            createBlockCacheMiddleware({ blockTracker }),
            (): string | null => {
              hitCount += 1;
              return emptyValue;
            },
          ],
        });

        const request = createRequest({
          method: 'eth_getBalance',
          params: ['0x1234'],
        });

        const result1 = await engine.handle(request);
        const result2 = await engine.handle(request);

        expect(hitCount).toBe(2);
        expect(result1).toBe(emptyValue);
        expect(result2).toBe(emptyValue);
      },
    );

    describe.each(['eth_getTransactionByHash', 'eth_getTransactionReceipt'])(
      'skips caching results for %s without blockHash',
      (method) => {
        it.each([
          null,
          {},
          { blockHash: null },
          {
            blockHash:
              '0x0000000000000000000000000000000000000000000000000000000000000000',
          },
        ] as Json[])('%o', async (expectedResult) => {
          stubProviderRequests(provider, [
            {
              request: { method: 'eth_blockNumber' },
              result: (): Promise<Hex> => Promise.resolve('0x1'),
            },
          ]);

          let hitCount = 0;
          const engine = JsonRpcEngineV2.create({
            middleware: [
              createBlockCacheMiddleware({ blockTracker }),
              (): Json => {
                hitCount += 1;
                return expectedResult;
              },
            ],
          });

          const request = createRequest({
            method,
            params: ['0x123'],
          });

          const result1 = await engine.handle(request);
          const result2 = await engine.handle(request);

          expect(hitCount).toBe(2);
          expect(result1).toBe(expectedResult);
          expect(result2).toBe(expectedResult);
        });
      },
    );

    it('clears old block numbers from cache when handling "latest" requests', async () => {
      const getLatestBlockSpy = jest
        .spyOn(blockTracker, 'getLatestBlock')
        .mockResolvedValueOnce('0x1')
        .mockResolvedValueOnce('0x2');
      stubProviderRequests(provider, [
        {
          request: { method: 'eth_blockNumber' },
          result: (): Promise<Hex> => Promise.resolve('0x1'),
        },
      ]);

      let hitCount = 0;
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockCacheMiddleware({ blockTracker }),
          (): Hex => {
            hitCount += 1;
            return `0x${hitCount}`;
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getBalance',
        params: ['0x1234', 'latest'],
      });

      const result1 = await engine.handle(request);
      const result2 = await engine.handle(request);

      expect(hitCount).toBe(2);
      expect(getLatestBlockSpy).toHaveBeenCalledTimes(2);
      expect(result1).toBe('0x1');
      expect(result2).toBe('0x2');
    });
  });
});
