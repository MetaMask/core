import {
  JsonRpcEngineV2,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import { createFetchMiddleware } from './fetch';
import type { AbstractRpcServiceLike } from './types';
import { createRequest } from '../test/util/helpers';

describe('createFetchMiddleware', () => {
  it.each([
    [undefined, undefined],
    [undefined, 'somedapp.com'],
    ['X-Dapp-Origin', undefined],
    ['X-Dapp-Origin', 'somedapp.com'],
  ])(
    'calls the RPC service with the correct request headers and body with originHttpHeaderKey="%s" and origin="%s"',
    async (originHttpHeaderKey, origin) => {
      const rpcService = createRpcService();
      const requestSpy = jest.spyOn(rpcService, 'request');

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createFetchMiddleware({
            rpcService,
            options: {
              originHttpHeaderKey,
            },
          }),
        ],
      });

      const context = new MiddlewareContext<{ origin: string }>(
        origin ? { origin } : [],
      );
      const expectedHeaders =
        originHttpHeaderKey && origin ? { [originHttpHeaderKey]: origin } : {};

      await engine.handle(
        createRequest({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        }),
        { context },
      );

      expect(requestSpy).toHaveBeenCalledWith(
        {
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
        },
        {
          headers: expectedHeaders,
        },
      );
    },
  );

  describe('if the response from the service does not contain an `error` field', () => {
    it('returns a successful JSON-RPC response containing the value of the `result` field', async () => {
      const rpcService = createRpcService();
      jest.spyOn(rpcService, 'request').mockResolvedValue({
        id: 1,
        jsonrpc: '2.0',
        result: 'the result',
      });

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createFetchMiddleware({
            rpcService,
          }),
        ],
      });
      const result = await engine.handle(
        createRequest({
          method: 'eth_chainId',
          params: [],
        }),
      );

      expect(result).toBe('the result');
    });
  });

  describe('if the response from the service contains an `error` field with a standard JSON-RPC error object', () => {
    it('returns an unsuccessful JSON-RPC response containing the error, wrapped in an "internal" error', async () => {
      const rpcService = createRpcService();
      jest.spyOn(rpcService, 'request').mockResolvedValue({
        id: 1,
        jsonrpc: '2.0',
        error: {
          code: -1000,
          message: 'oops',
        },
      });
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createFetchMiddleware({
            rpcService,
          }),
        ],
      });

      await expect(
        engine.handle(
          createRequest({
            method: 'eth_chainId',
            params: [],
          }),
        ),
      ).rejects.toThrow(
        rpcErrors.internal({
          data: {
            code: -1000,
            message: 'oops',
          },
        }),
      );
    });
  });

  describe('if the response from the service contains an `error` field with a non-standard JSON-RPC error object', () => {
    it('returns an unsuccessful JSON-RPC response containing the error, wrapped in an "internal" error', async () => {
      const rpcService = createRpcService();
      jest.spyOn(rpcService, 'request').mockResolvedValue({
        id: 1,
        jsonrpc: '2.0',
        error: {
          code: -32000,
          data: {
            foo: 'bar',
          },
          message: 'VM Exception while processing transaction: revert',
          // @ts-expect-error The `name` property is not strictly part of the
          // JSON-RPC error object.
          name: 'RuntimeError',
          stack:
            'RuntimeError: VM Exception while processing transaction: revert at exactimate (/Users/elliot/code/metamask/metamask-mobile/node_modules/ganache/dist/node/webpack:/Ganache/ethereum/ethereum/lib/src/helpers/gas-estimator.js:257:23)',
        },
      });
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createFetchMiddleware({
            rpcService,
          }),
        ],
      });

      await expect(
        engine.handle(
          createRequest({
            method: 'eth_chainId',
            params: [],
          }),
        ),
      ).rejects.toThrow(
        rpcErrors.internal({
          data: {
            code: -32000,
            data: {
              foo: 'bar',
            },
            message: 'VM Exception while processing transaction: revert',
            name: 'RuntimeError',
            stack:
              'RuntimeError: VM Exception while processing transaction: revert at exactimate (/Users/elliot/code/metamask/metamask-mobile/node_modules/ganache/dist/node/webpack:/Ganache/ethereum/ethereum/lib/src/helpers/gas-estimator.js:257:23)',
          },
        }),
      );
    });
  });

  describe('if the request throws', () => {
    it('returns an unsuccessful JSON-RPC response containing the error', async () => {
      const rpcService = createRpcService();
      jest.spyOn(rpcService, 'request').mockRejectedValue(new Error('oops'));

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createFetchMiddleware({
            rpcService,
          }),
        ],
      });

      await expect(
        engine.handle(
          createRequest({
            method: 'eth_chainId',
            params: [],
          }),
        ),
      ).rejects.toThrow(
        rpcErrors.internal({
          message: 'oops',
        }),
      );
    });
  });
});

/**
 * Constructs a fake RPC service for use as a failover in tests.
 *
 * @returns The fake failover service.
 */
function createRpcService(): AbstractRpcServiceLike {
  return {
    async request<Params extends JsonRpcParams, Result extends Json>(
      jsonRpcRequest: JsonRpcRequest<Params>,
      _fetchOptions?: RequestInit,
    ) {
      return {
        id: jsonRpcRequest.id,
        jsonrpc: jsonRpcRequest.jsonrpc,
        result: 'ok' as Result,
      };
    },
  };
}
