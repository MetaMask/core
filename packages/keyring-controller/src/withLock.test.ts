import { Mutex } from 'async-mutex';
import { describe, expect, it, vi } from 'vitest';

import { lockLogger } from './logger.js';
import { withLock } from './withLock.js';

vi.mock('./logger.js', () => ({ lockLogger: vi.fn() }));

describe('withLock', () => {
  it('logs requests, acquisition, release and completion with separate wait and hold times', async () => {
    const mutex = new Mutex();
    const release = await mutex.acquire();
    let now = 10;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const context = { lock: 'controller' as const, operation: 'withKeyring' };
    const result = withLock(mutex, context, async () => {
      now = 50;
      return 'result';
    });

    expect(lockLogger).toHaveBeenLastCalledWith('Lock requested', {
      ...context,
      id: expect.any(Number),
    });
    const { id } = vi.mocked(lockLogger).mock.calls[0][1] as {
      id: number;
    };
    now = 30;
    release();

    expect(await result).toBe('result');
    expect(lockLogger).toHaveBeenCalledWith('Lock acquired', {
      ...context,
      id,
      waitMs: 20,
    });
    expect(lockLogger).toHaveBeenCalledWith('Lock released', {
      ...context,
      id,
      waitMs: 20,
      holdMs: 20,
    });
    expect(lockLogger).toHaveBeenLastCalledWith('Locked operation finished', {
      ...context,
      id,
      waitMs: 20,
      holdMs: 20,
      totalMs: 40,
      success: true,
    });
    expect(mutex.isLocked()).toBe(false);
  });

  it('releases and logs failures without logging potentially sensitive errors', async () => {
    const mutex = new Mutex();
    const error = new Error('secret');
    await expect(
      withLock(mutex, { lock: 'vault', operation: 'updateVault' }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(mutex.isLocked()).toBe(false);
    expect(lockLogger).toHaveBeenLastCalledWith('Locked operation finished', {
      lock: 'vault',
      operation: 'updateVault',
      id: expect.any(Number),
      waitMs: expect.any(Number),
      holdMs: expect.any(Number),
      totalMs: expect.any(Number),
      success: false,
    });
    expect(JSON.stringify(vi.mocked(lockLogger).mock.calls)).not.toContain(
      'secret',
    );
  });

  it('measures early release independently of operation completion and releases only once', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const mutex = new Mutex();
    await withLock(
      mutex,
      { lock: 'controller', operation: 'test' },
      async ({ releaseLock }) => {
        now = 10;
        releaseLock();
        releaseLock();
        expect(mutex.isLocked()).toBe(false);
        now = 40;
      },
    );

    expect(
      vi
        .mocked(lockLogger)
        .mock.calls.filter(([message]) => message === 'Lock released'),
    ).toHaveLength(1);
    expect(lockLogger).toHaveBeenLastCalledWith(
      'Locked operation finished',
      expect.objectContaining({
        holdMs: 10,
        totalMs: 40,
        success: true,
      }),
    );
  });
});
