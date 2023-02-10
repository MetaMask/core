import { createFetchConfigFromReq } from '.';

/**
 * Generate a base64-encoded string from a binary string. This should be equivalent to
 * `window.btoa`.
 *
 * @param stringToEncode - The string to encode.
 * @returns The base64-encoded string.
 */
// eslint-disable-next-line @typescript-eslint/no-shadow
function btoa(stringToEncode: string) {
  return Buffer.from(stringToEncode).toString('base64');
}

describe('fetch', () => {
  it('should create a fetch config from a request', async () => {
    const req = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_getBlockByNumber',
      params: ['0x482103', true],
    };
    const rpcUrl = 'http://www.xyz.io/rabbit:3456?id=100';
    const { fetchUrl, fetchParams } = createFetchConfigFromReq({
      btoa,
      req,
      rpcUrl,
    });
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
    const request = {
      id: 1,
      jsonrpc: '2.0' as const,
      method: 'eth_getBlockByNumber',
      params: ['0x482103', true],
    };
    const requestWithOrigin = { ...request, origin: 'happydapp.gov' };
    const rpcUrl = 'http://www.xyz.io/rabbit:3456?id=100';
    const originHttpHeaderKey = 'x-dapp-origin';
    const { fetchUrl, fetchParams } = createFetchConfigFromReq({
      btoa,
      req: requestWithOrigin,
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
      body: JSON.stringify(request),
    });
  });
});
