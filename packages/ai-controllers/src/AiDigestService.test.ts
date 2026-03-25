import { AiDigestService } from '.';
import { AiDigestControllerErrorMessage } from './ai-digest-constants';

describe('AiDigestService', () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('searchDigest', () => {
    const mockMarketInsightsReport = {
      asset: 'btc',
      generatedAt: '2026-02-16T10:00:00.000Z',
      headline: 'BTC market update',
      summary: 'Momentum is positive across major venues.',
      trends: [
        {
          title: 'Institutions continue buying',
          description: 'Large holders have increased accumulation activity.',
          category: 'macro',
          impact: 'positive',
          articles: [
            {
              title: 'Institutional demand grows',
              url: 'https://example.com/news/institutional-demand-grows',
              source: 'example.com',
              date: '2026-02-16T08:00:00.000Z',
            },
          ],
          tweets: [
            {
              contentSummary: 'Momentum remains strong according to analysts.',
              url: 'https://x.com/example/status/123',
              author: '@example',
              date: '2026-02-16T09:00:00.000Z',
            },
          ],
        },
      ],
      sources: [
        {
          name: 'Example News',
          url: 'https://example.com',
          type: 'news',
        },
      ],
    };

    const mockEnvelope = {
      id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
      digest: mockMarketInsightsReport,
    };

    it('fetches market insights using universal asset= param for CAIP-19 identifiers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockEnvelope),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      );

      expect(result).toStrictEqual({
        ...mockMarketInsightsReport,
        digestId: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/v1/asset-summary?asset=eip155%3A1%2Ferc20%3A0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      );
    });

    it('fetches market insights using universal asset= param for ticker symbols', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockEnvelope),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest('ETH');

      expect(result).toStrictEqual({
        ...mockMarketInsightsReport,
        digestId: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/v1/asset-summary?asset=ETH',
      );
    });

    it('encodes the perps market symbol in the URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockEnvelope),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      await service.searchDigest('xyz:TSLA');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/v1/asset-summary?asset=xyz%3ATSLA',
      );
    });

    it('extracts digestId from the envelope id field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockEnvelope),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      );

      expect(result).toStrictEqual({
        ...mockMarketInsightsReport,
        digestId: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
      });
    });

    it('throws when envelope id is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            digest: mockMarketInsightsReport,
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest(
          'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        ),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('accepts report responses with top-level social items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              ...mockMarketInsightsReport,
              social: [
                {
                  contentSummary: 'BTC remains under macro pressure.',
                  url: 'https://x.com/example/status/456',
                  author: 'example',
                  date: '2026-02-17',
                },
              ],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      );

      expect(result).toStrictEqual({
        ...mockMarketInsightsReport,
        digestId: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
        social: [
          {
            contentSummary: 'BTC remains under macro pressure.',
            url: 'https://x.com/example/status/456',
            author: 'example',
            date: '2026-02-17',
          },
        ],
      });
    });

    it('accepts additional unknown fields in nested payloads', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              ...mockMarketInsightsReport,
              extraTopLevelField: true,
              trends: [
                {
                  ...mockMarketInsightsReport.trends[0],
                  extraTrendField: 'ignored',
                  articles: [
                    {
                      ...mockMarketInsightsReport.trends[0].articles[0],
                      extraArticleField: 'ignored',
                    },
                  ],
                },
              ],
              sources: [
                {
                  ...mockMarketInsightsReport.sources[0],
                  extraSourceField: 'ignored',
                },
              ],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      );

      expect(result).toStrictEqual({
        ...mockMarketInsightsReport,
        digestId: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
        extraTopLevelField: true,
        trends: [
          {
            ...mockMarketInsightsReport.trends[0],
            extraTrendField: 'ignored',
            articles: [
              {
                ...mockMarketInsightsReport.trends[0].articles[0],
                extraArticleField: 'ignored',
              },
            ],
          },
        ],
        sources: [
          {
            ...mockMarketInsightsReport.sources[0],
            extraSourceField: 'ignored',
          },
        ],
      });
    });

    it('returns null when API returns 404', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest('eip155:1/erc20:0xunknown');

      expect(result).toBeNull();
    });

    it('throws on non-404 non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow('API request failed: 500');
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              asset: 'btc',
              generatedAt: '2026-02-16T10:00:00.000Z',
              headline: 'BTC market update',
              summary: 'Momentum is positive across major venues.',
              trends: 'invalid-trends',
              sources: [],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when a trend has invalid nested properties', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              asset: 'btc',
              generatedAt: '2026-02-16T10:00:00.000Z',
              headline: 'BTC market update',
              summary: 'Momentum is positive across major venues.',
              trends: [
                {
                  title: 'Institutions continue buying',
                  description:
                    'Large holders have increased accumulation activity.',
                  category: 'macro',
                  impact: 'positive',
                  articles: [
                    {
                      title: 'Institutional demand grows',
                      url: 'https://example.com/news/institutional-demand-grows',
                      source: 'example.com',
                      date: 1234,
                    },
                  ],
                  tweets: [],
                },
              ],
              sources: [],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when a source has invalid nested properties', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              asset: 'btc',
              generatedAt: '2026-02-16T10:00:00.000Z',
              headline: 'BTC market update',
              summary: 'Momentum is positive across major venues.',
              trends: [],
              sources: [
                {
                  name: 'Example News',
                  url: 'https://example.com',
                  type: null,
                },
              ],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when version exists but is not a string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              version: 1,
              asset: 'btc',
              generatedAt: '2026-02-16T10:00:00.000Z',
              headline: 'BTC market update',
              summary: 'Momentum is positive across major venues.',
              trends: [],
              sources: [],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when response body is not an object', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(null),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when a trend has an invalid category value', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              ...mockMarketInsightsReport,
              trends: [
                {
                  ...mockMarketInsightsReport.trends[0],
                  category: 'unknown-category',
                },
              ],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when a trend has an invalid impact value', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'a8154c57-c665-449c-8bb5-fcaae96ef922',
            digest: {
              ...mockMarketInsightsReport,
              trends: [
                {
                  ...mockMarketInsightsReport.trends[0],
                  impact: 'unknown-impact',
                },
              ],
            },
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef'),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });
  });

  describe('fetchMarketOverview', () => {
    const mockRelatedAsset = {
      name: 'Bitcoin',
      symbol: 'BTC',
      caip19: ['bip122:000000000019d6689c085ae165831e93/slip44:0'],
      sourceAssetId: 'bitcoin',
      hlPerpsMarket: 'BTC',
    };

    const mockMarketOverview = {
      version: '1.0',
      generatedAt: '2026-02-16T10:00:00.000Z',
      trends: [
        {
          title: 'Institutional adoption',
          description: 'Institutional players continue accumulating.',
          category: 'macro',
          impact: 'positive',
          articles: [
            {
              title: 'Crypto adoption rises',
              url: 'https://example.com/crypto-adoption',
              source: 'example.com',
              date: '2026-02-16',
            },
          ],
          relatedAssets: [mockRelatedAsset],
        },
      ],
    };

    it('fetches market overview from correct endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMarketOverview),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.fetchMarketOverview();

      expect(result).toStrictEqual(mockMarketOverview);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/v1/market-overview',
      );
    });

    it('accepts report envelope responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            report: mockMarketOverview,
            generatedAt: '2026-02-16T10:00:00.000Z',
            processingTime: 12345,
            success: true,
            error: null,
            createdAt: '2026-02-16T10:00:00.000Z',
            updatedAt: '2026-02-16T10:00:00.000Z',
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.fetchMarketOverview();

      expect(result).toStrictEqual(mockMarketOverview);
    });

    it('returns null when API returns 404', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.fetchMarketOverview();

      expect(result).toBeNull();
    });

    it('throws on non-404 non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(service.fetchMarketOverview()).rejects.toThrow(
        'API request failed: 500',
      );
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            generatedAt: '2026-02-16T10:00:00.000Z',
            trends: 'invalid-trends',
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(service.fetchMarketOverview()).rejects.toThrow(
        AiDigestControllerErrorMessage.API_INVALID_RESPONSE,
      );
    });

    it('throws when a trend has an invalid category value', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockMarketOverview,
            trends: [
              {
                ...mockMarketOverview.trends[0],
                category: 'unknown-category',
              },
            ],
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(service.fetchMarketOverview()).rejects.toThrow(
        AiDigestControllerErrorMessage.API_INVALID_RESPONSE,
      );
    });

    it('throws when a trend has an invalid impact value', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockMarketOverview,
            trends: [
              {
                ...mockMarketOverview.trends[0],
                impact: 'unknown-impact',
              },
            ],
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(service.fetchMarketOverview()).rejects.toThrow(
        AiDigestControllerErrorMessage.API_INVALID_RESPONSE,
      );
    });

    it('throws when response body is not an object', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(null),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(service.fetchMarketOverview()).rejects.toThrow(
        AiDigestControllerErrorMessage.API_INVALID_RESPONSE,
      );
    });

    it('accepts response without optional version field', async () => {
      const { version: _version, ...withoutVersion } = mockMarketOverview;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(withoutVersion),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.fetchMarketOverview();

      expect(result).toStrictEqual(withoutVersion);
    });

    it('accepts response with optional metadata field', async () => {
      const withMetadata = {
        ...mockMarketOverview,
        metadata: [{ provider: 'openai' }],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(withMetadata),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.fetchMarketOverview();

      expect(result).toStrictEqual(withMetadata);
    });

    it('throws when a trend has an invalid relatedAssets entry', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockMarketOverview,
            trends: [
              {
                ...mockMarketOverview.trends[0],
                relatedAssets: [{ name: 'Bitcoin' }], // missing required fields
              },
            ],
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(service.fetchMarketOverview()).rejects.toThrow(
        AiDigestControllerErrorMessage.API_INVALID_RESPONSE,
      );
    });

    it('accepts additional unknown fields in payload', async () => {
      const withExtras = {
        ...mockMarketOverview,
        extraTopLevelField: true,
        trends: [
          {
            ...mockMarketOverview.trends[0],
            extraTrendField: 'ignored',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(withExtras),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.fetchMarketOverview();

      expect(result).toStrictEqual(withExtras);
    });
  });
});
