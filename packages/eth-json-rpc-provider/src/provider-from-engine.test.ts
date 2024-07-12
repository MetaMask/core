import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { providerErrors } from '@metamask/rpc-errors';

import { providerFromEngine } from './provider-from-engine';

describe('providerFromEngine', () => {
  it('handle a successful request', async () => {
    const engine = new JsonRpcEngine();
    engine.push((_req, res, _next, end) => {
      res.result = 42;
      end();
    });
    const provider = providerFromEngine(engine);
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    const response = await provider.request(exampleRequest);

    expect(response).toBe(42);
  });

  it('handle a failed request', async () => {
    const engine = new JsonRpcEngine();
    engine.push((_req, _res, _next, end) => {
      end(
        providerErrors.custom({
          code: 1001,
          message: 'Test error',
        }),
      );
    });
    const provider = providerFromEngine(engine);
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
