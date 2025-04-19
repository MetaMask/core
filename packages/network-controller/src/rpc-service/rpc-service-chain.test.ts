import nock from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import { RpcServiceChain } from './rpc-service-chain';

describe('RpcServiceChain', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('onRetry', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onRetryListener = rpcServiceChain.onRetry(() => {
        // do whatever
      });
      expect(onRetryListener.dispose()).toBeUndefined();
    });
  });

  describe('onBreak', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onBreakListener = rpcServiceChain.onBreak(() => {
        // do whatever
      });
      expect(onBreakListener.dispose()).toBeUndefined();
    });
  });

  describe('onDegraded', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onDegradedListener = rpcServiceChain.onDegraded(() => {
        // do whatever
      });
      expect(onDegradedListener.dispose()).toBeUndefined();
    });
  });

  describe('request', () => {
    it('returns what the first RPC service in the chain returns, if it succeeds', async () => {
      nock('https://first.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: 'ok',
        });

      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://first.chain',
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://second.chain',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://third.chain',
        },
      ]);

      const response = await rpcServiceChain.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });
    });

    it('uses the other RPC services in the chain as failovers', async () => {
      nock('https://first.chain')
        .post(
          '/',
          {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          },
          {
            reqheaders: {},
          },
        )
        .times(15)
        .reply(503);
      nock('https://second.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://third.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: 'ok',
        });

      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://first.chain',
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://second.chain',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://third.chain',
        },
      ]);
      rpcServiceChain.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      const response = await rpcServiceChain.request(jsonRpcRequest);

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });
    });

    it("allows each RPC service's fetch options to be configured separately, yet passes the fetch options given to request to all of them", async () => {
      const firstEndpointScope = nock('https://first.chain', {
        reqheaders: {
          'X-Fizz': 'Buzz',
        },
      })
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      const secondEndpointScope = nock('https://second.chain', {
        reqheaders: {
          'X-Foo': 'Bar',
          'X-Fizz': 'Buzz',
        },
      })
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      const thirdEndpointScope = nock('https://third.chain', {
        reqheaders: {
          'X-Foo': 'Bar',
          'X-Fizz': 'Buzz',
        },
      })
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: 'ok',
        });

      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://first.chain',
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://second.chain',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://third.chain',
          fetchOptions: {
            referrer: 'https://some.referrer',
          },
        },
      ]);
      rpcServiceChain.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      const fetchOptions = {
        headers: {
          'X-Fizz': 'Buzz',
        },
      };
      // Retry the first endpoint until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow('Gateway timeout');
      // Retry the first endpoint again, until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow('Gateway timeout');
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow('Gateway timeout');
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow('Gateway timeout');
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      await rpcServiceChain.request(jsonRpcRequest, fetchOptions);

      expect(firstEndpointScope.isDone()).toBe(true);
      expect(secondEndpointScope.isDone()).toBe(true);
      expect(thirdEndpointScope.isDone()).toBe(true);
    });

    it('calls onRetry each time an RPC service in the chain retries its request', async () => {
      nock('https://first.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://second.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://third.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: 'ok',
        });

      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://first.chain',
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://second.chain',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://third.chain',
        },
      ]);
      const onRetryListener = jest.fn<
        ReturnType<Parameters<RpcServiceChain['onRetry']>[0]>,
        Parameters<Parameters<RpcServiceChain['onRetry']>[0]>
      >(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });
      rpcServiceChain.onRetry(onRetryListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      await rpcServiceChain.request(jsonRpcRequest);

      const onRetryListenerCallCountsByEndpointUrl =
        onRetryListener.mock.calls.reduce(
          (memo, call) => {
            const { endpointUrl } = call[0];
            // There is nothing wrong with this.
            // eslint-disable-next-line jest/no-conditional-in-test
            memo[endpointUrl] = (memo[endpointUrl] ?? 0) + 1;
            return memo;
          },
          {} as Record<string, number>,
        );

      expect(onRetryListenerCallCountsByEndpointUrl).toStrictEqual({
        'https://first.chain/': 12,
        'https://second.chain/': 12,
      });
    });

    it('calls onBreak each time the underlying circuit for each RPC service in the chain breaks', async () => {
      nock('https://first.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://second.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://third.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: 'ok',
        });

      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://first.chain',
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://second.chain',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://third.chain',
        },
      ]);
      const onBreakListener = jest.fn<
        ReturnType<Parameters<RpcServiceChain['onBreak']>[0]>,
        Parameters<Parameters<RpcServiceChain['onBreak']>[0]>
      >();
      rpcServiceChain.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });
      rpcServiceChain.onBreak(onBreakListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onBreakListener).toHaveBeenCalledTimes(2);
      expect(onBreakListener).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          endpointUrl: 'https://first.chain/',
        }),
      );
      expect(onBreakListener).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          endpointUrl: 'https://second.chain/',
        }),
      );
    });

    it('calls onDegraded each time an RPC service in the chain gives up before the circuit breaks or responds successfully but slowly', async () => {
      nock('https://first.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://second.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock('https://third.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          clock.tick(6000);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });

      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          endpointUrl: 'https://first.chain',
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://second.chain',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          endpointUrl: 'https://third.chain',
        },
      ]);
      const onDegradedListener = jest.fn<
        ReturnType<Parameters<RpcServiceChain['onDegraded']>[0]>,
        Parameters<Parameters<RpcServiceChain['onDegraded']>[0]>
      >();
      rpcServiceChain.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });
      rpcServiceChain.onDegraded(onDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'Gateway timeout',
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      await rpcServiceChain.request(jsonRpcRequest);

      const onDegradedListenerCallCountsByEndpointUrl =
        onDegradedListener.mock.calls.reduce(
          (memo: Record<string, number>, call) => {
            const { endpointUrl } = call[0];
            // There is nothing wrong with this.
            // eslint-disable-next-line jest/no-conditional-in-test
            memo[endpointUrl] = (memo[endpointUrl] ?? 0) + 1;
            return memo;
          },
          {},
        );

      expect(onDegradedListenerCallCountsByEndpointUrl).toStrictEqual({
        'https://first.chain/': 2,
        'https://second.chain/': 2,
        'https://third.chain/': 1,
      });
    });
  });
});
