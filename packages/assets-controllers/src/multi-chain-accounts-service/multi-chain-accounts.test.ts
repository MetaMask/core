import nock from 'nock';

import { MOCK_GET_BALANCES_RESPONSE } from './mocks/mock-get-balances';
import { MOCK_GET_SUPPORTED_NETWORKS_RESPONSE } from './mocks/mock-get-supported-networks';
import {
  MULTICHAIN_ACCOUNTS_DOMAIN,
  fetchMultiChainBalances,
  fetchSupportedNetworks,
} from './multi-chain-accounts';

const MOCK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const MOCK_ACCESS_TOKEN = 'mock-access-token';
const mockAuthenticationControllerGetBearerToken = jest.fn();

describe('fetchSupportedNetworks()', () => {
  const createMockAPI = () =>
    nock(MULTICHAIN_ACCOUNTS_DOMAIN).get('/v1/supportedNetworks');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticationControllerGetBearerToken.mockResolvedValue(
      MOCK_ACCESS_TOKEN,
    );
  });

  it('should successfully return supported networks array', async () => {
    const mockAPI = createMockAPI().reply(
      200,
      MOCK_GET_SUPPORTED_NETWORKS_RESPONSE,
    );

    const result = await fetchSupportedNetworks({
      getAuthenticationControllerBearerToken:
        mockAuthenticationControllerGetBearerToken,
    });
    expect(result).toStrictEqual(
      MOCK_GET_SUPPORTED_NETWORKS_RESPONSE.fullSupport,
    );
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should attach the correct Authorization header', async () => {
    const mockAPI = createMockAPI()
      .matchHeader('Authorization', `Bearer ${MOCK_ACCESS_TOKEN}`)
      .reply(200, MOCK_GET_SUPPORTED_NETWORKS_RESPONSE);

    await fetchSupportedNetworks({
      getAuthenticationControllerBearerToken:
        mockAuthenticationControllerGetBearerToken,
    });
    expect(mockAuthenticationControllerGetBearerToken).toHaveBeenCalledTimes(1);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should throw error when fetch fails', async () => {
    const mockAPI = createMockAPI().reply(500);

    await expect(
      async () =>
        await fetchSupportedNetworks({
          getAuthenticationControllerBearerToken:
            mockAuthenticationControllerGetBearerToken,
        }),
    ).rejects.toThrow(expect.any(Error));
    expect(mockAPI.isDone()).toBe(true);
  });
});

describe('fetchMultiChainBalances()', () => {
  const createMockAPI = () =>
    nock(MULTICHAIN_ACCOUNTS_DOMAIN).get(
      `/v2/accounts/${MOCK_ADDRESS}/balances`,
    );

  beforeEach(() => {
    mockAuthenticationControllerGetBearerToken.mockResolvedValue(
      MOCK_ACCESS_TOKEN,
    );
  });

  it('should successfully return balances response', async () => {
    const mockAPI = createMockAPI().reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalances(
      MOCK_ADDRESS,
      {
        getAuthenticationControllerBearerToken:
          mockAuthenticationControllerGetBearerToken,
      },
      'extension',
    );
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should attach the correct Authorization header', async () => {
    const mockAPI = createMockAPI()
      .matchHeader('Authorization', `Bearer ${MOCK_ACCESS_TOKEN}`)
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    await fetchMultiChainBalances(
      MOCK_ADDRESS,
      {
        getAuthenticationControllerBearerToken:
          mockAuthenticationControllerGetBearerToken,
      },
      'extension',
    );
    expect(mockAuthenticationControllerGetBearerToken).toHaveBeenCalledTimes(1);
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
        getAuthenticationControllerBearerToken:
          mockAuthenticationControllerGetBearerToken,
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
          await fetchMultiChainBalances(
            MOCK_ADDRESS,
            {
              getAuthenticationControllerBearerToken:
                mockAuthenticationControllerGetBearerToken,
            },
            'extension',
          ),
      ).rejects.toThrow(expect.any(Error));
      expect(mockAPI.isDone()).toBe(true);
    },
  );
});
