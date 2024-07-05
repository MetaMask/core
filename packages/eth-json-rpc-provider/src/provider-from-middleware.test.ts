import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { providerErrors } from '@metamask/rpc-errors';

import { providerFromMiddleware } from './provider-from-middleware';

describe('providerFromMiddleware', () => {
  it('handle a successful request', async () => {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const middleware: JsonRpcMiddleware<any, any> = (_req, res, _next, end) => {
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
