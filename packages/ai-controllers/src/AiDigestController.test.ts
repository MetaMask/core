import { Messenger } from '@metamask/messenger';

import {
  AiDigestController,
  getDefaultAiDigestControllerState,
  AiDigestControllerErrorMessage,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from '.';
import type {
  AiDigestControllerMessenger,
  DigestService,
  MarketInsightsReport,
} from '.';

const mockReport: MarketInsightsReport = {
  version: '1.0',
  asset: 'btc',
  generatedAt: '2026-02-11T10:32:52.403Z',
  headline: 'BTC update',
  summary: 'Momentum remains positive.',
  trends: [],
  sources: [],
};

const createMessenger = (): AiDigestControllerMessenger =>
  new Messenger({
    namespace: 'AiDigestController',
  }) as AiDigestControllerMessenger;

const createService = (overrides?: Partial<DigestService>): DigestService => ({
  searchDigest: jest.fn().mockResolvedValue(mockReport),
  ...overrides,
});

describe('AiDigestController (market insights)', () => {
  it('returns default state', () => {
    expect(getDefaultAiDigestControllerState()).toStrictEqual({
      marketInsights: {},
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

  it('throws for invalid CAIP asset type', async () => {
    const digestService = createService();
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService,
    });

    await expect(
      controller.fetchMarketInsights('invalid-caip'),
    ).rejects.toThrow(AiDigestControllerErrorMessage.INVALID_CAIP_ASSET_TYPE);
    expect(digestService.searchDigest).not.toHaveBeenCalled();
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
