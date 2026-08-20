import { createInfuraAuthRpcServiceOptions } from './infura-auth.js';

const INFURA_ENDPOINT_URL = 'https://mainnet.infura.io/v3/some-project-id';
const CUSTOM_ENDPOINT_URL = 'https://rpc.example.com/';

/**
 * Builds a `fetch` stub that records the options it is called with.
 *
 * @returns The stub along with the list it records into.
 */
function getFetchStub(): {
  calls: (RequestInit | undefined)[];
  fetchImplementation: typeof fetch;
} {
  const calls: (RequestInit | undefined)[] = [];
  const fetchImplementation = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): ReturnType<typeof fetch> => {
    calls.push(init);
    return {} as unknown as Awaited<ReturnType<typeof fetch>>;
  };
  return { calls, fetchImplementation };
}

describe('createInfuraAuthRpcServiceOptions', () => {
  it('does not customize requests to a non-Infura endpoint', () => {
    const getRpcServiceOptions = createInfuraAuthRpcServiceOptions(async () =>
      Promise.resolve('some-token'),
    );

    expect(getRpcServiceOptions(CUSTOM_ENDPOINT_URL)).toStrictEqual({});
  });

  it('does not customize requests when no token function is given', () => {
    const getRpcServiceOptions = createInfuraAuthRpcServiceOptions();

    expect(getRpcServiceOptions(INFURA_ENDPOINT_URL)).toStrictEqual({});
  });

  it('adds the token as a bearer credential, retrieving it for each request', async () => {
    const tokens = ['first-token', 'second-token'];
    const { calls, fetchImplementation } = getFetchStub();
    const getRpcServiceOptions = createInfuraAuthRpcServiceOptions(
      async () => Promise.resolve(tokens.shift()),
      fetchImplementation,
    );

    const { fetch: customFetch } = getRpcServiceOptions(INFURA_ENDPOINT_URL);
    await customFetch?.(INFURA_ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    await customFetch?.(INFURA_ENDPOINT_URL);

    expect(calls[0]).toStrictEqual({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer first-token',
      },
    });
    expect(calls[1]?.headers).toStrictEqual({
      Authorization: 'Bearer second-token',
    });
  });

  it('makes the request without a credential when no token is available', async () => {
    const { calls, fetchImplementation } = getFetchStub();
    const getRpcServiceOptions = createInfuraAuthRpcServiceOptions(
      async () => Promise.resolve(undefined),
      fetchImplementation,
    );

    const { fetch: customFetch } = getRpcServiceOptions(INFURA_ENDPOINT_URL);
    await customFetch?.(INFURA_ENDPOINT_URL);

    expect(calls[0]).toBeUndefined();
  });

  it('makes the request without a credential when retrieving the token fails', async () => {
    const { calls, fetchImplementation } = getFetchStub();
    const getRpcServiceOptions = createInfuraAuthRpcServiceOptions(
      async () => Promise.reject(new Error('unavailable')),
      fetchImplementation,
    );

    const { fetch: customFetch } = getRpcServiceOptions(INFURA_ENDPOINT_URL);
    await customFetch?.(INFURA_ENDPOINT_URL);

    expect(calls[0]).toBeUndefined();
  });

  it('preserves an Authorization header that the request already carries', async () => {
    const { calls, fetchImplementation } = getFetchStub();
    const getRpcServiceOptions = createInfuraAuthRpcServiceOptions(
      async () => Promise.resolve('some-token'),
      fetchImplementation,
    );

    const { fetch: customFetch } = getRpcServiceOptions(INFURA_ENDPOINT_URL);
    await customFetch?.(INFURA_ENDPOINT_URL, {
      headers: { Authorization: 'Basic c29tZS1zZWNyZXQ=' },
    });

    expect(calls[0]?.headers).toStrictEqual({
      Authorization: 'Basic c29tZS1zZWNyZXQ=',
    });
  });
});
