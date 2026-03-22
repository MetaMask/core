import { createControllerStore, extractQueryData } from './createControllerStore';
import type { CacheUpdatedPayload, GranularCacheUpdatedPayload } from './BaseDataService';

describe('extractQueryData', () => {
  it('extracts data from an added/updated payload', () => {
    const payload: GranularCacheUpdatedPayload = {
      type: 'updated',
      state: {
        mutations: [],
        queries: [
          {
            queryKey: ['TestService:getData'],
            queryHash: '["TestService:getData"]',
            state: {
              data: { foo: 'bar' },
              status: 'success',
              dataUpdatedAt: 1000,
              error: null,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchMeta: null,
              fetchStatus: 'idle',
              isInvalidated: false,
              errorUpdateCount: 0,
            },
          },
        ],
      },
    };

    expect(extractQueryData(payload)).toStrictEqual({ foo: 'bar' });
  });

  it('returns undefined for removal payloads', () => {
    const payload: GranularCacheUpdatedPayload = {
      type: 'removed',
      state: null,
    };

    expect(extractQueryData(payload)).toBeUndefined();
  });

  it('returns undefined when no queries exist', () => {
    const payload: GranularCacheUpdatedPayload = {
      type: 'updated',
      state: {
        mutations: [],
        queries: [],
      },
    };

    expect(extractQueryData(payload)).toBeUndefined();
  });
});

describe('createControllerStore', () => {
  it('returns undefined before any event', () => {
    const store = createControllerStore(
      () => () => undefined,
      (payload) => payload,
    );

    expect(store.getSnapshot()).toBeUndefined();
  });

  it('returns extracted data after event fires', () => {
    let callback: ((payload: unknown) => void) | undefined;

    const store = createControllerStore<string>(
      (cb) => {
        callback = cb;
        return () => undefined;
      },
      (payload) => (payload as { data: string }).data,
    );

    // Trigger subscription by adding a listener
    const unsub = store.subscribe(() => undefined);

    callback?.({ data: 'hello' });

    expect(store.getSnapshot()).toBe('hello');
    unsub();
  });

  it('notifies listeners on update', () => {
    let callback: ((payload: unknown) => void) | undefined;

    const store = createControllerStore<string>(
      (cb) => {
        callback = cb;
        return () => undefined;
      },
      (payload) => (payload as { data: string }).data,
    );

    const listener = jest.fn();
    const unsub = store.subscribe(listener);

    callback?.({ data: 'hello' });

    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('does not update when extractor returns undefined', () => {
    let callback: ((payload: unknown) => void) | undefined;

    const store = createControllerStore<string>(
      (cb) => {
        callback = cb;
        return () => undefined;
      },
      (payload) => (payload as { data?: string }).data,
    );

    const listener = jest.fn();
    const unsub = store.subscribe(listener);

    callback?.({ data: 'valid' });
    expect(store.getSnapshot()).toBe('valid');

    callback?.({}); // no data → extractor returns undefined
    expect(store.getSnapshot()).toBe('valid');
    expect(listener).toHaveBeenCalledTimes(1); // only called once

    unsub();
  });

  it('subscribes only once across multiple listeners', () => {
    const subscribeFn = jest.fn(() => () => undefined);

    const store = createControllerStore(subscribeFn, (p) => p);

    const unsub1 = store.subscribe(() => undefined);
    const unsub2 = store.subscribe(() => undefined);

    expect(subscribeFn).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('handles async subscribe', async () => {
    let callback: ((payload: unknown) => void) | undefined;
    const unsubFn = jest.fn();

    const store = createControllerStore<string>(
      (cb) => {
        callback = cb;
        return Promise.resolve(unsubFn);
      },
      (payload) => (payload as { data: string }).data,
    );

    const unsub = store.subscribe(() => undefined);

    // Let the promise resolve
    await Promise.resolve();

    callback?.({ data: 'async' });
    expect(store.getSnapshot()).toBe('async');

    unsub();
  });

  it('cleans up when all listeners unsubscribe', () => {
    const unsubFn = jest.fn();

    const store = createControllerStore(
      () => unsubFn,
      (p) => p,
    );

    const unsub1 = store.subscribe(() => undefined);
    const unsub2 = store.subscribe(() => undefined);

    unsub1();
    expect(unsubFn).not.toHaveBeenCalled();

    unsub2();
    expect(unsubFn).toHaveBeenCalledTimes(1);
  });

  it('resets data after all listeners unsubscribe', () => {
    let callback: ((payload: unknown) => void) | undefined;

    const store = createControllerStore<string>(
      (cb) => {
        callback = cb;
        return () => undefined;
      },
      (payload) => (payload as { data: string }).data,
    );

    const unsub = store.subscribe(() => undefined);
    callback?.({ data: 'hello' });
    expect(store.getSnapshot()).toBe('hello');

    unsub();
    expect(store.getSnapshot()).toBeUndefined();
  });
});
