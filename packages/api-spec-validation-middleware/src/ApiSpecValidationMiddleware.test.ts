import nock from 'nock';

import { createApiSpecValidationMiddleware } from './ApiSpecValidationMiddleware';
import apiSpec from './fixtures/api-spec-openrpc.json';

const requestDefaults = {
  method: 'doesnt matter',
  id: 'doesnt matter',
  jsonrpc: '2.0' as const,
  origin: 'example.com',
  networkClientId: 'mainnet',
};

const nockOpenRPC = () => {
  nock('https://metamask.github.io')
    .get('/api-specs/latest/openrpc.json')
    .reply(200, apiSpec);
};

describe('createApiSpecValidationMiddleware', () => {
  it('returns an error if method is not found', async () => {
    nockOpenRPC();
    const middleware = await createApiSpecValidationMiddleware();

    const res = {} as any;
    await new Promise((resolve) =>
      middleware(requestDefaults, res, resolve, resolve),
    );
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toContain(
      'Method Not Found Error for OpenRPC API named "MetaMask JSON-RPC API Reference"\nThe requested method: "doesnt matter" not a valid method.',
    );
  });

  it('returns an error if params are incorrect', async () => {
    nockOpenRPC();
    const middleware = await createApiSpecValidationMiddleware();

    const res = {} as any;
    const req = {
      ...requestDefaults,
      method: 'eth_getBlockByNumber',
      params: ['allabaster soda cracker'],
    } as any;
    await new Promise((resolve) => middleware(req, res, resolve, resolve));
    expect(res.error.code).toBe(-32602);
    expect(res.error.message).toContain('Invalid params');
  });

  it('does nothing when the method call is valid', async () => {
    nockOpenRPC();
    const middleware = await createApiSpecValidationMiddleware();

    const req = {
      ...requestDefaults,
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
    } as any;
    const res = {} as any;
    await new Promise((resolve, reject) =>
      middleware(req, res, resolve, reject),
    );
    expect(res).toStrictEqual({});
  });
});
