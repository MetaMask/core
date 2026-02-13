import { Messenger } from '@metamask/messenger';

import {
  AiDigestController,
  getDefaultAiDigestControllerState,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from '.';
import type {
  AiDigestControllerMessenger,
  DigestService,
  MarketInsightsReport,
} from '.';

const mockData = {
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

const mockMarketInsightsReport: MarketInsightsReport = {
  version: '1.0',
  asset: 'btc',
  generatedAt: '2026-02-11T10:32:52.403Z',
  headline: 'BTC Dips 50% to $68K',
  summary: 'Bitcoin trades around $68,000 after a sharp correction.',
  trends: [
    {
      title: 'Institutions Buying the Dip',
      description: 'Prominent investors are accumulating BTC.',
      category: 'macro',
      impact: 'positive',
      articles: [
        {
          title: 'Tom Lee says buy the dip',
          url: 'https://example.com/article',
          source: 'coindesk.com',
          date: '2026-02-11',
        },
      ],
      tweets: [
        {
          contentSummary: 'Buy BTC now.',
          url: 'https://x.com/status/123',
          author: '@testuser',
          date: '2026-02-10',
        },
      ],
    },
  ],
  sources: [
    { name: 'CoinDesk', url: 'https://www.coindesk.com', type: 'news' },
  ],
};

const createMessenger = (): AiDigestControllerMessenger => {
  return new Messenger({
    namespace: 'AiDigestController',
  }) as AiDigestControllerMessenger;
};

const createMockService = (
  overrides?: Partial<DigestService>,
): DigestService => ({
  fetchDigest: jest.fn().mockResolvedValue(mockData),
  searchDigests: jest.fn().mockResolvedValue(mockMarketInsightsReport),
  ...overrides,
});

describe('AiDigestController', () => {
  it('returns default state', () => {
    expect(getDefaultAiDigestControllerState()).toStrictEqual({
      digests: {},
      marketInsights: {},
    });
  });

  it('fetches and caches a digest', async () => {
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    const result = await controller.fetchDigest('ethereum');

    expect(result).toStrictEqual(mockData);
    expect(controller.state.digests.ethereum).toBeDefined();
    expect(controller.state.digests.ethereum.data).toStrictEqual(mockData);
  });

  it('returns cached digest on subsequent calls', async () => {
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await controller.fetchDigest('ethereum');
    await controller.fetchDigest('ethereum');

    expect(mockService.fetchDigest).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache expires', async () => {
    jest.useFakeTimers();
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await controller.fetchDigest('ethereum');
    jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
    await controller.fetchDigest('ethereum');

    expect(mockService.fetchDigest).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('throws on fetch errors', async () => {
    const mockService = createMockService({
      fetchDigest: jest.fn().mockRejectedValue(new Error('Network error')),
    });
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await expect(controller.fetchDigest('ethereum')).rejects.toThrow(
      'Network error',
    );
    expect(controller.state.digests.ethereum).toBeUndefined();
  });

  it('clears a specific digest', async () => {
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await controller.fetchDigest('ethereum');
    controller.clearDigest('ethereum');

    expect(controller.state.digests.ethereum).toBeUndefined();
  });

  it('clears all digests', async () => {
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await controller.fetchDigest('ethereum');
    await controller.fetchDigest('bitcoin');
    controller.clearAllDigests();

    expect(controller.state.digests).toStrictEqual({});
  });

  it('evicts stale entries on fetch', async () => {
    jest.useFakeTimers();
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await controller.fetchDigest('ethereum');
    jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
    await controller.fetchDigest('bitcoin');

    expect(controller.state.digests.ethereum).toBeUndefined();
    expect(controller.state.digests.bitcoin).toBeDefined();
    jest.useRealTimers();
  });

  it('evicts oldest entries when exceeding max cache size', async () => {
    const mockService = createMockService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    for (let i = 0; i < MAX_CACHE_ENTRIES + 1; i++) {
      await controller.fetchDigest(`asset${i}`);
    }

    expect(Object.keys(controller.state.digests)).toHaveLength(
      MAX_CACHE_ENTRIES,
    );
    expect(controller.state.digests.asset0).toBeUndefined();
  });

  it('registers action handlers', async () => {
    const mockService = createMockService();
    const messenger = createMessenger();
    const controller = new AiDigestController({
      messenger,
      digestService: mockService,
    });

    const result = await messenger.call(
      'AiDigestController:fetchDigest',
      'ethereum',
    );
    expect(result).toStrictEqual(mockData);

    messenger.call('AiDigestController:clearDigest', 'ethereum');
    messenger.call('AiDigestController:clearAllDigests');

    expect(controller.state.digests).toStrictEqual({});
  });

  it('uses expected cache constants', () => {
    expect(CACHE_DURATION_MS).toBe(10 * 60 * 1000);
    expect(MAX_CACHE_ENTRIES).toBe(50);
  });

  // --- Market Insights tests ---

  describe('fetchMarketInsights', () => {
    it('fetches and caches market insights', async () => {
      const mockService = createMockService();
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      const result = await controller.fetchMarketInsights('eip155:1/slip44:0');

      expect(result).toStrictEqual(mockMarketInsightsReport);
      expect(
        controller.state.marketInsights['eip155:1/slip44:0'],
      ).toBeDefined();
      expect(
        controller.state.marketInsights['eip155:1/slip44:0'].data,
      ).toStrictEqual(mockMarketInsightsReport);
    });

    it('returns cached market insights on subsequent calls', async () => {
      const mockService = createMockService();
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      await controller.fetchMarketInsights('eip155:1/slip44:0');
      await controller.fetchMarketInsights('eip155:1/slip44:0');

      expect(mockService.searchDigests).toHaveBeenCalledTimes(1);
    });

    it('refetches market insights after cache expires', async () => {
      jest.useFakeTimers();
      const mockService = createMockService();
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      await controller.fetchMarketInsights('eip155:1/slip44:0');
      jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
      await controller.fetchMarketInsights('eip155:1/slip44:0');

      expect(mockService.searchDigests).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('returns null when no insights exist (404)', async () => {
      const mockService = createMockService({
        searchDigests: jest.fn().mockResolvedValue(null),
      });
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      const result = await controller.fetchMarketInsights('unknown-asset');

      expect(result).toBeNull();
      expect(controller.state.marketInsights['unknown-asset']).toBeUndefined();
    });

    it('clears stale cache when service returns null', async () => {
      const mockService = createMockService();
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      // First fetch succeeds
      await controller.fetchMarketInsights('eip155:1/slip44:0');
      expect(
        controller.state.marketInsights['eip155:1/slip44:0'],
      ).toBeDefined();

      // Service now returns null (e.g. insights expired on server)
      (mockService.searchDigests as jest.Mock).mockResolvedValue(null);
      jest.useFakeTimers();
      jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
      const result = await controller.fetchMarketInsights('eip155:1/slip44:0');

      expect(result).toBeNull();
      expect(
        controller.state.marketInsights['eip155:1/slip44:0'],
      ).toBeUndefined();
      jest.useRealTimers();
    });

    it('clears market insights for a specific asset', async () => {
      const mockService = createMockService();
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      await controller.fetchMarketInsights('eip155:1/slip44:0');
      controller.clearMarketInsights('eip155:1/slip44:0');

      expect(
        controller.state.marketInsights['eip155:1/slip44:0'],
      ).toBeUndefined();
    });

    it('evicts stale market insights entries on fetch', async () => {
      jest.useFakeTimers();
      const mockService = createMockService();
      const controller = new AiDigestController({
        messenger: createMessenger(),
        digestService: mockService,
      });

      await controller.fetchMarketInsights('asset-a');
      jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
      await controller.fetchMarketInsights('asset-b');

      expect(controller.state.marketInsights['asset-a']).toBeUndefined();
      expect(controller.state.marketInsights['asset-b']).toBeDefined();
      jest.useRealTimers();
    });

    it('registers fetchMarketInsights messenger action', async () => {
      const mockService = createMockService();
      const messenger = createMessenger();
      const controller = new AiDigestController({
        messenger,
        digestService: mockService,
      });

      const result = await messenger.call(
        'AiDigestController:fetchMarketInsights',
        'eip155:1/slip44:0',
      );
      expect(result).toStrictEqual(mockMarketInsightsReport);
      expect(controller.state.marketInsights).toBeDefined();
    });

    it('registers clearMarketInsights messenger action', async () => {
      const mockService = createMockService();
      const messenger = createMessenger();
      const controller = new AiDigestController({
        messenger,
        digestService: mockService,
      });

      await controller.fetchMarketInsights('eip155:1/slip44:0');
      messenger.call(
        'AiDigestController:clearMarketInsights',
        'eip155:1/slip44:0',
      );

      expect(
        controller.state.marketInsights['eip155:1/slip44:0'],
      ).toBeUndefined();
    });
  });
});
