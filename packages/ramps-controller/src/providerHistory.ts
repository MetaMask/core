import { normalizeHeadlessProviderId } from './featureFlags.js';
import { normalizeCreatedAt } from './order-syncing/utils.js';
import type { Provider, RampsOrder } from './RampsService.js';
import { RampsOrderStatus } from './RampsService.js';

/**
 * A completed buy that the client knows about but the controller does not
 * store, such as an order from a client's legacy order store.
 */
export type RampsProviderHistoryEntry = {
  /** Provider id, with or without the `/providers/` prefix. */
  providerId: string;
  /** Epoch ms, a numeric string or an ISO date string. */
  completedAt: number | string;
};

/**
 * Returns the first provider, in `ids` order, whose id matches one of `ids`.
 * Ids are compared without the `/providers/` prefix and case.
 *
 * @param providers - Providers to search.
 * @param ids - Provider ids in priority order.
 * @returns The matching provider, or `undefined`.
 */
export function findFirstProviderById(
  providers: Provider[],
  ids: string[],
): Provider | undefined {
  for (const id of ids) {
    const target = normalizeHeadlessProviderId(id);
    const match = providers.find(
      (provider) => normalizeHeadlessProviderId(provider.id) === target,
    );
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * Returns the given providers that the user has completed a buy with, most
 * recent buy first.
 *
 * Counts completed orders that are not sells, from every account. Provider
 * ids are compared without the `/providers/` prefix and case, and text dates
 * are parsed, so orders written by older clients count too. An order without
 * a valid date sorts last.
 *
 * @param options - The options.
 * @param options.providers - Providers to match against the history.
 * @param options.orders - Ramps orders, e.g. `RampsControllerState.orders`.
 * @param options.extraHistory - Completed buys kept outside controller state.
 * @returns The previously used providers, most recent first.
 */
export function getPreviouslyUsedProviders({
  providers,
  orders,
  extraHistory = [],
}: {
  providers: Provider[];
  orders: RampsOrder[];
  extraHistory?: RampsProviderHistoryEntry[];
}): Provider[] {
  const history: RampsProviderHistoryEntry[] = [...extraHistory];
  for (const order of orders) {
    if (
      order.provider?.id &&
      order.status === RampsOrderStatus.Completed &&
      order.orderType?.toUpperCase() !== 'SELL'
    ) {
      history.push({
        providerId: order.provider.id,
        completedAt: order.createdAt,
      });
    }
  }

  const newestFirst = history
    .map(({ providerId, completedAt }) => ({
      providerId,
      completedAt: normalizeCreatedAt(completedAt),
    }))
    .sort((entryA, entryB) => entryB.completedAt - entryA.completedAt);

  const used = new Set<Provider>();
  for (const { providerId } of newestFirst) {
    const provider = findFirstProviderById(providers, [providerId]);
    if (provider) {
      used.add(provider);
    }
  }
  return [...used];
}
