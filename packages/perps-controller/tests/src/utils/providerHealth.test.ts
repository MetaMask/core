import { describe, expect, it, vi } from 'vitest';

import { WebSocketConnectionState } from '../../../src/types/index.js';
import type { PerpsProviderHealth } from '../../../src/types/index.js';
import {
  getHealthFromConnectionState,
  getProviderHealthOf,
  subscribeToProviderHealthOf,
} from '../../../src/utils/providerHealth.js';

const lighterHealth: PerpsProviderHealth = {
  providerId: 'lighter',
  status: 'degraded',
  reasons: ['server_errors'],
  connectionState: WebSocketConnectionState.Connected,
  reconnectionAttempt: 0,
  updatedAt: 1,
};

describe('getHealthFromConnectionState', () => {
  it('reports degraded while reconnecting after a drop', () => {
    expect(
      getHealthFromConnectionState(
        'hyperliquid',
        WebSocketConnectionState.Connecting,
        2,
      ),
    ).toMatchObject({
      providerId: 'hyperliquid',
      status: 'degraded',
      reasons: ['socket_down'],
      reconnectionAttempt: 2,
    });
  });

  it('reports degraded while disconnected, even before any reconnect attempt', () => {
    // A failed first connect leaves attempt 0.
    expect(
      getHealthFromConnectionState(
        'hyperliquid',
        WebSocketConnectionState.Disconnected,
        0,
      ),
    ).toMatchObject({ status: 'degraded', reasons: ['socket_down'] });
  });

  it('reports healthy when connected or making its first connect', () => {
    expect(
      getHealthFromConnectionState(
        'hyperliquid',
        WebSocketConnectionState.Connected,
        3,
      ),
    ).toMatchObject({ status: 'healthy', reasons: [] });
    expect(
      getHealthFromConnectionState(
        'hyperliquid',
        WebSocketConnectionState.Connecting,
        0,
      ),
    ).toMatchObject({ status: 'healthy', reasons: [] });
  });
});

describe('getProviderHealthOf', () => {
  it('reports unavailable for an unregistered provider', () => {
    expect(getProviderHealthOf('lighter', undefined)).toMatchObject({
      providerId: 'lighter',
      status: 'unavailable',
      connectionState: WebSocketConnectionState.Disconnected,
    });
  });

  it('uses the provider health API when present', () => {
    expect(
      getProviderHealthOf('lighter', {
        getProviderHealth: () => lighterHealth,
      }),
    ).toBe(lighterHealth);
  });

  it('reads the reconnect attempt from a connection-state subscription', () => {
    const unsubscribe = vi.fn();

    expect(
      getProviderHealthOf('hyperliquid', {
        getWebSocketConnectionState: () => WebSocketConnectionState.Connecting,
        subscribeToConnectionState: (listener) => {
          listener(WebSocketConnectionState.Connecting, 2);
          return unsubscribe;
        },
      }),
    ).toMatchObject({
      status: 'degraded',
      reasons: ['socket_down'],
      reconnectionAttempt: 2,
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('falls back to the socket state when the subscription reports nothing at once', () => {
    expect(
      getProviderHealthOf('hyperliquid', {
        getWebSocketConnectionState: () => WebSocketConnectionState.Connected,
        subscribeToConnectionState: () => vi.fn(),
      }),
    ).toMatchObject({ status: 'healthy', reconnectionAttempt: 0 });
  });

  it('derives health from the socket state otherwise', () => {
    expect(
      getProviderHealthOf('hyperliquid', {
        getWebSocketConnectionState: () => WebSocketConnectionState.Connected,
      }),
    ).toMatchObject({
      status: 'healthy',
      connectionState: WebSocketConnectionState.Connected,
    });
    expect(getProviderHealthOf('hyperliquid', {})).toMatchObject({
      status: 'degraded',
      connectionState: WebSocketConnectionState.Disconnected,
    });
  });
});

describe('subscribeToProviderHealthOf', () => {
  it('uses the provider health subscription when present', () => {
    const cleanup = vi.fn();
    const subscribeToProviderHealth = vi.fn(
      (listener: (health: PerpsProviderHealth) => void) => {
        listener(lighterHealth);
        return cleanup;
      },
    );
    const callback = vi.fn();

    const unsubscribe = subscribeToProviderHealthOf(
      'lighter',
      { subscribeToProviderHealth },
      callback,
    );

    expect(callback).toHaveBeenCalledWith(lighterHealth);
    unsubscribe();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('maps connection-state changes to health otherwise', () => {
    let emit:
      | ((state: WebSocketConnectionState, attempt: number) => void)
      | undefined;
    const cleanup = vi.fn();
    const callback = vi.fn<(health: PerpsProviderHealth) => void>();

    const unsubscribe = subscribeToProviderHealthOf(
      'hyperliquid',
      {
        subscribeToConnectionState: (listener) => {
          emit = listener;
          return cleanup;
        },
      },
      callback,
    );
    emit?.(WebSocketConnectionState.Connecting, 1);
    emit?.(WebSocketConnectionState.Connected, 0);

    expect(callback.mock.calls.map(([health]) => health.status)).toStrictEqual([
      'degraded',
      'healthy',
    ]);
    unsubscribe();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('reports once and returns a no-op without any subscription API', () => {
    const callback = vi.fn();

    const unsubscribe = subscribeToProviderHealthOf(
      'lighter',
      undefined,
      callback,
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0]).toMatchObject({ status: 'unavailable' });
    expect(unsubscribe()).toBeUndefined();
  });
});
