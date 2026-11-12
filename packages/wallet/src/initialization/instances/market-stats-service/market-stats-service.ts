import {
  MARKET_STATS_SERVICE_ALLOWED_ACTIONS,
  MARKET_STATS_SERVICE_ALLOWED_EVENTS,
  MarketStatsService,
} from '@metamask/core-backend';
import type { MarketStatsServiceMessenger } from '@metamask/core-backend';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

/**
 * Real-time spot prices over the shared backend WebSocket.
 *
 * `Wallet` does not construct `BackendWebSocketService` and does not call it
 * during initialization. The host registers that service's actions on the
 * root messenger. The first `subscribe` registers the chain-status callback
 * and the price-batch callback.
 */
export const marketStatsService: InitializationConfiguration<
  MarketStatsService,
  MarketStatsServiceMessenger
> = {
  name: 'MarketStatsService',
  init: ({ messenger }) =>
    new MarketStatsService({
      messenger,
    }),
  getMessenger: (parent) => {
    const messenger: MarketStatsServiceMessenger = new Messenger({
      namespace: 'MarketStatsService',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [...MARKET_STATS_SERVICE_ALLOWED_ACTIONS],
      events: [...MARKET_STATS_SERVICE_ALLOWED_EVENTS],
    });

    return messenger;
  },
};
