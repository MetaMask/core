import { buildRootMessenger } from '../../tests/helpers.js';
import {
  withMockedCommunications,
  withNetworkClient,
} from '../../tests/network-client/helpers.js';

const FAILOVER_URL = 'https://failover.example.com';

type RecordedRequest = {
  host: string;
  method: string;
  authorization: string | null;
};

/**
 * Extracts the host from the first argument of a `fetch` call.
 *
 * @param input - The URL or request passed to `fetch`.
 * @returns The host of the URL.
 */
function getHost(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return new URL(input).host;
  }
  if (input instanceof URL) {
    return input.host;
  }
  return new URL(input.url).host;
}

/**
 * Builds a `fetch` that records the host, JSON-RPC method, and `Authorization`
 * header of every request before forwarding it to the global `fetch`.
 *
 * @returns The recording `fetch` along with the list it records into.
 */
function buildRecordingFetch(): {
  requests: RecordedRequest[];
  recordingFetch: typeof fetch;
} {
  const requests: RecordedRequest[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    // The RPC service always sends a JSON-encoded body and plain-object headers.
    const { method } = JSON.parse(init?.body as string) as { method: string };
    const headers = init?.headers as Record<string, string> | undefined;
    requests.push({
      host: getHost(input),
      method,
      authorization: headers?.Authorization ?? null,
    });
    return await fetch(input, init);
  };
  return { requests, recordingFetch };
}

describe('createNetworkClient - Infura auth token', () => {
  it('presents the token as a bearer credential on requests to a built-in Infura endpoint', async () => {
    await withMockedCommunications(
      { providerType: 'infura' },
      async (comms) => {
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });
        const { requests, recordingFetch } = buildRecordingFetch();

        const result = await withNetworkClient(
          {
            providerType: 'infura',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              fetch: recordingFetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken: async () => 'some-token',
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        expect(result).toBe('0xabc');
        expect(requests).toContainEqual({
          host: 'mainnet.infura.io',
          method: 'eth_gasPrice',
          authorization: 'Bearer some-token',
        });
        expect(
          requests.filter(
            ({ authorization }) => authorization !== 'Bearer some-token',
          ),
        ).toStrictEqual([]);
      },
    );
  });

  it('presents the token when no `fetch` is given, wrapping the global one', async () => {
    await withMockedCommunications(
      {
        providerType: 'infura',
        // The mock only matches when the request presents this header.
        expectedHeaders: { Authorization: 'Bearer some-token' },
      },
      async (comms) => {
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });

        const result = await withNetworkClient(
          {
            providerType: 'infura',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken: async () => 'some-token',
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        expect(result).toBe('0xabc');
      },
    );
  });

  it('retrieves the token for each request', async () => {
    await withMockedCommunications(
      { providerType: 'infura' },
      async (comms) => {
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });
        const { requests, recordingFetch } = buildRecordingFetch();
        let tokenCount = 0;
        const getInfuraAuthToken = jest.fn(async () => {
          tokenCount += 1;
          return `token-${tokenCount}`;
        });

        await withNetworkClient(
          {
            providerType: 'infura',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              fetch: recordingFetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken,
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        // The block tracker's request plus the RPC call itself.
        expect(requests.length).toBeGreaterThanOrEqual(2);
        expect(getInfuraAuthToken).toHaveBeenCalledTimes(requests.length);
        expect(
          new Set(requests.map(({ authorization }) => authorization)).size,
        ).toBe(requests.length);
      },
    );
  });

  it('does not present the token on requests to a custom endpoint', async () => {
    await withMockedCommunications(
      { providerType: 'custom' },
      async (comms) => {
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });
        const { requests, recordingFetch } = buildRecordingFetch();
        const getInfuraAuthToken = jest.fn(async () => 'some-token');

        const result = await withNetworkClient(
          {
            providerType: 'custom',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              fetch: recordingFetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken,
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        expect(result).toBe('0xabc');
        expect(getInfuraAuthToken).not.toHaveBeenCalled();
        expect(requests.length).toBeGreaterThan(0);
        expect(
          requests.filter(({ authorization }) => authorization !== null),
        ).toStrictEqual([]);
      },
    );
  });

  it('does not present the token on requests to a failover endpoint', async () => {
    await withMockedCommunications(
      { providerType: 'custom', customRpcUrl: FAILOVER_URL },
      async (failoverComms) => {
        failoverComms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        failoverComms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });
        const { requests, recordingFetch } = buildRecordingFetch();
        const getInfuraAuthToken = jest.fn(async () => 'some-token');

        const result = await withNetworkClient(
          {
            providerType: 'infura',
            failoverRpcUrls: [FAILOVER_URL],
            rpcFailoverMode: 'forced',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              fetch: recordingFetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken,
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        expect(result).toBe('0xabc');
        expect(getInfuraAuthToken).not.toHaveBeenCalled();
        expect(requests.length).toBeGreaterThan(0);
        expect(
          requests.filter(
            ({ host, authorization }) =>
              host !== 'failover.example.com' || authorization !== null,
          ),
        ).toStrictEqual([]);
      },
    );
  });

  it('makes the request without the credential when no token is available', async () => {
    await withMockedCommunications(
      { providerType: 'infura' },
      async (comms) => {
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });
        const { requests, recordingFetch } = buildRecordingFetch();

        const result = await withNetworkClient(
          {
            providerType: 'infura',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              fetch: recordingFetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken: async () => undefined,
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        expect(result).toBe('0xabc');
        expect(requests.length).toBeGreaterThan(0);
        expect(
          requests.filter(({ authorization }) => authorization !== null),
        ).toStrictEqual([]);
      },
    );
  });

  it('makes the request without the credential when retrieving the token fails', async () => {
    await withMockedCommunications(
      { providerType: 'infura' },
      async (comms) => {
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: { method: 'eth_gasPrice', params: [] },
          response: { result: '0xabc' },
        });
        const { requests, recordingFetch } = buildRecordingFetch();

        const result = await withNetworkClient(
          {
            providerType: 'infura',
            messenger: buildRootMessenger(),
            getRpcServiceOptions: () => ({
              fetch: recordingFetch,
              btoa,
              isOffline: (): boolean => false,
            }),
            getInfuraAuthToken: async () => {
              throw new Error('wallet is locked');
            },
          },
          async ({ makeRpcCall }) =>
            await makeRpcCall({ method: 'eth_gasPrice', params: [] }),
        );

        expect(result).toBe('0xabc');
        expect(requests.length).toBeGreaterThan(0);
        expect(
          requests.filter(({ authorization }) => authorization !== null),
        ).toStrictEqual([]);
      },
    );
  });
});
