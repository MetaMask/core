import { Messenger } from '@metamask/messenger';

import {
  AiDigestController,
  getDefaultAiDigestControllerState,
  AiDigestControllerErrorMessage,
} from './index.js';
import type {
  AiDigestControllerMessenger,
  DigestService,
  MarketInsightsReport,
  MarketOverview,
  MarketOverviewFrontPage,
} from './index.js';

const mockReport: MarketInsightsReport = {
  digestId: 'digest-1',
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
  it('returns default empty state', () => {
    expect(getDefaultAiDigestControllerState()).toStrictEqual({});
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
    expect(controller.state).toStrictEqual({});
  });

  it('does not cache; each call hits the service', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketInsights('eip155:1/slip44:0');
    await controller.fetchMarketInsights('eip155:1/slip44:0');

    expect(digestService.searchDigest).toHaveBeenCalledTimes(2);
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
  });

  it('treats perps and CAIP-19 identifiers as independent service calls', async () => {
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
    expect(digestService.searchDigest).toHaveBeenNthCalledWith(1, perpsSymbol);
    expect(digestService.searchDigest).toHaveBeenNthCalledWith(2, caip19Id);
  });

  it('returns null when the service returns null', async () => {
    const digestService = createService({
      searchDigest: jest.fn().mockResolvedValue(null),
    });
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    const result = await controller.fetchMarketInsights('eip155:1/slip44:0');

    expect(result).toBeNull();
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
    expect(controller.state).toStrictEqual({});
  });

  it('does not cache; each call hits the service', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await controller.fetchMarketOverview();
    await controller.fetchMarketOverview();

    expect(digestService.fetchMarketOverview).toHaveBeenCalledTimes(2);
  });

  it('returns null when the service returns null', async () => {
    const digestService = createService({
      fetchMarketOverview: jest.fn().mockResolvedValue(null),
    });
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    const result = await controller.fetchMarketOverview();

    expect(result).toBeNull();
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
    expect(controller.state).toStrictEqual({});
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
