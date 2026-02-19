import {
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  HttpError,
} from '@metamask/controller-utils';
import { errorCodes } from '@metamask/rpc-errors';
import nock from 'nock';

import {
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
} from './rpc-service';
import { RpcServiceChain } from './rpc-service-chain';

/**
 * The number of fetch requests made for a single request to an RPC service, using default max
 * retry attempts.
 */
const DEFAULT_REQUEST_ATTEMPTS = 1 + DEFAULT_MAX_RETRIES;

/**
 * Number of attempts required to break the circuit of an RPC service using default retry attempts
 * and max consecutive failures.
 *
 * Note: This calculation and later ones assume that there is no remainder.
 */
const DEFAULT_RPC_SERVICE_ATTEMPTS_UNTIL_BREAK =
  DEFAULT_MAX_CONSECUTIVE_FAILURES / DEFAULT_REQUEST_ATTEMPTS;

/**
 * Number of attempts required to break the circuit of an RPC service chain (with a single
 * failover) that uses default retry attempts and max consecutive failures.
 *
 * The value is one less than double the number of attempts needed to break a single circuit
 * because on failure of the primary, the request gets forwarded to the failover immediately.
 */
const DEFAULT_RPC_CHAIN_ATTEMPTS_UNTIL_BREAK =
  2 * DEFAULT_RPC_SERVICE_ATTEMPTS_UNTIL_BREAK - 1;

describe('RpcServiceChain', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('onServiceRetry', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onServiceRetryListener = rpcServiceChain.onServiceRetry(() => {
        // do whatever
      });
      expect(onServiceRetryListener.dispose()).toBeUndefined();
    });
  });

  describe('onBreak', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onBreakListener = rpcServiceChain.onBreak(() => {
        // do whatever
      });
      expect(onBreakListener.dispose()).toBeUndefined();
    });
  });

  describe('onServiceBreak', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onServiceBreakListener = rpcServiceChain.onServiceBreak(() => {
        // do whatever
      });
      expect(onServiceBreakListener.dispose()).toBeUndefined();
    });
  });

  describe('onDegraded', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onDegradedListener = rpcServiceChain.onDegraded(() => {
        // do whatever
      });
      expect(onDegradedListener.dispose()).toBeUndefined();
    });
  });

  describe('onServiceDegraded', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onServiceDegradedListener = rpcServiceChain.onServiceDegraded(
        () => {
          // do whatever
        },
      );
      expect(onServiceDegradedListener.dispose()).toBeUndefined();
    });
  });

  describe('onAvailable', () => {
    it('returns a listener which can be disposed', () => {
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://rpc.example.chain',
        },
      ]);

      const onAvailableListener = rpcServiceChain.onAvailable(() => {
        // do whatever
      });
      expect(onAvailableListener.dispose()).toBeUndefined();
    });
  });

  describe('request', () => {
    it('returns what the first RPC service in the chain returns, if it succeeds', async () => {
      nock('https://first.endpoint')
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
          isOffline: (): boolean => false,
          endpointUrl: 'https://first.endpoint',
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://second.endpoint',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
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

    it('returns what a failover service returns, if the primary is unavailable and the failover is not', async () => {
      nock('https://first.endpoint')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock('https://second.endpoint')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
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
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://first.endpoint',
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://second.endpoint',
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://third.chain',
        },
      ]);
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
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
      const firstEndpointScope = nock('https://first.endpoint', {
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
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const secondEndpointScope = nock('https://second.endpoint', {
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
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const thirdEndpointScope = nock('https://third.chain', {
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
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: 'ok',
        });
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://first.endpoint',
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://second.endpoint',
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: 'https://third.chain',
          fetchOptions: {
            referrer: 'https://some.referrer',
          },
        },
      ]);
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
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
      ).rejects.toThrow(expectedError);
      // Retry the first endpoint again, until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow(expectedError);
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow(expectedError);
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(
        rpcServiceChain.request(jsonRpcRequest, fetchOptions),
      ).rejects.toThrow(expectedError);
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      await rpcServiceChain.request(jsonRpcRequest, fetchOptions);

      expect(firstEndpointScope.isDone()).toBe(true);
      expect(secondEndpointScope.isDone()).toBe(true);
      expect(thirdEndpointScope.isDone()).toBe(true);
    });

    it("throws a custom error if a request is attempted while a service's circuit is open", async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onBreak(onBreakListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Attempt the endpoint again.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        'RPC endpoint returned too many errors',
      );
    });

    it('calls onServiceRetry each time an RPC service in the chain retries its request', async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      const tertiaryEndpointUrl = 'https://third.chain';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(tertiaryEndpointUrl)
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
      const expectedError = createResourceUnavailableError(503);
      const expectedRetryError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
          fetchOptions: {
            headers: {
              'X-Foo': 'Bar',
            },
          },
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: tertiaryEndpointUrl,
        },
      ]);
      const onServiceRetryListener = jest.fn(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceRetry(onServiceRetryListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit. This is finally a success.
      await rpcServiceChain.request(jsonRpcRequest);

      for (let attempt = 0; attempt < 24; attempt++) {
        expect(onServiceRetryListener).toHaveBeenNthCalledWith(attempt + 1, {
          primaryEndpointUrl: `${primaryEndpointUrl}/`,
          endpointUrl:
            attempt >= 12
              ? `${secondaryEndpointUrl}/`
              : `${primaryEndpointUrl}/`,
          attempt: (attempt % 4) + 1,
          delay: expect.any(Number),
          error: expectedRetryError,
        });
      }
    });

    it('does not call onBreak if the primary service circuit breaks and the request to its failover fails but its circuit has not broken yet', async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(500);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
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
        createResourceUnavailableError(503),
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        createResourceUnavailableError(503),
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit (unsuccessfully).
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        createResourceUnavailableError(500),
      );

      expect(onBreakListener).not.toHaveBeenCalled();
    });

    it("calls onBreak when all of the RPC services' circuits have broken", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
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
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be retried, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the first endpoint, see that the circuit is broken, and retry the
      // second endpoint, until max retries is hit. The circuit will break on
      // the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );

      expect(onBreakListener).toHaveBeenCalledTimes(1);
      expect(onBreakListener).toHaveBeenCalledWith({
        error: new Error("Fetch failed with status '503'"),
      });
    });

    it("calls onBreak again if all services' circuits break, the primary service responds successfully, and all services' circuits break again", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(primaryEndpointUrl)
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
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(30)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      const onAvailableListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onBreak(onBreakListener);
      rpcServiceChain.onAvailable(onAvailableListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until its circuit breaks, then retry the
      // second endpoint until *its* circuit breaks.
      for (let i = 0; i < DEFAULT_RPC_CHAIN_ATTEMPTS_UNTIL_BREAK; i++) {
        await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
      }
      // Wait until the circuit break duration passes, try the first endpoint
      // and see that it succeeds.
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      await rpcServiceChain.request(jsonRpcRequest);
      // Do it again: retry the first endpoint until its circuit breaks, then
      // retry the second endpoint until *its* circuit breaks.
      for (let i = 0; i < DEFAULT_RPC_CHAIN_ATTEMPTS_UNTIL_BREAK; i++) {
        await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
      }

      expect(onBreakListener).toHaveBeenCalledTimes(2);
      expect(onBreakListener).toHaveBeenNthCalledWith(1, {
        error: new Error("Fetch failed with status '503'"),
      });
      expect(onBreakListener).toHaveBeenNthCalledWith(2, {
        error: new Error("Fetch failed with status '503'"),
      });
    });

    it("calls onBreak again if all services' circuits break, the primary service responds successfully but slowly, and all circuits break again", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(30)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onBreak(onBreakListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until its circuit breaks, then retry the
      // second endpoint until *its* circuit breaks.
      for (let i = 0; i < DEFAULT_RPC_CHAIN_ATTEMPTS_UNTIL_BREAK; i++) {
        await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
      }
      // Wait until the circuit break duration passes, try the first endpoint
      // and see that it succeeds.
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      await rpcServiceChain.request(jsonRpcRequest);
      // Do it again: retry the first endpoint until its circuit breaks, then
      // retry the second endpoint until *its* circuit breaks.
      for (let i = 0; i < DEFAULT_RPC_CHAIN_ATTEMPTS_UNTIL_BREAK; i++) {
        await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
      }

      expect(onBreakListener).toHaveBeenCalledTimes(2);
      expect(onBreakListener).toHaveBeenNthCalledWith(1, {
        error: new Error("Fetch failed with status '503'"),
      });
      expect(onBreakListener).toHaveBeenNthCalledWith(2, {
        error: new Error("Fetch failed with status '503'"),
      });
    });

    it('calls onServiceBreak each time the circuit of an RPC service in the chain breaks', async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      const tertiaryEndpointUrl = 'https://third.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(tertiaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: tertiaryEndpointUrl,
        },
      ]);
      const onServiceBreakListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceBreak(onServiceBreakListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the second endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the second endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the third endpoint will
      // be hit, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the third endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the third endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );

      expect(onServiceBreakListener).toHaveBeenCalledTimes(3);
      expect(onServiceBreakListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${primaryEndpointUrl}/`,
        error: new Error("Fetch failed with status '503'"),
      });
      expect(onServiceBreakListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${secondaryEndpointUrl}/`,
        error: new Error("Fetch failed with status '503'"),
      });
      expect(onServiceBreakListener).toHaveBeenNthCalledWith(3, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${tertiaryEndpointUrl}/`,
        error: new Error("Fetch failed with status '503'"),
      });
    });

    it("calls onDegraded only once even if a service's maximum number of retries is reached multiple times", async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onDegraded(onDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onDegraded only once even if the time to complete a request via a service is continually slow', async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(2)
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
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
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onDegraded(onDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      await rpcServiceChain.request(jsonRpcRequest);
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onDegraded only once even if a service runs out of retries and then responds successfully but slowly, or vice versa', async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(5)
        .reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(5)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onDegraded(onDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the endpoint again, and see that it succeeds.
      await rpcServiceChain.request(jsonRpcRequest);
      // Retry the endpoint again until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
    });

    it('reports only the first RPC method that triggered the degraded condition when different methods fail or respond slowly', async () => {
      const endpointUrl = 'https://some.endpoint';
      // First request: eth_blockNumber runs out of retries (triggers degraded)
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
        })
        .times(5)
        .reply(503);
      // Second request: eth_gasPrice responds slowly (already degraded, no new event)
      nock(endpointUrl)
        .post('/', {
          id: 2,
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 2,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onDegraded(onDegradedListener);

      // eth_blockNumber exhausts retries, triggering degraded
      await expect(
        rpcServiceChain.request({
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_blockNumber',
          params: [],
        }),
      ).rejects.toThrow(expectedError);
      // eth_gasPrice responds slowly, but chain is already degraded
      await rpcServiceChain.request({
        id: 2,
        jsonrpc: '2.0' as const,
        method: 'eth_gasPrice',
        params: [],
      });

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        error: expectedDegradedError,
        rpcMethodName: 'eth_blockNumber',
      });
    });

    it("does not call onDegraded again when the primary service's circuit breaks and its failover responds successfully but slowly", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onBreak(onBreakListener);
      rpcServiceChain.onDegraded(onDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit, albeit slowly.
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
    });

    it("calls onDegraded again when a service's underlying circuit breaks, and then after waiting, the service responds successfully but slowly", async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onDegraded(onDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Wait until the circuit break duration passes, try the endpoint again,
      // and see that it succeeds, but slowly.
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onDegradedListener).toHaveBeenCalledTimes(2);
      expect(onDegradedListener).toHaveBeenNthCalledWith(1, {
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onDegradedListener).toHaveBeenNthCalledWith(2, {
        rpcMethodName: 'eth_chainId',
      });
    });

    it("calls onDegraded again when a failover service's underlying circuit breaks, and then after waiting, the primary responds successfully but slowly", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
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
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the second endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the second endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      // Hit the first endpoint again, and see that it succeeds, but slowly
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onDegradedListener).toHaveBeenCalledTimes(2);
      expect(onDegradedListener).toHaveBeenNthCalledWith(1, {
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onDegradedListener).toHaveBeenNthCalledWith(2, {
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onServiceDegraded each time a service continually runs out of retries (but before its circuit breaks)', async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onServiceDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceDegraded(onServiceDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );

      expect(onServiceDegradedListener).toHaveBeenCalledTimes(2);
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onServiceDegraded each time a service continually responds slowly', async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(2)
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
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
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onServiceDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceDegraded(onServiceDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      await rpcServiceChain.request(jsonRpcRequest);
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onServiceDegradedListener).toHaveBeenCalledTimes(2);
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onServiceDegraded each time a service runs out of retries and then responds successfully but slowly, or vice versa', async () => {
      const endpointUrl = 'https://some.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(5)
        .reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(5)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onServiceDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceDegraded(onServiceDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Try the endpoint again, and see that it succeeds.
      await rpcServiceChain.request(jsonRpcRequest);
      // Retry the endpoint again until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );

      expect(onServiceDegradedListener).toHaveBeenCalledTimes(3);
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(3, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
    });

    it("calls onServiceDegraded again when the primary service's circuit breaks and its failover responds successfully but slowly", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onBreakListener = jest.fn();
      const onServiceDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onBreak(onBreakListener);
      rpcServiceChain.onServiceDegraded(onServiceDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit, albeit slowly.
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onServiceDegradedListener).toHaveBeenCalledTimes(3);
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${primaryEndpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${primaryEndpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(3, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${secondaryEndpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
    });

    it("calls onServiceDegraded again when a service's underlying circuit breaks, and then after waiting, the service responds successfully but slowly", async () => {
      const endpointUrl = 'https://first.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onServiceDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceDegraded(onServiceDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Wait until the circuit break duration passes, try the endpoint again,
      // and see that it succeeds, but slowly.
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onServiceDegradedListener).toHaveBeenCalledTimes(3);
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(3, {
        primaryEndpointUrl: `${endpointUrl}/`,
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
    });

    it("calls onServiceDegraded again when a failover service's underlying circuit breaks, and then after waiting, the primary responds successfully but slowly", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      nock(secondaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      const expectedError = createResourceUnavailableError(503);
      const expectedDegradedError = new HttpError(503);
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onServiceDegradedListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onServiceDegraded(onServiceDegradedListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the second endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      // Retry the second endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      // Hit the first endpoint again, and see that it succeeds, but slowly
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onServiceDegradedListener).toHaveBeenCalledTimes(5);
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(1, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${primaryEndpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(2, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${primaryEndpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(3, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${secondaryEndpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(4, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${secondaryEndpointUrl}/`,
        error: expectedDegradedError,
        rpcMethodName: 'eth_chainId',
      });
      expect(onServiceDegradedListener).toHaveBeenNthCalledWith(5, {
        primaryEndpointUrl: `${primaryEndpointUrl}/`,
        endpointUrl: `${primaryEndpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onAvailable only once, even if a service continually responds successfully', async () => {
      const endpointUrl = 'https://first.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(3)
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: '0x1',
        });
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onAvailableListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onAvailable(onAvailableListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      await rpcServiceChain.request(jsonRpcRequest);
      await rpcServiceChain.request(jsonRpcRequest);
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onAvailableListener).toHaveBeenCalledTimes(1);
      expect(onAvailableListener).toHaveBeenCalledWith({});
    });

    it("calls onAvailable once, after the primary service's circuit has broken, the request to the failover succeeds", async () => {
      const primaryEndpointUrl = 'https://first.endpoint';
      const secondaryEndpointUrl = 'https://second.endpoint';
      nock(primaryEndpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(DEFAULT_MAX_CONSECUTIVE_FAILURES)
        .reply(503);
      nock(secondaryEndpointUrl)
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
          isOffline: (): boolean => false,
          endpointUrl: primaryEndpointUrl,
        },
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl: secondaryEndpointUrl,
        },
      ]);
      const onAvailableListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onAvailable(onAvailableListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Retry the first endpoint until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        createResourceUnavailableError(503),
      );
      // Retry the first endpoint again, until max retries is hit.
      await expect(rpcServiceChain.request(jsonRpcRequest)).rejects.toThrow(
        createResourceUnavailableError(503),
      );
      // Retry the first endpoint for a third time, until max retries is hit.
      // The circuit will break on the last time, and the second endpoint will
      // be hit.
      await rpcServiceChain.request(jsonRpcRequest);

      expect(onAvailableListener).toHaveBeenCalledTimes(1);
      expect(onAvailableListener).toHaveBeenNthCalledWith(1, {});
    });

    it('calls onAvailable when a service becomes degraded by responding slowly, and then recovers', async () => {
      const endpointUrl = 'https://first.endpoint';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: '0x1',
        });
      const rpcServiceChain = new RpcServiceChain([
        {
          fetch,
          btoa,
          isOffline: (): boolean => false,
          endpointUrl,
        },
      ]);
      const onDegradedListener = jest.fn();
      const onAvailableListener = jest.fn();
      rpcServiceChain.onServiceRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      rpcServiceChain.onDegraded(onDegradedListener);
      rpcServiceChain.onAvailable(onAvailableListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      await rpcServiceChain.request(jsonRpcRequest);
      await rpcServiceChain.request(jsonRpcRequest);

      // Verify degradation occurred after the first (slow) request
      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        rpcMethodName: 'eth_chainId',
      });

      // Verify recovery occurred after the second (fast) request
      expect(onAvailableListener).toHaveBeenCalledTimes(1);
      expect(onAvailableListener).toHaveBeenCalledWith({});

      // Verify onDegraded was called before onAvailable (degradation then recovery)
      expect(onDegradedListener.mock.invocationCallOrder[0]).toBeLessThan(
        onAvailableListener.mock.invocationCallOrder[0],
      );
    });
  });
});

/**
 * Creates a "resource unavailable" RPC error for testing.
 *
 * @param httpStatus - The HTTP status that the error represents.
 * @returns The RPC error.
 */
function createResourceUnavailableError(httpStatus: number): Error {
  return expect.objectContaining({
    code: errorCodes.rpc.resourceUnavailable,
    message: 'RPC endpoint not found or unavailable.',
    data: {
      httpStatus,
    },
  });
}
