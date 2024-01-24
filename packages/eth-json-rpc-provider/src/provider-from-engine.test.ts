import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { promisify } from 'util';

import { providerFromEngine } from './provider-from-engine';

describe('providerFromEngine', () => {
  it('handle a successful request', async () => {
    const engine = new JsonRpcEngine();
    engine.push((_req, res, _next, end) => {
      res.result = 42;
      end();
    });
    const provider = providerFromEngine(engine);
    const promisifiedSendAsync = promisify(provider.sendAsync);
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    const response = await promisifiedSendAsync(exampleRequest);

    expect(response.result).toBe(42);
  });

  it('handle a failed request', async () => {
    const engine = new JsonRpcEngine();
    engine.push((_req, _res, _next, _end) => {
      throw new Error('Test error');
    });
    const provider = providerFromEngine(engine);
    const promisifiedSendAsync = promisify(provider.sendAsync);
    const exampleRequest = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'test',
    };

    await expect(async () =>
      promisifiedSendAsync(exampleRequest),
    ).rejects.toThrow('Test error');
  });
});
