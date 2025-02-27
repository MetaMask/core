import { fetchPositions } from './fetch-positions';

describe('fetchPositions', () => {
  const mockAccountAddress = '0x1234567890123456789012345678901234567890';
  const mockApiUrl =
    'https://defi-services.metamask-institutional.io/defi-data/positions';

  function mockNextFetchResponse(status: number, jsonResponse?: unknown) {
    const mockFetch = jest.spyOn(global, 'fetch');
    mockFetch.mockResolvedValueOnce({
      status,
      ...(!!jsonResponse && {
        json: () => Promise.resolve(jsonResponse),
      }),
    } as unknown as Response);
  }

  it('handles successful responses', async () => {
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

    mockNextFetchResponse(200, mockResponse);

    const result = await fetchPositions(mockAccountAddress);

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockApiUrl}/${mockAccountAddress}`,
    );
    expect(result).toEqual(mockResponse.data);
  });

  it('handles non-200 responses', async () => {
    mockNextFetchResponse(400);

    await expect(fetchPositions(mockAccountAddress)).rejects.toThrow(
      'Unable to fetch defi positions - HTTP 400',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockApiUrl}/${mockAccountAddress}`,
    );
  });
});
