import type { NotificationPreferences } from './types.js';
import { assertNotificationPreferences } from './validators.js';

const prefs = (): NotificationPreferences => ({
  walletActivity: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
    accounts: [],
  },
  marketing: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
  },
  perps: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
    watchlistMarkets: {
      hyperliquid: { testnet: ['BTC'], mainnet: ['ETH'] },
      myx: { testnet: ['SOL'], mainnet: [] },
    },
  },
  socialAI: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
    mutedTraderProfileIds: [],
  },
  agenticCli: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
  },
  priceAlerts: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
  },
});

// MYX was removed as a perps venue (TAT-3892). The `myx` watchlist key is
// deprecated but still declared as optional, because preference blobs already
// stored server-side contain it. These cases pin that both shapes validate.
describe('PerpsWatchlistMarkets deprecated myx key', () => {
  it('still accepts a stored blob that contains a myx watchlist', () => {
    expect(() => assertNotificationPreferences(prefs())).not.toThrow();
  });

  it('accepts a blob written after the removal, with no myx key', () => {
    const noMyx = prefs();
    delete (noMyx.perps.watchlistMarkets as { myx?: unknown }).myx;
    expect(() => assertNotificationPreferences(noMyx)).not.toThrow();
  });
});
