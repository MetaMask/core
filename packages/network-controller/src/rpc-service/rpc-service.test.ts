// We use conditions exclusively in this file.
/* eslint-disable jest/no-conditional-in-test */

import { rpcErrors } from '@metamask/rpc-errors';
import nock from 'nock';
import { FetchError } from 'node-fetch';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import type { AbstractRpcService } from './abstract-rpc-service';
import { RpcService } from './rpc-service';
import { DEFAULT_CIRCUIT_BREAK_DURATION } from '../../../controller-utils/src/create-service-policy';

describe('RpcService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
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
      `if making the request throws the $message error`,
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

    describe('if the endpoint URL was not mocked via Nock', () => {
      it('re-throws the error without retrying the request', async () => {
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
        await expect(promise).rejects.toThrow('Nock: Disallowed net connect');
      });

      it('does not forward the request to a failover service if given one', async () => {
        const failoverService = buildMockRpcService();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
          failoverService,
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await ignoreRejection(service.request(jsonRpcRequest));
        expect(failoverService.request).not.toHaveBeenCalled();
      });

      it('does not call onBreak', async () => {
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

    describe('if the endpoint URL was mocked via Nock, but not the RPC method', () => {
      it('re-throws the error without retrying the request', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_incorrectMethod',
            params: [],
          })
          .reply(500);
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
        });

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await expect(promise).rejects.toThrow('Nock: No match for request');
      });

      it('does not forward the request to a failover service if given one', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_incorrectMethod',
            params: [],
          })
          .reply(500);
        const failoverService = buildMockRpcService();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
          failoverService,
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await ignoreRejection(service.request(jsonRpcRequest));
        expect(failoverService.request).not.toHaveBeenCalled();
      });

      it('does not call onBreak', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_incorrectMethod',
            params: [],
          })
          .reply(500);
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
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

      it('does not forward the request to a failover service if given one', async () => {
        const error = new Error('oops');
        const mockFetch = jest.fn(() => {
          throw error;
        });
        const failoverService = buildMockRpcService();
        const service = new RpcService({
          fetch: mockFetch,
          btoa,
          endpointUrl: 'https://rpc.example.chain',
          failoverService,
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await ignoreRejection(service.request(jsonRpcRequest));
        expect(failoverService.request).not.toHaveBeenCalled();
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
      'if the endpoint has a %d response',
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
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
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
          endpointUrl,
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

      it('does not forward the request to a failover service if given one', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_unknownMethod',
            params: [],
          })
          .reply(405);
        const failoverService = buildMockRpcService();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
          failoverService,
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_unknownMethod',
          params: [],
        };
        await ignoreRejection(service.request(jsonRpcRequest));
        expect(failoverService.request).not.toHaveBeenCalled();
      });

      it('does not call onBreak', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
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
          endpointUrl,
        });
        service.onBreak(onBreakListener);

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_unknownMethod',
          params: [],
        });
        await ignoreRejection(promise);
        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe('if the endpoint has a 429 response', () => {
      it('throws a rate-limiting error without retrying the request', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
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
          endpointUrl,
        });

        const promise = service.request({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        });
        await expect(promise).rejects.toThrow('Request is being rate limited.');
      });

      it('does not forward the request to a failover service if given one', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          })
          .reply(429);
        const failoverService = buildMockRpcService();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
          failoverService,
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await ignoreRejection(service.request(jsonRpcRequest));
        expect(failoverService.request).not.toHaveBeenCalled();
      });

      it('does not call onBreak', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
          .post('/', {
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          })
          .reply(429);
        const onBreakListener = jest.fn();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
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
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
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
          endpointUrl,
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

      it('does not forward the request to a failover service if given one', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
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
        const failoverService = buildMockRpcService();
        const service = new RpcService({
          fetch,
          btoa,
          endpointUrl,
          failoverService,
        });

        const jsonRpcRequest = {
          id: 1,
          jsonrpc: '2.0' as const,
          method: 'eth_chainId',
          params: [],
        };
        await ignoreRejection(service.request(jsonRpcRequest));
        expect(failoverService.request).not.toHaveBeenCalled();
      });

      it('does not call onBreak', async () => {
        const endpointUrl = 'https://rpc.example.chain';
        nock(endpointUrl)
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
          endpointUrl,
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
        endpointUrl,
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
      const endpointUrl = 'https://rpc.example.chain';
      const onBreakListener = jest.fn();
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl,
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
      expect(onBreakListener).toHaveBeenCalledWith({
        error: expectedError,
        endpointUrl: `${endpointUrl}/`,
      });
    });
  });

  describe('if a failover service is provided', () => {
    it('still retries a constantly failing request up to 4 more times before re-throwing the error, if `request` is only called once', async () => {
      const clock = getClock();
      const mockFetch = jest.fn(() => {
        throw producedError;
      });
      const failoverService = buildMockRpcService();
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
        failoverService,
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

    it('forwards the request to the failover service in addition to the primary endpoint while the circuit is broken, stopping when the primary endpoint recovers', async () => {
      const clock = getClock();
      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      let invocationCounter = 0;
      const mockFetch = jest.fn(async () => {
        invocationCounter += 1;
        if (invocationCounter === 17) {
          return new Response(
            JSON.stringify({
              id: jsonRpcRequest.id,
              jsonrpc: jsonRpcRequest.jsonrpc,
              result: 'ok',
            }),
          );
        }
        throw producedError;
      });
      const failoverService = buildMockRpcService();
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
        fetchOptions: {
          headers: {
            'X-Foo': 'bar',
          },
        },
        failoverService,
      });
      service.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });

      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(5);

      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(10);

      // The last retry breaks the circuit
      await service.request(jsonRpcRequest);
      expect(mockFetch).toHaveBeenCalledTimes(15);
      expect(failoverService.request).toHaveBeenCalledTimes(1);
      expect(failoverService.request).toHaveBeenNthCalledWith(
        1,
        jsonRpcRequest,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Foo': 'bar',
          },
          method: 'POST',
          body: JSON.stringify(jsonRpcRequest),
        },
      );

      await service.request(jsonRpcRequest);
      // The circuit is broken, so the `fetch` is not attempted
      expect(mockFetch).toHaveBeenCalledTimes(15);
      expect(failoverService.request).toHaveBeenCalledTimes(2);
      expect(failoverService.request).toHaveBeenNthCalledWith(
        2,
        jsonRpcRequest,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Foo': 'bar',
          },
          method: 'POST',
          body: JSON.stringify(jsonRpcRequest),
        },
      );

      clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
      await service.request(jsonRpcRequest);
      expect(mockFetch).toHaveBeenCalledTimes(16);
      // The circuit breaks again
      expect(failoverService.request).toHaveBeenCalledTimes(3);
      expect(failoverService.request).toHaveBeenNthCalledWith(
        2,
        jsonRpcRequest,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Foo': 'bar',
          },
          method: 'POST',
          body: JSON.stringify(jsonRpcRequest),
        },
      );

      clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
      // Finally the request succeeds
      const response = await service.request(jsonRpcRequest);
      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });
      expect(mockFetch).toHaveBeenCalledTimes(17);
      expect(failoverService.request).toHaveBeenCalledTimes(3);
    });

    it('still calls onBreak each time the circuit breaks from the perspective of the primary endpoint', async () => {
      const clock = getClock();
      const mockFetch = jest.fn(() => {
        throw producedError;
      });
      const endpointUrl = 'https://rpc.example.chain';
      const failoverEndpointUrl = 'https://failover.endpoint';
      const failoverService = buildMockRpcService({
        endpointUrl: new URL(failoverEndpointUrl),
      });
      const onBreakListener = jest.fn();
      const service = new RpcService({
        fetch: mockFetch,
        btoa,
        endpointUrl,
        failoverService,
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
      await ignoreRejection(() => service.request(jsonRpcRequest));
      await ignoreRejection(() => service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await service.request(jsonRpcRequest);
      clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
      // The circuit breaks again
      await service.request(jsonRpcRequest);

      expect(onBreakListener).toHaveBeenCalledTimes(2);
      expect(onBreakListener).toHaveBeenCalledWith({
        error: expectedError,
        endpointUrl: `${endpointUrl}/`,
        failoverEndpointUrl: `${failoverEndpointUrl}/`,
      });
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
      expect(onBreakListener).toHaveBeenCalledWith({
        error: expectedError,
        endpointUrl: `${endpointUrl}/`,
      });
    });
  });

  describe('if a failover service is provided', () => {
    it('still retries a constantly failing request up to 4 more times before re-throwing the error, if `request` is only called once', async () => {
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
      const failoverService = buildMockRpcService();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
        failoverService,
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

    it('forwards the request to the failover service in addition to the primary endpoint while the circuit is broken, stopping when the primary endpoint recovers', async () => {
      const clock = getClock();
      const jsonRpcRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'eth_chainId',
        params: [],
      };
      let invocationCounter = 0;
      nock('https://rpc.example.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(17)
        .reply(() => {
          invocationCounter += 1;
          if (invocationCounter === 17) {
            return [
              200,
              JSON.stringify({
                id: jsonRpcRequest.id,
                jsonrpc: jsonRpcRequest.jsonrpc,
                result: 'ok',
              }),
            ];
          }
          return [httpStatus, responseBody];
        });
      const failoverService = buildMockRpcService();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl: 'https://rpc.example.chain',
        fetchOptions: {
          headers: {
            'X-Foo': 'bar',
          },
        },
        failoverService,
      });
      service.onRetry(() => {
        // We don't need to await this promise; adding it to the promise
        // queue is enough to continue.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.nextAsync();
      });

      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      expect(invocationCounter).toBe(5);

      await expect(service.request(jsonRpcRequest)).rejects.toThrow(
        expectedError,
      );
      expect(invocationCounter).toBe(10);

      // The last retry breaks the circuit
      await service.request(jsonRpcRequest);
      expect(invocationCounter).toBe(15);
      expect(failoverService.request).toHaveBeenCalledTimes(1);
      expect(failoverService.request).toHaveBeenNthCalledWith(
        1,
        jsonRpcRequest,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Foo': 'bar',
          },
          method: 'POST',
          body: JSON.stringify(jsonRpcRequest),
        },
      );

      await service.request(jsonRpcRequest);
      // The circuit is broken, so the `fetch` is not attempted
      expect(invocationCounter).toBe(15);
      expect(failoverService.request).toHaveBeenCalledTimes(2);
      expect(failoverService.request).toHaveBeenNthCalledWith(
        2,
        jsonRpcRequest,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Foo': 'bar',
          },
          method: 'POST',
          body: JSON.stringify(jsonRpcRequest),
        },
      );

      clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
      await service.request(jsonRpcRequest);
      expect(invocationCounter).toBe(16);
      // The circuit breaks again
      expect(failoverService.request).toHaveBeenCalledTimes(3);
      expect(failoverService.request).toHaveBeenNthCalledWith(
        2,
        jsonRpcRequest,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Foo': 'bar',
          },
          method: 'POST',
          body: JSON.stringify(jsonRpcRequest),
        },
      );

      clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
      // Finally the request succeeds
      const response = await service.request(jsonRpcRequest);
      expect(response).toStrictEqual({
        id: 1,
        jsonrpc: '2.0',
        result: 'ok',
      });
      expect(invocationCounter).toBe(17);
      expect(failoverService.request).toHaveBeenCalledTimes(3);
    });

    it('still calls onBreak each time the circuit breaks from the perspective of the primary endpoint', async () => {
      const clock = getClock();
      nock('https://rpc.example.chain')
        .post('/', {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        })
        .times(16)
        .reply(httpStatus, responseBody);
      const endpointUrl = 'https://rpc.example.chain';
      const failoverEndpointUrl = 'https://failover.endpoint';
      const failoverService = buildMockRpcService({
        endpointUrl: new URL(failoverEndpointUrl),
      });
      const onBreakListener = jest.fn();
      const service = new RpcService({
        fetch,
        btoa,
        endpointUrl,
        failoverService,
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
      await ignoreRejection(() => service.request(jsonRpcRequest));
      await ignoreRejection(() => service.request(jsonRpcRequest));
      // The last retry breaks the circuit
      await service.request(jsonRpcRequest);
      clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
      // The circuit breaks again
      await service.request(jsonRpcRequest);

      expect(onBreakListener).toHaveBeenCalledTimes(2);
      expect(onBreakListener).toHaveBeenCalledWith({
        error: expectedError,
        endpointUrl: `${endpointUrl}/`,
        failoverEndpointUrl: `${failoverEndpointUrl}/`,
      });
    });
  });

  /* eslint-enable jest/no-identical-title */
}

/**
 * Constructs a fake RPC service for use as a failover in tests.
 *
 * @param overrides - The overrides.
 * @returns The fake failover service.
 */
function buildMockRpcService(
  overrides?: Partial<AbstractRpcService>,
): AbstractRpcService {
  return {
    endpointUrl: new URL('https://test.example'),
    request: jest.fn(),
    onRetry: jest.fn(),
    onBreak: jest.fn(),
    onDegraded: jest.fn(),
    ...overrides,
  };
}
