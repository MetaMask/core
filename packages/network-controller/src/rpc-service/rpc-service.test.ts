import {
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  HttpError,
} from '@metamask/controller-utils';
import { errorCodes } from '@metamask/rpc-errors';
import { CircuitState } from 'cockatiel';
import deepFreeze from 'deep-freeze-strict';
import nock from 'nock';
import { FetchError } from 'node-fetch';

import {
  CUSTOM_RPC_ERRORS,
  DEFAULT_MAX_RETRIES,
  RpcService,
} from './rpc-service';

describe('RpcService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('resetPolicy', () => {
    it('resets the state of the circuit to "closed"', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
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
          result: 'ok',
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Get through the first two rounds of retries
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await ignoreRejection(service.request(jsonRpcRequest));
      expect(service.getCircuitState()).toBe(CircuitState.Open);

      service.resetPolicy();

      expect(service.getCircuitState()).toBe(CircuitState.Closed);
    });

    it('allows making a successful request to the service if its circuit has broken', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
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
          result: 'ok',
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Get through the first two rounds of retries
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await ignoreRejection(service.request(jsonRpcRequest));

      service.resetPolicy();

      expect(await service.request(jsonRpcRequest)).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });
    });

    it('calls onAvailable listeners if the service was executed successfully, its circuit broke, it was reset, and executes successfully again', async () => {
      const endpointUrl = 'https://rpc.example.chain';
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
          result: 'ok',
        });
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
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
          result: 'ok',
        });
      const onAvailableListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      service.onAvailable(onAvailableListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };

      // Make a successful requst
      await service.request(jsonRpcRequest);
      expect(onAvailableListener).toHaveBeenCalledTimes(1);

      // Get through the first two rounds of retries
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await ignoreRejection(service.request(jsonRpcRequest));

      service.resetPolicy();

      // Make another successful requst
      await service.request(jsonRpcRequest);
      expect(onAvailableListener).toHaveBeenCalledTimes(2);
    });

    it('allows making an unsuccessful request to the service if its circuit has broken', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(500);
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      // Get through the first two rounds of retries
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await ignoreRejection(service.request(jsonRpcRequest));

      service.resetPolicy();

      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        'RPC endpoint not found or unavailable',
      );
    });

    it('does not call onBreak listeners', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(15)
        .reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(500);
      const onBreakListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      service.onBreak(onBreakListener);

      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };

      // Get through the first two rounds of retries
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await ignoreRejection(service.request(jsonRpcRequest));
      expect(onBreakListener).toHaveBeenCalledTimes(1);

      service.resetPolicy();
      expect(onBreakListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCircuitState', () => {
    it('returns the state of the underlying circuit', async () => {
      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl).post('/', jsonRpcRequest).times(15).reply(503);
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(500);
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      expect(service.getCircuitState()).toBe(CircuitState.Closed);

      // Retry until we break the circuit
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      expect(service.getCircuitState()).toBe(CircuitState.Open);

      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      const promise = ignoreRejection(service.request(jsonRpcRequest));
      expect(service.getCircuitState()).toBe(CircuitState.HalfOpen);
      await promise;
      expect(service.getCircuitState()).toBe(CircuitState.Open);
    });
  });

  describe('request', () => {
    // NOTE: Keep this list synced with CONNECTION_ERRORS
    describe.each([
      {
        constructorName: 'TypeError',
        message: 'network error',
      },
      {
        constructorName: 'TypeError',
        message: 'Failed to fetch',
      },
      {
        constructorName: 'TypeError',
        message: 'NetworkError when attempting to fetch resource.',
      },
      {
        constructorName: 'TypeError',
        message: 'The Internet connection appears to be offline.',
      },
      {
        constructorName: 'TypeError',
        message: 'Load failed',
      },
      {
        constructorName: 'TypeError',
        message: 'Network request failed',
      },
      {
        constructorName: 'FetchError',
        message: 'request to https://foo.com failed',
      },
      {
        constructorName: 'TypeError',
        message: 'fetch failed',
      },
      {
        constructorName: 'TypeError',
        message: 'terminated',
      },
    ])(
      `if making the request throws the "$message" error`,
      ({ constructorName, message }) => {
        let error;
        switch (constructorName) {
          case 'FetchError':
            error = new FetchError(message, 'system');
            break;
          case 'TypeError':
            error = new TypeError(message);
            break;
          default:
            throw new Error(`Unknown constructor ${constructorName}`);
        }
        testsForRetriableFetchErrors({
          producedError: error,
          expectedError: error,
        });
      },
    );

    describe.each(['ETIMEDOUT', 'ECONNRESET'])(
      'if making the request throws a "%s" error',
      (errorCode) => {
        const error = new Error('timed out');
        // @ts-expect-error `code` does not exist on the Error type, but is
        // still used by Node.
        error.code = errorCode;

        testsForRetriableFetchErrors({
          producedError: error,
          expectedError: error,
        });
      },
    );

    describe('if the endpoint URL was not mocked via Nock', () => {
      testsForNonRetriableErrors({
        expectedError: 'Nock: Disallowed net connect',
      });
    });

    describe('if the endpoint URL was mocked via Nock, but not the RPC method', () => {
      testsForNonRetriableErrors({
        beforeCreateService: ({ endpointUrl }) => {
          nock(endpointUrl)
            .post('/', {
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_incorrectMethod',
              params: [],
            })
            .reply(500);
        },
        rpcMethod: 'eth_chainId',
        expectedError: 'Nock: No match for request',
      });
    });

    describe('if making the request throws an unknown error', () => {
      testsForNonRetriableErrors({
        createService: ({ endpointUrl, expectedError }) => {
          return new RpcService({
            fetch: (): never => {
              // This error could be anything.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw expectedError;
            },
            btoa,
            endpointUrl,
            isOffline: (): boolean => false,
          });
        },
        expectedError: new Error('oops'),
      });
    });

    describe.each([502, 503, 504])(
      'if the endpoint has a %d response',
      (httpStatus) => {
        testsForRetriableResponses({
          httpStatus,
          expectedError: expect.objectContaining({
            code: errorCodes.rpc.resourceUnavailable,
            message: 'RPC endpoint not found or unavailable.',
            data: {
              httpStatus,
            },
          }),
          expectedOnBreakError: new HttpError(httpStatus),
        });
      },
    );

    describe('if the endpoint has a 401 response', () => {
      testsForNonRetriableErrors({
        beforeCreateService: ({ endpointUrl, rpcMethod }) => {
          nock(endpointUrl)
            .post('/', {
              id: 1,
              jsonrpc: '2.0',
              method: rpcMethod,
              params: [],
            })
            .reply(401);
        },
        expectedError: expect.objectContaining({
          code: CUSTOM_RPC_ERRORS.unauthorized,
          message: 'Unauthorized.',
          data: {
            httpStatus: 401,
          },
        }),
      });
    });

    describe.each([402, 404, 500, 501, 505, 506, 507, 508, 510, 511])(
      'if the endpoint has a %d response',
      (httpStatus) => {
        testsForNonRetriableErrors({
          beforeCreateService: ({ endpointUrl, rpcMethod }) => {
            nock(endpointUrl)
              .post('/', {
                id: 1,
                jsonrpc: '2.0',
                method: rpcMethod,
                params: [],
              })
              .reply(httpStatus);
          },
          expectedError: expect.objectContaining({
            code: errorCodes.rpc.resourceUnavailable,
            message: 'RPC endpoint not found or unavailable.',
            data: {
              httpStatus,
            },
          }),
        });
      },
    );

    describe('if the endpoint has a 429 response', () => {
      const httpStatus = 429;

      testsForNonRetriableErrors({
        beforeCreateService: ({ endpointUrl, rpcMethod }) => {
          nock(endpointUrl)
            .post('/', {
              id: 1,
              jsonrpc: '2.0',
              method: rpcMethod,
              params: [],
            })
            .reply(httpStatus);
        },
        expectedError: expect.objectContaining({
          code: errorCodes.rpc.limitExceeded,
          message: 'Request is being rate limited.',
          data: {
            httpStatus,
          },
        }),
      });
    });

    describe('when the endpoint has a 4xx response that is not 401, 402, 404, or 429', () => {
      const httpStatus = 422;

      testsForNonRetriableErrors({
        beforeCreateService: ({ endpointUrl, rpcMethod }) => {
          nock(endpointUrl)
            .post('/', {
              id: 1,
              jsonrpc: '2.0',
              method: rpcMethod,
              params: [],
            })
            .reply(httpStatus);
        },
        expectedError: expect.objectContaining({
          code: CUSTOM_RPC_ERRORS.httpClientError,
          message: 'RPC endpoint returned HTTP client error.',
          data: {
            httpStatus,
          },
        }),
      });
    });

    describe.each([
      'invalid JSON',
      '{"foo": "ba',
      '<p>Clearly an HTML response</p>',
    ])(
      'if the endpoint consistently responds with invalid JSON %o',
      (responseBody) => {
        testsForRetriableResponses({
          httpStatus: 200,
          responseBody,
          expectedError: expect.objectContaining({
            code: -32700,
            message: 'RPC endpoint did not return JSON.',
          }),
          expectedOnBreakError: expect.objectContaining({
            message: expect.stringContaining('invalid json'),
          }),
        });
      },
    );

    describe('when offline', () => {
      it('does not retry when offline, only makes one fetch call', async () => {
        const expectedError = new TypeError('Failed to fetch');
        const mockFetch = jest.fn(() => {
          throw expectedError;
        });
        const service = new RpcService({
          fetch: mockFetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
          isOffline: (): boolean => true,
        });
        service.onRetry(() => {
          jest.advanceTimersToNextTimer();
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await expect(service.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
        // When offline, no retries should happen, so only 1 fetch call
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('does not call onDegraded when offline', async () => {
        const expectedError = new TypeError('Failed to fetch');
        const mockFetch = jest.fn(() => {
          throw expectedError;
        });
        const endpointUrl = 'https://rpc.example.chain';
        const onDegradedListener = jest.fn();
        const service = new RpcService({
          fetch: mockFetch,
          btoa,
          endpointUrl,
          isOffline: (): boolean => true,
        });
        service.onRetry(() => {
          jest.advanceTimersToNextTimer();
        });
        service.onDegraded(onDegradedListener);

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await expect(service.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );

        // When offline, retries don't happen, so onDegraded should not be called
        expect(onDegradedListener).not.toHaveBeenCalled();
      });

      it('does not call onBreak when offline', async () => {
        const expectedError = new TypeError('Failed to fetch');
        const mockFetch = jest.fn(() => {
          throw expectedError;
        });
        const endpointUrl = 'https://rpc.example.chain';
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch: mockFetch,
          btoa,
          endpointUrl,
          isOffline: (): boolean => true,
        });
        service.onRetry(() => {
          jest.advanceTimersToNextTimer();
        });
        service.onBreak(onBreakListener);

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        // Make multiple requests - even though we'd normally break the circuit,
        // when offline, no retries happen so circuit won't break
        await expect(service.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
        await expect(service.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );
        await expect(service.request(jsonRpcRequest)).rejects.toThrow(
          expectedError,
        );

        // When offline, retries don't happen, so circuit won't break and onBreak
        // should not be called
        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    it('removes non-JSON-RPC-compliant properties from the request body before sending it to the endpoint', async () => {
      const endpointUrl = 'https://rpc.example.chain';
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
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });

      // @ts-expect-error Intentionally passing bad input.
      const response = await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        some: 'extra',
        properties: 'here',
      });

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      });
    });

    it('extracts a username and password from the URL to the Authorization header', async () => {
      const scope = nock('https://rpc.example.chain', {
        reqheaders: {
          Authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
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
          result: '0x1',
        });
      const promiseForRequestUrl = new Promise<string>((resolve) => {
        scope.on('request', (request) => {
          resolve(request.options.href);
        });
      });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://username:password@rpc.example.chain',
        isOffline: (): boolean => false,
      });

      const response = await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      });
      expect(await promiseForRequestUrl).toBe('https://rpc.example.chain/');
    });

    it('makes the request with Accept and Content-Type headers by default', async () => {
      const scope = nock('https://rpc.example.chain', {
        reqheaders: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
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
          result: '0x1',
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://username:password@rpc.example.chain',
        isOffline: (): boolean => false,
      });

      await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(scope.isDone()).toBe(true);
    });

    it('mixes the given request options into the default request options', async () => {
      const scope = nock('https://rpc.example.chain', {
        reqheaders: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Foo': 'Bar',
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
          result: '0x1',
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://username:password@rpc.example.chain',
        isOffline: (): boolean => false,
      });

      await service.request(
        {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        },
        {
          headers: {
            'X-Foo': 'Bar',
          },
        },
      );

      expect(scope.isDone()).toBe(true);
    });

    it('returns the JSON-decoded response if the request succeeds', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['0x68b3', false],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: {
            number: '0x68b3',
            hash: '0xd5f1812548be429cbdc6376b29611fc49e06f1359758c4ceaaa3b393e2239f9c',
            nonce: '0x378da40ff335b070',
            gasLimit: '0x47e7c4',
            gasUsed: '0x37993',
            timestamp: '0x5835c54d',
            transactions: [
              '0xa0807e117a8dd124ab949f460f08c36c72b710188f01609595223b325e58e0fc',
              '0xeae6d797af50cb62a596ec3939114d63967c374fa57de9bc0f4e2b576ed6639d',
            ],
            baseFeePerGas: '0x7',
          },
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });

      const response = await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['0x68b3', false],
      });

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: {
          number: '0x68b3',
          hash: '0xd5f1812548be429cbdc6376b29611fc49e06f1359758c4ceaaa3b393e2239f9c',
          nonce: '0x378da40ff335b070',
          gasLimit: '0x47e7c4',
          gasUsed: '0x37993',
          timestamp: '0x5835c54d',
          transactions: [
            '0xa0807e117a8dd124ab949f460f08c36c72b710188f01609595223b325e58e0fc',
            '0xeae6d797af50cb62a596ec3939114d63967c374fa57de9bc0f4e2b576ed6639d',
          ],
          baseFeePerGas: '0x7',
        },
      });
    });

    it('handles deeply frozen JSON-RPC requests', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
        })
        .reply(200, {
          id: 1,
          jsonrpc: '2.0',
          result: '0x1',
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });

      const response = await service.request(
        deepFreeze({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
        }),
      );

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: '0x1',
      });
    });

    it('does not throw if the endpoint returns an unsuccessful JSON-RPC response', async () => {
      const endpointUrl = 'https://rpc.example.chain';
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
          error: {
            code: -32000,
            message: 'oops',
          },
        });
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });

      const response = await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'oops',
        },
      });
    });

    it('calls the onDegraded callback if the endpoint takes more than 5 seconds to respond', async () => {
      const endpointUrl = 'https://rpc.example.chain';
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
      const onDegradedListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onDegraded(onDegradedListener);

      await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
      expect(onDegradedListener).toHaveBeenCalledWith({
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_chainId',
      });
    });

    it('calls onDegraded twice with the correct rpcMethodName when two concurrent requests to different methods both respond slowly', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
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
            result: '0x100',
          };
        });
      const onDegradedListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onDegraded(onDegradedListener);

      // Start both requests concurrently
      await Promise.all([
        service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
        }),
        service.request({
          id: 2,
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
        }),
      ]);

      expect(onDegradedListener).toHaveBeenCalledTimes(2);
      expect(onDegradedListener).toHaveBeenCalledWith({
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_blockNumber',
      });
      expect(onDegradedListener).toHaveBeenCalledWith({
        endpointUrl: `${endpointUrl}/`,
        rpcMethodName: 'eth_gasPrice',
      });
    });

    it('calls onDegraded twice with the correct rpcMethodName when two concurrent requests to different methods fail — one slow, one retriable', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      // eth_blockNumber: responds slowly
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
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
      // eth_gasPrice: retries exhausted (5 x 503)
      nock(endpointUrl)
        .post('/', {
          id: 2,
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
        })
        .times(5)
        .reply(503);
      const onDegradedListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      service.onDegraded(onDegradedListener);

      // Start both requests concurrently
      await Promise.allSettled([
        service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
        }),
        service.request({
          id: 2,
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
        }),
      ]);

      expect(onDegradedListener).toHaveBeenCalledTimes(2);
      expect(onDegradedListener).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          rpcMethodName: 'eth_blockNumber',
        }),
      );
      expect(onDegradedListener).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          rpcMethodName: 'eth_gasPrice',
        }),
      );
    });

    it('calls the onAvailable callback the first time a successful request occurs', async () => {
      const endpointUrl = 'https://rpc.example.chain';
      nock(endpointUrl)
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const onAvailableListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onAvailable(onAvailableListener);

      await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(onAvailableListener).toHaveBeenCalledTimes(1);
      expect(onAvailableListener).toHaveBeenCalledWith({
        endpointUrl: `${endpointUrl}/`,
      });
    });

    it('calls the onAvailable callback if the endpoint takes more than 5 seconds to respond and then speeds up again', async () => {
      const endpointUrl = 'https://rpc.example.chain';
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
        })
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .reply(200, () => {
          return {
            id: 1,
            jsonrpc: '2.0',
            result: '0x1',
          };
        });
      const onAvailableListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        isOffline: (): boolean => false,
      });
      service.onAvailable(onAvailableListener);

      await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });
      await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(onAvailableListener).toHaveBeenCalledTimes(1);
      expect(onAvailableListener).toHaveBeenCalledWith({
        endpointUrl: `${endpointUrl}/`,
      });
    });
  });
});

/**
 * Some tests involve a rejected promise that is not necessarily the focus of
 * the test. In these cases we don't want to ignore the error in case the
 * promise _isn't_ rejected, but we don't want to highlight the assertion,
 * either.
 *
 * @param promiseOrFn - A promise that rejects, or a function that returns a
 * promise that rejects.
 */
async function ignoreRejection<Type>(
  promiseOrFn: Promise<Type> | (() => Type | Promise<Type>),
): Promise<void> {
  await expect(promiseOrFn).rejects.toThrow(expect.any(Error));
}

/**
 * These are tests that exercise logic for cases in which the request cannot be
 * made because some kind of error is thrown, and the request is not retried.
 *
 * @param args - The arguments.
 * @param args.beforeCreateService - A function that is run before the service
 * is created.
 * @param args.createService - A function that is run to create the service.
 * @param args.endpointUrl - The URL that is hit.
 * @param args.rpcMethod - The RPC method that is used. (Defaults to
 * `eth_chainId`).
 * @param args.expectedError - The error that a call to the service's `request`
 * method is expected to produce.
 */
function testsForNonRetriableErrors({
  beforeCreateService = (): void => {
    // do nothing
  },
  createService = (args): RpcService => {
    return new RpcService({
      fetch,
      btoa,
      endpointUrl: args.endpointUrl,
      isOffline: (): boolean => false,
    });
  },
  endpointUrl = 'https://rpc.example.chain',
  rpcMethod = `eth_chainId`,
  expectedError,
}: {
  beforeCreateService?: (args: {
    endpointUrl: string;
    rpcMethod: string;
  }) => void;
  createService?: (args: {
    endpointUrl: string;
    expectedError: string | RegExp | Error | jest.Constructable | undefined;
  }) => RpcService;
  endpointUrl?: string;
  rpcMethod?: string;
  expectedError: string | RegExp | Error | jest.Constructable | undefined;
}): void {
  /* eslint-disable jest/require-top-level-describe */

  it('re-throws the error without retrying the request', async () => {
    beforeCreateService({ endpointUrl, rpcMethod });
    const service = createService({ endpointUrl, expectedError });

    const promise = service.request({
      id: 1,
      jsonrpc: '2.0',
      method: rpcMethod,
      params: [],
    });

    await expect(promise).rejects.toThrow(expectedError);
  });

  it('does not call onRetry', async () => {
    beforeCreateService({ endpointUrl, rpcMethod });
    const onRetryListener = jest.fn();
    const service = createService({ endpointUrl, expectedError });
    service.onRetry(onRetryListener);

    await ignoreRejection(
      service.request({
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      }),
    );
    expect(onRetryListener).not.toHaveBeenCalled();
  });

  it('does not call onBreak', async () => {
    beforeCreateService({ endpointUrl, rpcMethod });
    const onBreakListener = jest.fn();
    const service = createService({ endpointUrl, expectedError });
    service.onBreak(onBreakListener);

    await ignoreRejection(
      service.request({
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      }),
    );
    expect(onBreakListener).not.toHaveBeenCalled();
  });

  it('does not call onDegraded', async () => {
    beforeCreateService({ endpointUrl, rpcMethod });
    const onDegradedListener = jest.fn();
    const service = createService({ endpointUrl, expectedError });
    service.onDegraded(onDegradedListener);

    await ignoreRejection(
      service.request({
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      }),
    );
    expect(onDegradedListener).not.toHaveBeenCalled();
  });

  it('does not call onAvailable', async () => {
    beforeCreateService({ endpointUrl, rpcMethod });
    const onAvailableListener = jest.fn();
    const service = createService({ endpointUrl, expectedError });
    service.onAvailable(onAvailableListener);

    await ignoreRejection(
      service.request({
        id: 1,
        jsonrpc: '2.0',
        method: rpcMethod,
        params: [],
      }),
    );
    expect(onAvailableListener).not.toHaveBeenCalled();
  });

  /* eslint-enable jest/require-top-level-describe */
}

/**
 * These are tests that exercise logic for cases in which the request cannot be
 * made because the `fetch` calls throws a specific error.
 *
 * @param args - The arguments
 * @param args.producedError - The error produced when `fetch` is called.
 * @param args.expectedError - The error that a call to the service's `request`
 * method is expected to produce.
 */
function testsForRetriableFetchErrors({
  producedError,
  expectedError,
}: {
  producedError: Error;
  expectedError: string | jest.Constructable | RegExp | Error;
}): void {
  // This function is designed to be used inside of a describe, so this won't be
  // a problem in practice.
  /* eslint-disable jest/require-top-level-describe */

  it('retries a constantly failing request up to 4 more times before re-throwing the error, if `request` is only called once', async () => {
    const mockFetch = jest.fn(() => {
      throw producedError;
    });
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('calls the onDegraded callback once for each retry round', async () => {
    const mockFetch = jest.fn(() => {
      throw producedError;
    });
    const endpointUrl = 'https://rpc.example.chain';
    const onDegradedListener = jest.fn();
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    service.onDegraded(onDegradedListener);

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await ignoreRejection(service.request(jsonRpcRequest));

    expect(onDegradedListener).toHaveBeenCalledTimes(2);
    expect(onDegradedListener).toHaveBeenCalledWith({
      endpointUrl: `${endpointUrl}/`,
      error: expectedError,
      rpcMethodName: 'eth_chainId',
    });
  });

  it('still re-throws the error even after the circuit breaks', async () => {
    const mockFetch = jest.fn(() => {
      throw producedError;
    });
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
  });

  it('calls the onBreak callback once after the circuit breaks', async () => {
    const mockFetch = jest.fn(() => {
      throw producedError;
    });
    const endpointUrl = 'https://rpc.example.chain';
    const onBreakListener = jest.fn();
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });
    service.onBreak(onBreakListener);

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await ignoreRejection(service.request(jsonRpcRequest));

    expect(onBreakListener).toHaveBeenCalledTimes(1);
    expect(onBreakListener).toHaveBeenCalledWith({
      error: expectedError,
      endpointUrl: `${endpointUrl}/`,
    });
  });

  it('throws an error that includes the number of minutes until the circuit is re-closed if a request is attempted while the circuit is open', async () => {
    const mockFetch = jest.fn(() => {
      throw producedError;
    });
    const endpointUrl = 'https://rpc.example.chain';
    const logger = { warn: jest.fn() };
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl,
      logger,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    // Get through the first two rounds of retries
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await ignoreRejection(service.request(jsonRpcRequest));

    // Advance a minute to test that the message updates dynamically as time passes
    jest.advanceTimersByTime(60000);
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expect.objectContaining({
        code: errorCodes.rpc.resourceUnavailable,
        message:
          'RPC endpoint returned too many errors, retrying in 29 minutes. Consider using a different RPC endpoint.',
      }),
    );
  });

  it('logs the original CircuitBreakError if a request is attempted while the circuit is open', async () => {
    const mockFetch = jest.fn(() => {
      throw producedError;
    });
    const endpointUrl = 'https://rpc.example.chain';
    const logger = { warn: jest.fn() };
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl,
      logger,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Execution prevented because the circuit breaker is open',
      }),
    );
  });

  it('calls the onAvailable callback if the endpoint becomes degraded via errors and then recovers', async () => {
    let invocationIndex = -1;
    const mockFetch = jest.fn(async () => {
      invocationIndex += 1;
      if (invocationIndex === DEFAULT_MAX_RETRIES + 1) {
        // Only used for testing.
        // eslint-disable-next-line no-restricted-globals
        return new Response(
          JSON.stringify({
            id: 1,
            jsonrpc: '2.0',
            result: { some: 'data' },
          }),
        );
      }
      throw producedError;
    });
    const endpointUrl = 'https://rpc.example.chain';
    const onAvailableListener = jest.fn();
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl,
      isOffline: (): boolean => false,
    });
    service.onAvailable(onAvailableListener);
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    // Cause the retry policy to give up
    await ignoreRejection(service.request(jsonRpcRequest));
    await service.request(jsonRpcRequest);

    expect(onAvailableListener).toHaveBeenCalledTimes(1);
  });

  /* eslint-enable jest/require-top-level-describe */
}

/**
 * These are tests that exercise logic for cases in which the request returns a
 * response that is retriable.
 *
 * @param args - The arguments
 * @param args.httpStatus - The HTTP status code that the response will have.
 * @param args.responseBody - The body that the response will have.
 * @param args.expectedError - The error that a call to the service's `request`
 * method is expected to produce.
 * @param args.expectedOnBreakError - The error expected by the `onBreak` handler when there is a
 * circuit break. Defaults to `expectedError` if not provided.
 */
function testsForRetriableResponses({
  httpStatus,
  responseBody = '',
  expectedError,
  expectedOnBreakError = expectedError,
}: {
  httpStatus: number;
  responseBody?: string;
  expectedError: string | jest.Constructable | RegExp | Error;
  expectedOnBreakError?: string | jest.Constructable | RegExp | Error;
}): void {
  // This function is designed to be used inside of a describe, so this won't be
  // a problem in practice.
  /* eslint-disable jest/require-top-level-describe,jest/no-identical-title */

  it('retries a constantly failing request up to 4 more times before re-throwing the error, if `request` is only called once', async () => {
    const scope = nock('https://rpc.example.chain')
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(5)
      .reply(httpStatus, responseBody);
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
    expect(scope.isDone()).toBe(true);
  });

  it('still re-throws the error even after the circuit breaks', async () => {
    nock('https://rpc.example.chain')
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(15)
      .reply(httpStatus, responseBody);
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
  });

  it('calls the onBreak callback once after the circuit breaks', async () => {
    const endpointUrl = 'https://rpc.example.chain';
    nock(endpointUrl)
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(15)
      .reply(httpStatus, responseBody);
    const onBreakListener = jest.fn();
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });
    service.onBreak(onBreakListener);

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await ignoreRejection(service.request(jsonRpcRequest));

    expect(onBreakListener).toHaveBeenCalledTimes(1);
    expect(onBreakListener).toHaveBeenCalledWith({
      error: expectedOnBreakError,
      endpointUrl: `${endpointUrl}/`,
    });
  });

  it('throws an error that includes the number of minutes until the circuit is re-closed if a request is attempted while the circuit is open', async () => {
    const endpointUrl = 'https://rpc.example.chain';
    nock(endpointUrl)
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(15)
      .reply(httpStatus, responseBody);
    const onBreakListener = jest.fn();
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });
    service.onBreak(onBreakListener);

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    // Get through the first two rounds of retries
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    // The last retry breaks the circuit
    await ignoreRejection(service.request(jsonRpcRequest));

    // Advance a minute to test that the message updates dynamically as time passes
    jest.advanceTimersByTime(60000);
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expect.objectContaining({
        code: errorCodes.rpc.resourceUnavailable,
        message:
          'RPC endpoint returned too many errors, retrying in 29 minutes. Consider using a different RPC endpoint.',
      }),
    );
  });

  it('logs the original CircuitBreakError if a request is attempted while the circuit is open', async () => {
    const endpointUrl = 'https://rpc.example.chain';
    nock(endpointUrl)
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(15)
      .reply(httpStatus, responseBody);
    const logger = { warn: jest.fn() };
    const onBreakListener = jest.fn();
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl,
      logger,
      isOffline: (): boolean => false,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });
    service.onBreak(onBreakListener);

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));
    await ignoreRejection(service.request(jsonRpcRequest));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Execution prevented because the circuit breaker is open',
      }),
    );
  });

  it('does not retry when offline, only makes one request', async () => {
    const scope = nock('https://rpc.example.chain')
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(1)
      .reply(httpStatus, responseBody);
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => true,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
    // When offline, no retries should happen, so only 1 request
    expect(scope.isDone()).toBe(true);
  });

  it('does not call onBreak when offline', async () => {
    const scope = nock('https://rpc.example.chain')
      .post('/', {
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      })
      .times(3)
      .reply(httpStatus, responseBody);
    const endpointUrl = 'https://rpc.example.chain';
    const onBreakListener = jest.fn();
    const service = new RpcService({
      fetch,
      btoa,
      endpointUrl,
      isOffline: (): boolean => true,
    });
    service.onRetry(() => {
      jest.advanceTimersToNextTimer();
    });
    service.onBreak(onBreakListener);

    const jsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_chainId',
      params: [],
    };
    // Make multiple requests - even though we'd normally break the circuit,
    // when offline, no retries happen so circuit won't break
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );
    await expect(service.request(jsonRpcRequest)).rejects.toThrow(
      expectedError,
    );

    // When offline, retries don't happen, so circuit won't break and onBreak
    // should not be called
    expect(onBreakListener).not.toHaveBeenCalled();
    expect(scope.isDone()).toBe(true);
  });

  /* eslint-enable jest/require-top-level-describe,jest/no-identical-title */
}
