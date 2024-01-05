import type { PendingJsonRpcResponse } from '@metamask/utils';

import {
  createApiSpecValidationMiddleware,
  type ApiSpecValidationMiddlewareJsonRpcRequest,
} from './ApiSpecValidationMiddleware';

const requestDefaults = {
  method: 'doesnt matter',
  id: 'doesnt matter',
  jsonrpc: '2.0' as const,
  origin: 'example.com',
  networkClientId: 'mainnet',
};

describe('createApiSpecValidationMiddleware', () => {
  it('returns an error if method is not found', async () => {
    const middleware = await createApiSpecValidationMiddleware();

    const res = {} as any;
    await new Promise((resolve) => middleware(requestDefaults, res, resolve, resolve));
    expect(res.error.code).toBe(-32603);
    expect(res.error.data.cause.message).toContain("Method Not Found Error for OpenRPC API named \"MetaMask JSON-RPC API Reference\"\nThe requested method: \"doesnt matter\" not a valid method.");
  });

  it('returns an error if params are incorrect', async () => {
    const middleware = await createApiSpecValidationMiddleware();

    const res = {} as any;
    const req = {
      ...requestDefaults,
      method: 'eth_getBlockByNumber',
      params: ['allabaster soda cracker']
    } as any;
    await new Promise((resolve) => middleware(req, res, resolve, resolve));
    expect(res.error.code).toBe(-32603);
    console.log(res.error.data);
    expect(res.error.data.cause.message).toContain("Method Not Found Error for OpenRPC API named \"MetaMask JSON-RPC API Reference\"\nThe requested method: \"doesnt matter\" not a valid method.");
  });

  it('does nothing when the method call is valid', async () => {
    const middleware = await createApiSpecValidationMiddleware();

    const req = {
      ...requestDefaults,
      method: 'eth_getBlockByNumber',
      params: ['latest', false]
    } as any;
    const res = {} as any;
    await new Promise((resolve, reject) => middleware(req, res, resolve, reject));
    expect(res).toStrictEqual({});
  });

});
