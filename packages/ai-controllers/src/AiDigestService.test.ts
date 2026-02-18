import { AiDigestService } from '.';
import type { CaipAssetType } from '@metamask/utils';

const mockDigestResponse = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  assetId: 'eth-ethereum',
  assetSymbol: 'ETH',
  digest: 'ETH is trading at $3,245.67 (+2.3% 24h).',
  generatedAt: '2026-01-21T10:30:00.000Z',
  processingTime: 1523,
  success: true,
  createdAt: '2026-01-21T10:30:00.000Z',
  updatedAt: '2026-01-21T10:30:00.000Z',
};

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

  it('fetches latest digest from API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDigestResponse),
    });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });
    const result = await service.fetchDigest('eth-ethereum');

    expect(result).toStrictEqual(mockDigestResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://test.com/digests/assets/${encodeURIComponent('eth-ethereum')}/latest`,
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });

    await expect(service.fetchDigest('eth-ethereum')).rejects.toThrow(
      'API request failed: 500',
    );
  });

  it('throws on unsuccessful response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDigestResponse,
          success: false,
          error: 'Asset not found',
        }),
    });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });

    await expect(service.fetchDigest('invalid-asset')).rejects.toThrow(
      'Asset not found',
    );
  });

  it('throws default error when no error message provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDigestResponse,
          success: false,
          error: undefined,
        }),
    });

    const service = new AiDigestService({ baseUrl: 'http://test.com' });

    await expect(service.fetchDigest('invalid-asset')).rejects.toThrow(
      'API returned error',
    );
  });

  describe('searchDigests', () => {
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
      const result = await service.searchDigests(
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
      const result = await service.searchDigests(
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
        service.searchDigests('eip155:1/erc20:0xdeadbeef' as CaipAssetType),
      ).rejects.toThrow('API request failed: 500');
    });
  });
});
