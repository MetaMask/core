import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { promisify } from 'util';

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
    const middleware = () => {
      throw new Error('Test error');
    };
    const provider = providerFromMiddleware(middleware);
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
