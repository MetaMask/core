import { WebSocketConnectionState } from '../types/index.js';
import type {
  PerpsProvider,
  PerpsProviderHealth,
  PerpsProviderType,
} from '../types/index.js';

/**
 * Health for a provider without its own health API, from its socket state:
 * degraded while it is disconnected or reconnecting after a drop. Such a
 * provider does not close its socket by choice while registered, so
 * `disconnected` reads as down even at attempt 0 (a failed first connect).
 *
 * @param providerId - Provider the state belongs to.
 * @param connectionState - The provider's socket state.
 * @param reconnectionAttempt - Reconnect attempts since its last open.
 * @returns The derived health.
 */
export const getHealthFromConnectionState = (
  providerId: PerpsProviderType,
  connectionState: WebSocketConnectionState,
  reconnectionAttempt: number,
): PerpsProviderHealth => {
  const isDown =
    connectionState === WebSocketConnectionState.Disconnected ||
    (connectionState !== WebSocketConnectionState.Connected &&
      reconnectionAttempt > 0);
  return {
    providerId,
    status: isDown ? 'degraded' : 'healthy',
    reasons: isDown ? ['socket_down'] : [],
    connectionState,
    reconnectionAttempt,
    updatedAt: Date.now(),
  };
};

/**
 * The provider methods health is read from; all are optional.
 */
export type ProviderHealthSource = Pick<
  PerpsProvider,
  | 'getProviderHealth'
  | 'subscribeToProviderHealth'
  | 'getWebSocketConnectionState'
  | 'subscribeToConnectionState'
>;

const getUnavailableHealth = (
  providerId: PerpsProviderType,
): PerpsProviderHealth => ({
  providerId,
  status: 'unavailable',
  reasons: [],
  connectionState: WebSocketConnectionState.Disconnected,
  reconnectionAttempt: 0,
  updatedAt: Date.now(),
});

/**
 * Read one provider's health.
 *
 * @param providerId - Provider to report on.
 * @param provider - The registered provider, if any.
 * @returns Its own health, health derived from its socket state, or
 * `unavailable` when it is not registered.
 */
export const getProviderHealthOf = (
  providerId: PerpsProviderType,
  provider: ProviderHealthSource | undefined,
): PerpsProviderHealth => {
  if (!provider) {
    return getUnavailableHealth(providerId);
  }
  if (provider.getProviderHealth) {
    return provider.getProviderHealth();
  }
  if (provider.subscribeToConnectionState) {
    // Providers report their current state and reconnect attempt
    // synchronously on subscribe; read that once.
    let health: PerpsProviderHealth | undefined;
    const unsubscribe = provider.subscribeToConnectionState(
      (state, attempt) => {
        health ??= getHealthFromConnectionState(providerId, state, attempt);
      },
    );
    unsubscribe();
    if (health) {
      return health;
    }
  }
  return getHealthFromConnectionState(
    providerId,
    provider.getWebSocketConnectionState?.() ??
      WebSocketConnectionState.Disconnected,
    0,
  );
};

/**
 * Watch one provider's health: the current value at once, then each change.
 *
 * @param providerId - Provider to watch.
 * @param provider - The registered provider, if any.
 * @param callback - Receives each health snapshot.
 * @returns Cleanup function.
 */
export const subscribeToProviderHealthOf = (
  providerId: PerpsProviderType,
  provider: ProviderHealthSource | undefined,
  callback: (health: PerpsProviderHealth) => void,
): (() => void) => {
  if (provider?.subscribeToProviderHealth) {
    return provider.subscribeToProviderHealth(callback);
  }
  if (provider?.subscribeToConnectionState) {
    return provider.subscribeToConnectionState((state, attempt) =>
      callback(getHealthFromConnectionState(providerId, state, attempt)),
    );
  }
  callback(getProviderHealthOf(providerId, provider));
  return () => undefined;
};
