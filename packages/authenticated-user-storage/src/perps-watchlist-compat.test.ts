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

// MYX was removed as a perps venue (TAT-3892), so `PerpsWatchlistMarkets` no
// longer declares a `myx` key. Preference blobs stored server-side before the
// removal still carry one, and they must keep validating — that relies on
// `PerpsWatchlistMarketsSchema` being a superstruct `type()` (unknown keys
// pass) rather than an `object()` (unknown keys are rejected). This pins that.
describe('PerpsWatchlistMarkets after the MYX removal', () => {
  it('accepts a blob stored before the removal, which still carries a myx watchlist', () => {
    const stored = prefs();
    Object.assign(stored.perps.watchlistMarkets as object, {
      myx: { testnet: ['SOL'], mainnet: [] },
    });
    expect(() => assertNotificationPreferences(stored)).not.toThrow();
  });

  it('accepts a blob written after the removal, with hyperliquid only', () => {
    expect(() => assertNotificationPreferences(prefs())).not.toThrow();
  });
});
