import nock from 'nock';

import { MOCK_GET_BALANCES_RESPONSE } from './mocks/mock-get-balances';
import { MOCK_GET_SUPPORTED_NETWORKS_RESPONSE } from './mocks/mock-get-supported-networks';
import {
  MULTICHAIN_ACCOUNTS_DOMAIN,
  fetchMultiChainBalances,
  fetchMultiChainBalancesV4,
  fetchSupportedNetworks,
} from './multi-chain-accounts';

const MOCK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const MOCK_CAIP_ADDRESSES = [
  'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  'eip155:137:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
];

describe('fetchSupportedNetworks()', () => {
  const createMockAPI = () =>
    nock(MULTICHAIN_ACCOUNTS_DOMAIN).get('/v1/supportedNetworks');

  it('should successfully return supported networks array', async () => {
    const mockAPI = createMockAPI().reply(
      200,
      MOCK_GET_SUPPORTED_NETWORKS_RESPONSE,
    );

    const result = await fetchSupportedNetworks();
    expect(result).toStrictEqual(
      MOCK_GET_SUPPORTED_NETWORKS_RESPONSE.fullSupport,
    );
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should throw error when fetch fails', async () => {
    const mockAPI = createMockAPI().reply(500);

    await expect(async () => await fetchSupportedNetworks()).rejects.toThrow(
      expect.any(Error),
    );
    expect(mockAPI.isDone()).toBe(true);
  });
});

describe('fetchMultiChainBalances()', () => {
  const createMockAPI = () =>
    nock(MULTICHAIN_ACCOUNTS_DOMAIN).get(
      `/v2/accounts/${MOCK_ADDRESS}/balances`,
    );

  it('should successfully return balances response', async () => {
    const mockAPI = createMockAPI().reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalances(MOCK_ADDRESS, {}, 'extension');
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should successfully return balances response with query params to refine search', async () => {
    const mockAPI = createMockAPI()
      .query({
        networks: '1,10',
      })
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalances(
      MOCK_ADDRESS,
      {
        networks: [1, 10],
      },
      'extension',
    );
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  const testMatrix = [
    { httpCode: 429, httpCodeName: 'Too Many Requests' }, // E.g. Rate Limit
    { httpCode: 422, httpCodeName: 'Unprocessable Content' }, // E.g. fails to fetch any balances from specified chains
    { httpCode: 500, httpCodeName: 'Internal Server Error' }, // E.g. Server Rekt
  ];

  it.each(testMatrix)(
    'should throw when $httpCode "$httpCodeName"',
    async ({ httpCode }) => {
      const mockAPI = createMockAPI().reply(httpCode);

      await expect(
        async () =>
          await fetchMultiChainBalances(MOCK_ADDRESS, {}, 'extension'),
      ).rejects.toThrow(expect.any(Error));
      expect(mockAPI.isDone()).toBe(true);
    },
  );

  it('should successfully return balances response with mobile platform', async () => {
    const mockAPI = createMockAPI().reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalances(MOCK_ADDRESS, {}, 'mobile');
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });
});

describe('fetchMultiChainBalancesV4()', () => {
  const createMockAPI = () =>
    nock(MULTICHAIN_ACCOUNTS_DOMAIN).get('/v4/multiaccount/balances');

  it('should successfully return balances response', async () => {
    const mockAPI = createMockAPI().reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalancesV4({}, 'extension');
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should successfully return balances response with account addresses', async () => {
    const mockAPI = createMockAPI()
      .query({
        accountAddresses: MOCK_CAIP_ADDRESSES.join(),
      })
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalancesV4(
      {
        accountAddresses: MOCK_CAIP_ADDRESSES,
      },
      'extension',
    );
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should successfully return balances response with networks query parameter', async () => {
    const mockAPI = createMockAPI()
      .query({
        networks: '1,137',
        accountAddresses: MOCK_CAIP_ADDRESSES.join(),
      })
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalancesV4(
      {
        accountAddresses: MOCK_CAIP_ADDRESSES,
        networks: [1, 137],
      },
      'extension',
    );
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should successfully return balances response with networks only', async () => {
    const mockAPI = createMockAPI()
      .query({
        networks: '1,10',
      })
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalancesV4(
      {
        networks: [1, 10],
      },
      'extension',
    );
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should successfully return balances response with mobile platform', async () => {
    const mockAPI = createMockAPI().reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalancesV4({}, 'mobile');
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should handle empty account addresses array', async () => {
    const mockAPI = createMockAPI()
      .query({
        accountAddresses: '',
      })
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalancesV4(
      {
        accountAddresses: [],
      },
      'extension',
    );
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  const testMatrixV4 = [
    { httpCode: 429, httpCodeName: 'Too Many Requests' },
    { httpCode: 422, httpCodeName: 'Unprocessable Content' },
    { httpCode: 500, httpCodeName: 'Internal Server Error' },
  ];

  it.each(testMatrixV4)(
    'should throw when $httpCode "$httpCodeName"',
    async ({ httpCode }) => {
      const mockAPI = createMockAPI().reply(httpCode);

      await expect(
        async () => await fetchMultiChainBalancesV4({}, 'extension'),
      ).rejects.toThrow(expect.any(Error));
      expect(mockAPI.isDone()).toBe(true);
    },
  );
});
