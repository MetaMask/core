import { Messenger } from '@metamask/messenger';

import {
  AiDigestController,
  getDefaultAiDigestControllerState,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from '.';
import type { AiDigestControllerMessenger } from '.';

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

const createMessenger = (): AiDigestControllerMessenger => {
  return new Messenger({
    namespace: 'AiDigestController',
  }) as AiDigestControllerMessenger;
};

describe('AiDigestController', () => {
  it('returns default state', () => {
    expect(getDefaultAiDigestControllerState()).toStrictEqual({ digests: {} });
  });

  it('fetches and caches a digest', async () => {
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
    const mockService = {
      fetchDigest: jest.fn().mockRejectedValue(new Error('Network error')),
    };
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
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    await controller.fetchDigest('ethereum');
    controller.clearDigest('ethereum');

    expect(controller.state.digests.ethereum).toBeUndefined();
  });

  it('clears all digests', async () => {
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
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
});
