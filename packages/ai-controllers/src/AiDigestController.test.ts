import { Messenger } from '@metamask/messenger';

import {
  AiDigestController,
  getDefaultAiDigestControllerState,
  AiDigestControllerErrorMessage,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from './index.js';
import type {
  AiDigestControllerMessenger,
  DigestService,
  MarketInsightsReport,
  MarketOverview,
  MarketOverviewFrontPage,
} from './index.js';

const mockReport: MarketInsightsReport = {
  version: '1.0',
  asset: 'btc',
  generatedAt: '2026-02-11T10:32:52.403Z',
  headline: 'BTC update',
  summary: 'Momentum remains positive.',
  trends: [],
  sources: [],
};

const mockOverview: MarketOverview = {
  version: '1.0',
  generatedAt: '2026-02-11T10:32:52.403Z',
  trends: [],
};

const mockFrontPage: MarketOverviewFrontPage = {
  id: 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  item: {
    title: 'Institutional adoption',
    description: 'Institutional players continue accumulating.',
    category: 'macro',
    impact: 'positive',
    articles: [],
    relatedAssets: [],
  },
  ctaTitle: 'Majors steady as volatility cools',
  ctaDescription: 'Bitcoin and Ethereum held firm as funding rates normalized.',
  createdAt: '2026-02-11T10:32:52.403Z',
};

const createMessenger = (): AiDigestControllerMessenger =>
  new Messenger({
    namespace: 'AiDigestController',
  }) as AiDigestControllerMessenger;

const createService = (overrides?: Partial<DigestService>): DigestService => ({
  searchDigest: jest.fn().mockResolvedValue(mockReport),
  fetchMarketOverview: jest.fn().mockResolvedValue(mockOverview),
  fetchFrontPageItem: jest.fn().mockResolvedValue(mockFrontPage),
  ...overrides,
});

describe('AiDigestController (market insights)', () => {
  it('returns default state', () => {
    expect(getDefaultAiDigestControllerState()).toStrictEqual({
      marketInsights: {},
      marketOverview: null,
    });
  });

  it('uses expected cache constants', () => {
    expect(CACHE_DURATION_MS).toBe(10 * 60 * 1000);
    expect(MAX_CACHE_ENTRIES).toBe(50);
  });

  it('registers fetch action on messenger', async () => {
    const digestService = createService();
    const messenger = createMessenger();
    const controller = new AiDigestController({ messenger, digestService });

    const result = await messenger.call(
      'AiDigestController:fetchMarketInsights',
      'eip155:1/slip44:0',
    );

    expect(result).toStrictEqual(mockReport);
    expect(controller.state.marketInsights['eip155:1/slip44:0']).toBeDefined();
  });

  it('caches successful response and returns cache while fresh', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketInsights('eip155:1/slip44:0');
    await controller.fetchMarketInsights('eip155:1/slip44:0');

    expect(digestService.searchDigest).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache expiration', async () => {
    jest.useFakeTimers();
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketInsights('eip155:1/slip44:0');
    jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
    await controller.fetchMarketInsights('eip155:1/slip44:0');

    expect(digestService.searchDigest).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('throws for empty asset identifier', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await expect(controller.fetchMarketInsights('')).rejects.toThrow(
      AiDigestControllerErrorMessage.INVALID_ASSET_IDENTIFIER,
    );
    expect(digestService.searchDigest).not.toHaveBeenCalled();
  });

  it('accepts a perps market symbol as asset identifier', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });
    const perpsSymbol = 'ETH';

    const result = await controller.fetchMarketInsights(perpsSymbol);

    expect(result).toStrictEqual(mockReport);
    expect(digestService.searchDigest).toHaveBeenCalledWith(perpsSymbol);
    expect(controller.state.marketInsights[perpsSymbol]).toBeDefined();
  });

  it('caches perps and CAIP-19 identifiers independently', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });
    const perpsSymbol = 'ETH';
    const caip19Id = 'eip155:1/slip44:60';

    await controller.fetchMarketInsights(perpsSymbol);
    await controller.fetchMarketInsights(caip19Id);

    expect(digestService.searchDigest).toHaveBeenCalledTimes(2);
    expect(controller.state.marketInsights[perpsSymbol]).toBeDefined();
    expect(controller.state.marketInsights[caip19Id]).toBeDefined();
  });

  it('removes stale entry when service returns null', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketInsights('eip155:1/slip44:0');
    (digestService.searchDigest as jest.Mock).mockResolvedValue(null);
    jest.useFakeTimers();
    jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
    const result = await controller.fetchMarketInsights('eip155:1/slip44:0');
    jest.useRealTimers();

    expect(result).toBeNull();
    expect(
      controller.state.marketInsights['eip155:1/slip44:0'],
    ).toBeUndefined();
  });

  it('evicts stale and oldest entries', async () => {
    jest.useFakeTimers();
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketInsights('eip155:1/slip44:1');
    jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
    await controller.fetchMarketInsights('eip155:1/slip44:2');
    expect(
      controller.state.marketInsights['eip155:1/slip44:1'],
    ).toBeUndefined();

    for (let i = 0; i < MAX_CACHE_ENTRIES + 1; i++) {
      await controller.fetchMarketInsights(`eip155:1/slip44:${100 + i}`);
      jest.advanceTimersByTime(1);
    }

    expect(Object.keys(controller.state.marketInsights)).toHaveLength(
      MAX_CACHE_ENTRIES,
    );
    expect(
      controller.state.marketInsights['eip155:1/slip44:100'],
    ).toBeUndefined();
    jest.useRealTimers();
  });
});

describe('AiDigestController (market overview)', () => {
  it('registers fetchMarketOverview action on messenger', async () => {
    const digestService = createService();
    const messenger = createMessenger();
    const controller = new AiDigestController({ messenger, digestService });

    const result = await messenger.call(
      'AiDigestController:fetchMarketOverview',
    );

    expect(result).toStrictEqual(mockOverview);
    expect(controller.state.marketOverview?.data).toStrictEqual(mockOverview);
  });

  it('persists fetched overview in state', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketOverview();

    expect(controller.state.marketOverview?.data).toStrictEqual(mockOverview);
  });

  it('caches successful response and returns cache while fresh', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketOverview();
    await controller.fetchMarketOverview();

    expect(digestService.fetchMarketOverview).toHaveBeenCalledTimes(1);
  });

  it('refetches after cache expiration', async () => {
    jest.useFakeTimers();
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketOverview();
    jest.advanceTimersByTime(CACHE_DURATION_MS + 1);
    await controller.fetchMarketOverview();

    expect(digestService.fetchMarketOverview).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('clears state and returns null when service returns null', async () => {
    const digestService = createService({
      fetchMarketOverview: jest.fn().mockResolvedValue(null),
    });
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    const result = await controller.fetchMarketOverview();

    expect(result).toBeNull();
    expect(controller.state.marketOverview).toBeNull();
  });
});

describe('AiDigestController (front page)', () => {
  it('registers fetchFrontPageItem action on messenger', async () => {
    const digestService = createService();
    const messenger = createMessenger();
    const controller = new AiDigestController({ messenger, digestService });

    const result = await messenger.call(
      'AiDigestController:fetchFrontPageItem',
      mockFrontPage.id,
    );

    expect(result).toStrictEqual(mockFrontPage);
    expect(digestService.fetchFrontPageItem).toHaveBeenCalledWith(
      mockFrontPage.id,
    );
    // The front page is not cached, so controller state is left untouched.
    expect(controller.state).toStrictEqual({
      marketInsights: {},
      marketOverview: null,
    });
  });

  it('delegates to the service and returns the front page', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    const result = await controller.fetchFrontPageItem(mockFrontPage.id);

    expect(result).toStrictEqual(mockFrontPage);
  });

  it('returns null when the service returns null', async () => {
    const digestService = createService({
      fetchFrontPageItem: jest.fn().mockResolvedValue(null),
    });
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    const result = await controller.fetchFrontPageItem(mockFrontPage.id);

    expect(result).toBeNull();
  });

  it('throws for an empty id without calling the service', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await expect(controller.fetchFrontPageItem('')).rejects.toThrow(
      AiDigestControllerErrorMessage.INVALID_FRONT_PAGE_ID,
    );
    expect(digestService.fetchFrontPageItem).not.toHaveBeenCalled();
  });
});
