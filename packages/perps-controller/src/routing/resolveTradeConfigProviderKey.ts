import type {
  PerpsActiveProviderMode,
  PerpsProviderType,
} from '../types/index.js';
import { isPerpsProviderType } from './isPerpsProviderType.js';

type TradeConfigRoutingState = Readonly<{
  activeProvider: PerpsActiveProviderMode;
  defaultProvider: PerpsProviderType;
  effectiveProvider: PerpsProviderType | null;
}>;

/**
 * Select the venue whose trade configuration a state snapshot represents.
 *
 * Explicit routes take priority over the effective venue. Without a live
 * venue, use the selected direct provider or saved aggregated default.
 * Invalid explicit routes are rejected; invalid state-derived routes fall
 * back to HyperLiquid. Route lifecycle validity is owned by the controller.
 *
 * @param state - Routing fields only; may be absent in selector consumers.
 * @param providerId - Optional explicit venue override.
 * @returns A validated venue, or null for an invalid explicit override.
 * @internal
 */
export function resolveTradeConfigProviderKey(
  state: TradeConfigRoutingState | undefined,
  providerId?: PerpsProviderType,
): PerpsProviderType | null {
  if (providerId !== undefined) {
    return isPerpsProviderType(providerId) ? providerId : null;
  }

  const stateKey =
    state?.effectiveProvider ??
    (state?.activeProvider === 'aggregated'
      ? state.defaultProvider
      : state?.activeProvider);
  return isPerpsProviderType(stateKey) ? stateKey : 'hyperliquid';
}
