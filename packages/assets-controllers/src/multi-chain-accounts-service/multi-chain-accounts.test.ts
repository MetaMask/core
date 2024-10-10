import nock from 'nock';

import { MOCK_GET_BALANCES_RESPONSE } from './mocks/mock-get-balances';
import { fetchMultiChainBalances } from './multi-chain-accounts';

const MOCK_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

describe('fetchMultiChainBalances()', () => {
  const createMockAPI = () =>
    nock('https://accounts.api.cx.metamask.io').get(
      `/v2/accounts/${MOCK_ADDRESS}/balances`,
    );

  it('should successfully return balances response', async () => {
    const mockAPI = createMockAPI().reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalances(MOCK_ADDRESS);
    expect(result).toBeDefined();
    expect(result).toStrictEqual(MOCK_GET_BALANCES_RESPONSE);
    expect(mockAPI.isDone()).toBe(true);
  });

  it('should successfully return balances response with query params to refine search', async () => {
    const mockAPI = createMockAPI()
      .query({
        networks: '1,10',
        filterSupportedTokens: 'true',
        includeTokenAddresses: 'abc',
        includeStakedAssets: 'false',
      })
      .reply(200, MOCK_GET_BALANCES_RESPONSE);

    const result = await fetchMultiChainBalances(MOCK_ADDRESS, {
      networks: '1,10',
      filterSupportedTokens: true,
      includeTokenAddresses: 'abc',
      includeStakedAssets: false,
    });
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
        async () => await fetchMultiChainBalances(MOCK_ADDRESS),
      ).rejects.toThrow(expect.any(Error));
      expect(mockAPI.isDone()).toBe(true);
    },
  );
});
