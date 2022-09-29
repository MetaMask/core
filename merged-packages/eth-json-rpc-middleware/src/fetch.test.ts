import { createFetchConfigFromReq, PayloadWithOrigin } from '.';

describe('fetch', () => {
  it('should create a fetch config from a request', async () => {
    const req = {
      method: 'eth_getBlockByNumber',
      params: ['0x482103', true],
    };
    const rpcUrl = 'http://www.xyz.io/rabbit:3456?id=100';
    const { fetchUrl, fetchParams } = createFetchConfigFromReq({ req, rpcUrl });
    expect(fetchUrl).toStrictEqual(rpcUrl);
    expect(fetchParams).toStrictEqual({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });
  });

  it('should create a fetch config with origin header', async () => {
    const req: PayloadWithOrigin = {
      method: 'eth_getBlockByNumber',
      params: ['0x482103', true],
      origin: 'happydapp.gov',
    };
    const reqSanitized = Object.assign({}, req);
    delete reqSanitized.origin;
    const rpcUrl = 'http://www.xyz.io/rabbit:3456?id=100';
    const originHttpHeaderKey = 'x-dapp-origin';
    const { fetchUrl, fetchParams } = createFetchConfigFromReq({
      req,
      rpcUrl,
      originHttpHeaderKey,
    });
    expect(fetchUrl).toStrictEqual(rpcUrl);
    expect(fetchParams).toStrictEqual({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-dapp-origin': 'happydapp.gov',
      },
      body: JSON.stringify(reqSanitized),
    });
  });
});
