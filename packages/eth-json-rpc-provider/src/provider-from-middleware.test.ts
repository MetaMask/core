import type { JsonRpcMiddleware as LegacyJsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { providerErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import {
  providerFromMiddleware,
  providerFromMiddlewareV2,
} from './provider-from-middleware';

describe('providerFromMiddleware', () => {
  it('handle a successful request', async () => {
    const middleware: LegacyJsonRpcMiddleware<JsonRpcParams, Json> = (
      _req,
      res,
      _next,
      end,
    ) => {
      res.result = 42;
      end();
    };
    const provider = providerFromMiddleware(middleware);
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    const response = await provider.request(exampleRequest);

    expect(response).toBe(42);
  });

  it('handle a failed request', async () => {
    const provider = providerFromMiddleware((_req, _res, _next, end) => {
      end(
        providerErrors.custom({
          code: 1001,
          message: 'Test error',
        }),
      );
    });
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    await expect(async () => provider.request(exampleRequest)).rejects.toThrow(
      'Test error',
    );
  });
});

describe('providerFromMiddlewareV2', () => {
  it('handle a successful request', async () => {
    const middleware: JsonRpcMiddleware<JsonRpcRequest, Json> = () => 42;
    const provider = providerFromMiddlewareV2(middleware);
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    const response = await provider.request(exampleRequest);

    expect(response).toBe(42);
  });

  it('handle a failed request', async () => {
    const middleware: JsonRpcMiddleware<JsonRpcRequest, Json> = () => {
      throw new Error('Test error');
    };
    const provider = providerFromMiddlewareV2(middleware);
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    await expect(async () => provider.request(exampleRequest)).rejects.toThrow(
      'Test error',
    );
  });
});
