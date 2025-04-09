import nock from 'nock';

import {
  DEFAULT_DEFI_POSITIONS_API_URL,
  buildPositionFetcher,
} from './fetch-positions';

describe('fetchPositions', () => {
  const mockAccountAddress = '0x1234567890123456789012345678901234567890';

  const mockResponse = {
    data: [
      {
        chainId: 1,
        chainName: 'Ethereum Mainnet',
        protocolId: 'aave-v3',
        productId: 'lending',
        name: 'Aave V3',
        description: 'Lending protocol',
        iconUrl: 'https://example.com/icon.png',
        siteUrl: 'https://example.com',
        positionType: 'supply',
        success: true,
        tokens: [
          {
            type: 'protocol',
            address: '0xtoken',
            name: 'Test Token',
            symbol: 'TEST',
            decimals: 18,
            balanceRaw: '1000000000000000000',
            balance: 1,
            price: 100,
            iconUrl: 'https://example.com/token.png',
          },
        ],
      },
    ],
  };

  it('handles successful responses', async () => {
    const scope = nock(DEFAULT_DEFI_POSITIONS_API_URL)
      .get(`/positions/${mockAccountAddress}`)
      .reply(200, mockResponse);

    const fetchPositions = buildPositionFetcher();

    const result = await fetchPositions(mockAccountAddress);

    expect(result).toStrictEqual(mockResponse.data);
    expect(scope.isDone()).toBe(true);
  });

  it('allows the use of a custom API URL', async () => {
    const customApiUrl = 'http://mock-api.metamask.io';

    const scope = nock(customApiUrl)
      .get(`/positions/${mockAccountAddress}`)
      .reply(200, mockResponse);

    const fetchPositions = buildPositionFetcher(customApiUrl);

    const result = await fetchPositions(mockAccountAddress);

    expect(result).toStrictEqual(mockResponse.data);
    expect(scope.isDone()).toBe(true);
  });

  it('handles non-200 responses', async () => {
    const scope = nock(DEFAULT_DEFI_POSITIONS_API_URL)
      .get(`/positions/${mockAccountAddress}`)
      .reply(400);

    const fetchPositions = buildPositionFetcher();

    await expect(fetchPositions(mockAccountAddress)).rejects.toThrow(
      'Unable to fetch defi positions - HTTP 400',
    );

    expect(scope.isDone()).toBe(true);
  });
});
