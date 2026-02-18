import { AiDigestService } from '.';
import type { CaipAssetType } from '@metamask/utils';

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
      version: '1.0',
      asset: 'btc',
      generatedAt: '2026-02-16T10:00:00.000Z',
      headline: 'BTC market update',
      summary: 'Momentum is positive across major venues.',
      trends: [],
      sources: [],
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
  });
});
