import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventQueue } from './event-queue.js';

describe('EventQueue', () => {
  let eventQueue: EventQueue;

  beforeEach(() => {
    eventQueue = new EventQueue();
  });

  it('should initialize an empty queue', () => {
    expect(eventQueue.queue).toStrictEqual([]);
  });

  it('should add callbacks to the queue', () => {
    const mockCallback = vi.fn().mockResolvedValue(undefined);

    eventQueue.push(mockCallback);

    expect(eventQueue.queue).toHaveLength(1);
    expect(eventQueue.queue[0]).toBe(mockCallback);
  });

  it('should execute callbacks in order', async () => {
    const executionOrder: number[] = [];

    eventQueue.push(async () => {
      executionOrder.push(1);
    });

    eventQueue.push(async () => {
      executionOrder.push(2);
    });

    eventQueue.push(async () => {
      executionOrder.push(3);
    });

    await eventQueue.run();

    expect(executionOrder).toStrictEqual([1, 2, 3]);
  });

  it('should empty the queue after execution', async () => {
    eventQueue.push(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    eventQueue.push(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await eventQueue.run();

    expect(eventQueue.queue).toStrictEqual([]);
  });

  it('should handle async callbacks', async () => {
    const mockCallback1 = vi.fn().mockResolvedValue(undefined);
    const mockCallback2 = vi.fn().mockResolvedValue(undefined);

    eventQueue.push(mockCallback1);
    eventQueue.push(mockCallback2);

    await eventQueue.run();

    expect(mockCallback1).toHaveBeenCalledTimes(1);
    expect(mockCallback2).toHaveBeenCalledTimes(1);
  });

  it('should execute callbacks sequentially', async () => {
    let counter = 0;

    const mockCallback1 = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      counter += 1;
    });

    const mockCallback2 = vi.fn().mockImplementation(async () => {
      expect(counter).toBe(1);
      counter += 1;
    });

    eventQueue.push(mockCallback1);
    eventQueue.push(mockCallback2);

    await eventQueue.run();

    expect(counter).toBe(2);
  });

  it('should handle errors in callbacks without breaking the queue', async () => {
    const mockErrorCallback = vi
      .fn()
      .mockRejectedValue(new Error('Test error'));
    const mockSuccessCallback = vi.fn().mockResolvedValue(undefined);

    eventQueue.push(mockErrorCallback);
    eventQueue.push(mockSuccessCallback);

    await expect(eventQueue.run()).rejects.toThrow('Test error');

    // Queue should still have the second callback
    expect(eventQueue.queue).toHaveLength(1);
    expect(eventQueue.queue[0]).toBe(mockSuccessCallback);
  });
});
