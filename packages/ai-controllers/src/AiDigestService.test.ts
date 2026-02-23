import type { CaipAssetType } from '@metamask/utils';

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

    it('fetches market insights from API using caipAssetType', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMarketInsightsReport),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as CaipAssetType,
      );

      expect(result).toStrictEqual(mockMarketInsightsReport);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/v1/digests?caipAssetType=eip155%3A1%2Ferc20%3A0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      );
    });

    it('accepts digest envelope responses', async () => {
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
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as CaipAssetType,
      );

      expect(result).toStrictEqual(mockMarketInsightsReport);
    });

    it('accepts report responses with top-level social items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ...mockMarketInsightsReport,
            social: [
              {
                contentSummary: 'BTC remains under macro pressure.',
                url: 'https://x.com/example/status/456',
                author: 'example',
                date: '2026-02-17',
              },
            ],
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as CaipAssetType,
      );

      expect(result).toStrictEqual({
        ...mockMarketInsightsReport,
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
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as CaipAssetType,
      );

      expect(result).toStrictEqual({
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
      });
    });

    it('returns null when API returns 404', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });
      const result = await service.searchDigest(
        'eip155:1/erc20:0xunknown' as CaipAssetType,
      );

      expect(result).toBeNull();
    });

    it('throws on non-404 non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
      ).rejects.toThrow('API request failed: 500');
    });

    it('throws when response schema is invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            asset: 'btc',
            generatedAt: '2026-02-16T10:00:00.000Z',
            headline: 'BTC market update',
            summary: 'Momentum is positive across major venues.',
            trends: 'invalid-trends',
            sources: [],
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when a trend has invalid nested properties', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
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
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when a source has invalid nested properties', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
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
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });

    it('throws when version exists but is not a string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            version: 1,
            asset: 'btc',
            generatedAt: '2026-02-16T10:00:00.000Z',
            headline: 'BTC market update',
            summary: 'Momentum is positive across major venues.',
            trends: [],
            sources: [],
          }),
      });

      const service = new AiDigestService({
        baseUrl: 'http://test.com/api/v1',
      });

      await expect(
        service.searchDigest('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
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
        service.searchDigest('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
      ).rejects.toThrow(AiDigestControllerErrorMessage.API_INVALID_RESPONSE);
    });
  });
});
