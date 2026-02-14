import { AiDigestService } from '.';

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
    it('returns mock market insights for BTC-related CAIP-19 identifiers', async () => {
      const service = new AiDigestService({ baseUrl: 'http://test.com' });
      const result = await service.searchDigests('eip155:1/slip44:0');

      expect(result).not.toBeNull();
      expect(result?.asset).toBe('btc');
      expect(result?.headline).toBeDefined();
      expect(result?.trends).toHaveLength(3);
      expect(result?.sources).toHaveLength(5);
    });

    it('returns null for unknown assets', async () => {
      const service = new AiDigestService({ baseUrl: 'http://test.com' });
      const result = await service.searchDigests('eip155:1/erc20:0xunknown');

      expect(result).toBeNull();
    });

    it('returns mock data for CAIP-19 identifiers containing "btc"', async () => {
      const service = new AiDigestService({ baseUrl: 'http://test.com' });
      const result = await service.searchDigests('bip122:btc/slip44:0');

      expect(result).not.toBeNull();
      expect(result?.asset).toBe('btc');
    });
  });
});
