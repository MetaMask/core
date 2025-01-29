import { TokenSearchApiService } from './token-search-api-service';

describe('TokenSearchApiService', () => {
  const baseUrl = 'https://test-api';
  let service: TokenSearchApiService;
  let mockFetch: jest.SpyInstance;

  const mockResponses = {
    allParams: [
      {
        name: 'Token1',
        symbol: 'TK1',
        chainId: '1',
        tokenAddress: '0x1',
        usdPrice: 100,
        usdPricePercentChange: { oneDay: 10 },
        logoUrl: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x1.png',
      },
      {
        name: 'Token2',
        symbol: 'TK2',
        chainId: '1',
        tokenAddress: '0x2',
        usdPrice: 200,
        usdPricePercentChange: { oneDay: 20 },
      },
    ],
    onlyChain: [
      {
        name: 'ChainToken',
        symbol: 'CTK',
        chainId: '1',
        tokenAddress: '0x3',
        usdPrice: 300,
        usdPricePercentChange: { oneDay: 30 },
        logoUrl: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x3.png',
      },
    ],
    onlyName: [
      {
        name: 'NameMatch',
        symbol: 'NM',
        chainId: '1',
        tokenAddress: '0x4',
        usdPrice: 400,
        usdPricePercentChange: { oneDay: 40 },
      },
    ],
  };

  beforeEach(() => {
    service = new TokenSearchApiService(baseUrl);
    mockFetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('constructor', () => {
    it('should throw if baseUrl is empty', () => {
      expect(() => new TokenSearchApiService('')).toThrow(
        'Portfolio API URL is not set',
      );
    });
  });

  describe('searchTokens', () => {
    it.each([
      {
        params: { chains: ['1'], query: 'Test', limit: '10' },
        expectedUrl: new URL(
          `${baseUrl}/tokens-search?chains=1&query=Test&limit=10`,
        ),
      },
      {
        params: { chains: ['1', '137'], query: 'Test' },
        expectedUrl: new URL(
          `${baseUrl}/tokens-search?chains=1%2C137&query=Test`,
        ),
      },
      {
        params: { query: 'Test' },
        expectedUrl: new URL(`${baseUrl}/tokens-search?query=Test`),
      },
      {
        params: { chains: ['1'] },
        expectedUrl: new URL(`${baseUrl}/tokens-search?chains=1`),
      },
      {
        params: { limit: '20' },
        expectedUrl: new URL(`${baseUrl}/tokens-search?limit=20`),
      },
      {
        params: {},
        expectedUrl: new URL(`${baseUrl}/tokens-search`),
      },
    ])(
      'should construct correct URL for params: $params',
      async ({ params, expectedUrl }) => {
        await service.searchTokens(params);
        expect(mockFetch.mock.calls[0][0].toString()).toBe(
          expectedUrl.toString(),
        );
      },
    );

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Server Error', { status: 500 }),
      );

      await expect(service.searchTokens({})).rejects.toThrow(
        'Portfolio API request failed with status: 500',
      );
    });
  });

  describe('searchTokens response handling', () => {
    it.each([
      {
        params: { chains: ['1'], query: 'Test', limit: '2' },
        mockResponse: mockResponses.allParams,
        description: 'all parameters',
      },
      {
        params: { chains: ['1'] },
        mockResponse: mockResponses.onlyChain,
        description: 'only chain parameter',
      },
      {
        params: { query: 'Name' },
        mockResponse: mockResponses.onlyName,
        description: 'only name parameter',
      },
    ])(
      'should handle response correctly regardless of params',
      async ({ params, mockResponse }) => {
        mockFetch = jest
          .spyOn(global, 'fetch')
          .mockResolvedValue(
            new Response(JSON.stringify(mockResponse), { status: 200 }),
          );

        const response = await service.searchTokens(params);

        expect(response).toStrictEqual(mockResponse);
      },
    );
  });
});
