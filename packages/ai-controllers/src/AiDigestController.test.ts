import { Messenger } from '@metamask/messenger';

import {
  AiDigestController,
  getDefaultAiDigestControllerState,
  DIGEST_STATUS,
  CACHE_DURATION_MS,
  MAX_CACHE_ENTRIES,
} from '.';
import type { AiDigestControllerMessenger } from '.';

const mockData = {
  summary: 'Test summary',
  analysis: 'Test analysis',
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

    expect(result.status).toBe(DIGEST_STATUS.SUCCESS);
    expect(result.data).toStrictEqual(mockData);
    expect(controller.state.digests.ethereum).toBeDefined();
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

  it('handles fetch errors', async () => {
    const mockService = {
      fetchDigest: jest.fn().mockRejectedValue(new Error('Network error')),
    };
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    const result = await controller.fetchDigest('ethereum');

    expect(result.status).toBe(DIGEST_STATUS.ERROR);
    expect(result.error).toBe('Network error');
  });

  it('handles non-Error throws', async () => {
    const mockService = {
      fetchDigest: jest.fn().mockRejectedValue('string error'),
    };
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    const result = await controller.fetchDigest('ethereum');

    expect(result.status).toBe(DIGEST_STATUS.ERROR);
    expect(result.error).toBe('Unknown error');
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
    expect(result.status).toBe(DIGEST_STATUS.SUCCESS);

    messenger.call('AiDigestController:clearDigest', 'ethereum');
    messenger.call('AiDigestController:clearAllDigests');

    expect(controller.state.digests).toStrictEqual({});
  });

  it('uses expected cache constants', () => {
    expect(CACHE_DURATION_MS).toBe(10 * 60 * 1000);
    expect(MAX_CACHE_ENTRIES).toBe(50);
  });

  it('evicts error entries on next successful fetch', async () => {
    const mockService = {
      fetchDigest: jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(mockData),
    };
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
    });

    // Create an error entry
    await controller.fetchDigest('failing-asset');
    expect(controller.state.digests['failing-asset']?.status).toBe(
      DIGEST_STATUS.ERROR,
    );

    // Fetch a successful entry - should evict the error entry
    await controller.fetchDigest('ethereum');

    expect(controller.state.digests['failing-asset']).toBeUndefined();
    expect(controller.state.digests.ethereum).toBeDefined();
  });

  it('evicts orphaned loading entries on next successful fetch', async () => {
    const mockService = { fetchDigest: jest.fn().mockResolvedValue(mockData) };
    const controller = new AiDigestController({
      messenger: createMessenger(),
      digestService: mockService,
      state: {
        digests: {
          'orphaned-asset': {
            asset: 'orphaned-asset',
            status: DIGEST_STATUS.LOADING,
          },
        },
      },
    });

    // Verify loading entry exists
    expect(controller.state.digests['orphaned-asset']?.status).toBe(
      DIGEST_STATUS.LOADING,
    );

    // Fetch a successful entry - should evict the orphaned loading entry
    await controller.fetchDigest('ethereum');

    expect(controller.state.digests['orphaned-asset']).toBeUndefined();
    expect(controller.state.digests.ethereum).toBeDefined();
  });
});
