import { rpcErrors } from '@metamask/rpc-errors';
import nock from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import { NETWORK_UNREACHABLE_ERRORS, RpcService } from './rpc-service';

describe('RpcService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('request', () => {
    describe.each([...NETWORK_UNREACHABLE_ERRORS].slice(0, 1))(
      `if making the request throws a "%s" error (as a "network unreachable" error)`,
      (errorMessage) => {
        const error = new TypeError(errorMessage);
        testsForRetriableFetchErrors({
          getClock: () => clock,
          producedError: error,
          expectedError: error,
        });
      },
    );

    describe('if making the request throws a "Gateway timeout" error', () => {
      const error = new Error('Gateway timeout');
      testsForRetriableFetchErrors({
        getClock: () => clock,
        producedError: error,
        expectedError: error,
      });
    });

    describe.each(['ETIMEDOUT', 'ECONNRESET'])(
      'if making the request throws a %s error',
      (errorCode) => {
        const error = new Error('timed out');
        // @ts-expect-error `code` does not exist on the Error type, but is
        // still used by Node.
        error.code = errorCode;

        testsForRetriableFetchErrors({
          getClock: () => clock,
          producedError: error,
          expectedError: error,
        });
      },
    );

    describe('if making the request throws an unknown error', () => {
      it('re-throws the error without retrying the request', async () => {
        const error = new Error('oops');
        const mockFetch = jest.fn(() => {
          throw error;
        });
        const service = new RpcService({
          fetch: mockFetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await expect(promise).rejects.toThrow(error);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('does not call onBreak', async () => {
        const error = new Error('oops');
        const mockFetch = jest.fn(() => {
          throw error;
        });
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch: mockFetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });
        service.onBreak(onBreakListener);

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await ignoreRejection(promise);
        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe.each([503, 504])(
      'if the endpoint consistently has a %d response',
      (httpStatus) => {
        testsForRetriableResponses({
          getClock: () => clock,
          httpStatus,
          expectedError: rpcErrors.internal({
            message:
              'Gateway timeout. The request took too long to process. This can happen when querying logs over too wide a block range.',
          }),
        });
      },
    );

    describe('if the endpoint has a 405 response', () => {
      it('throws a non-existent method error without retrying the request', async () => {
        nock('https://rpc.example.chain')
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_unknownMethod',
            params: [],
          })
          .reply(405);
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_unknownMethod',
          params: [],
        });
        await expect(promise).rejects.toThrow(
          'The method does not exist / is not available.',
        );
      });

      it('does not call onBreak', async () => {
        nock('https://rpc.example.chain')
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_unknownMethod',
            params: [],
          })
          .reply(405);
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });
        service.onBreak(onBreakListener);

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await ignoreRejection(promise);
        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe('if the endpoint has a 429 response', () => {
      it('throws a rate-limiting error without retrying the request', async () => {
        nock('https://rpc.example.chain')
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          })
          .reply(429);
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await expect(promise).rejects.toThrow('Request is being rate limited.');
      });

      it('does not call onBreak', async () => {
        nock('https://rpc.example.chain')
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_unknownMethod',
            params: [],
          })
          .reply(429);
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });
        service.onBreak(onBreakListener);

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await ignoreRejection(promise);
        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe('when the endpoint has a response that is neither 2xx, nor 405, 429, 503, or 504', () => {
      it('throws a generic error without retrying the request', async () => {
        nock('https://rpc.example.chain')
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          })
          .reply(500, {
            id: 1,
            jsonrpc: '2.0',
            error: 'oops',
          });
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await expect(promise).rejects.toThrow(
          expect.objectContaining({
            message: "Non-200 status code: '500'",
            data: {
              id: 1,
              jsonrpc: '2.0',
              error: 'oops',
            },
          }),
        );
      });

      it('does not call onBreak', async () => {
        nock('https://rpc.example.chain')
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          })
          .reply(500, {
            id: 1,
            jsonrpc: '2.0',
            error: 'oops',
          });
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
        });
        service.onBreak(onBreakListener);

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await ignoreRejection(promise);
        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe('if the endpoint consistently responds with invalid JSON', () => {
      testsForRetriableResponses({
        getClock: () => clock,
        httpStatus: 200,
        responseBody: 'invalid JSON',
        expectedError: expect.objectContaining({
          message: expect.stringContaining('is not valid JSON'),
        }),
      });
    });

    it('removes non-JSON-RPC-compliant properties from the request body before sending it to the endpoint', async () => {
      nock('https://rpc.example.chain')
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
        endpointUrl: 'https://rpc.example.chain',
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
      nock('https://rpc.example.chain', {
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
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://username:password@rpc.example.chain',
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
      nock('https://rpc.example.chain')
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
        endpointUrl: 'https://rpc.example.chain',
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

    it('does not throw if the endpoint returns an unsuccessful JSON-RPC response', async () => {
      nock('https://rpc.example.chain')
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
        endpointUrl: 'https://rpc.example.chain',
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

    it('interprets a "Not Found" response for eth_getBlockByNumber as an empty result', async () => {
      nock('https://rpc.example.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['0x999999999', false],
        })
        .reply(200, 'Not Found');
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
      });

      const response = await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['0x999999999', false],
      });

      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: null,
      });
    });

    it('calls the onDegraded callback if the endpoint takes more than 5 seconds to respond', async () => {
      nock('https://rpc.example.chain')
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
      const onDegradedListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
      });
      service.onDegraded(onDegradedListener);

      await service.request({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      });

      expect(onDegradedListener).toHaveBeenCalledTimes(1);
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
async function ignoreRejection<T>(
  promiseOrFn: Promise<T> | (() => T | Promise<T>),
) {
  await expect(promiseOrFn).rejects.toThrow(expect.any(Error));
}

/**
 * These are tests that exercise logic for cases in which the request cannot be
 * made because the `fetch` calls throws a specific error.
 *
 * @param args - The arguments
 * @param args.getClock - A function that returns the Sinon clock, set in
 * `beforeEach`.
 * @param args.producedError - The error produced when `fetch` is called.
 * @param args.expectedError - The error that a call to the service's `request`
 * method is expected to produce.
 */
function testsForRetriableFetchErrors({
  getClock,
  producedError,
  expectedError,
}: {
  getClock: () => SinonFakeTimers;
  producedError: Error;
  expectedError: string | jest.Constructable | RegExp | Error;
}) {
  describe('if there is no failover service provided', () => {
    it('retries a constantly failing request up to 4 more times before re-throwing the error, if `request` is only called once', async () => {
      const clock = getClock();
      const mockFetch = jest.fn(() => {
        throw producedError;
      });
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
      });
      service.onRetry(() => {
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
      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('still re-throws the error even after the circuit breaks', async () => {
      const clock = getClock();
      const mockFetch = jest.fn(() => {
        throw producedError;
      });
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
      });
      service.onRetry(() => {
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
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
    });

    it('calls the onBreak callback once after the circuit breaks', async () => {
      const clock = getClock();
      const mockFetch = jest.fn(() => {
        throw producedError;
      });
      const onBreakListener = jest.fn();
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
      });
      service.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
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
      expect(onBreakListener).toHaveBeenCalledWith({ error: expectedError });
    });
  });
}

/**
 * These are tests that exercise logic for cases in which the request returns a
 * response that is retriable.
 *
 * @param args - The arguments
 * @param args.getClock - A function that returns the Sinon clock, set in
 * `beforeEach`.
 * @param args.httpStatus - The HTTP status code that the response will have.
 * @param args.responseBody - The body that the response will have.
 * @param args.expectedError - The error that a call to the service's `request`
 * method is expected to produce.
 */
function testsForRetriableResponses({
  getClock,
  httpStatus,
  responseBody = '',
  expectedError,
}: {
  getClock: () => SinonFakeTimers;
  httpStatus: number;
  responseBody?: string;
  expectedError: string | jest.Constructable | RegExp | Error;
}) {
  // This function is designed to be used inside of a describe, so this won't be
  // a problem in practice.
  /* eslint-disable jest/no-identical-title */

  describe('if there is no failover service provided', () => {
    it('retries a constantly failing request up to 4 more times before re-throwing the error, if `request` is only called once', async () => {
      const clock = getClock();
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
      });
      service.onRetry(() => {
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
      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      expect(scope.isDone()).toBe(true);
    });

    it('still re-throws the error even after the circuit breaks', async () => {
      const clock = getClock();
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
      });
      service.onRetry(() => {
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
      await ignoreRejection(service.request(jsonRpcRequest));
      await ignoreRejection(service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
    });

    it('calls the onBreak callback once after the circuit breaks', async () => {
      const clock = getClock();
      nock('https://rpc.example.chain')
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
        endpointUrl: 'https://rpc.example.chain',
      });
      service.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
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
      expect(onBreakListener).toHaveBeenCalledWith({ error: expectedError });
    });
  });

  /* eslint-enable jest/no-identical-title */
}
