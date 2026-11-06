import {
  getBridgeFeatureFlags,
  getFeatureFlags,
} from '@metamask/bridge-controller';
import type { MoneyAccountVaultConfig } from '@metamask/money-account-utils';
import { getMoneyAccountVaultConfig } from '@metamask/money-account-utils';

import { DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS } from '../constants.js';
import { BridgeStatusControllerMessenger } from '../types.js';

export const getMaxPendingHistoryItemAgeMs = (
  messenger: BridgeStatusControllerMessenger,
): number => {
  const bridgeFeatureFlags = getBridgeFeatureFlags(messenger);
  return (
    bridgeFeatureFlags.maxPendingHistoryItemAgeMs ??
    DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS
  );
};

export const getVaultConfig = (
  messenger: BridgeStatusControllerMessenger,
): MoneyAccountVaultConfig | undefined => {
  const featureFlags = getFeatureFlags(messenger);
  return getMoneyAccountVaultConfig(featureFlags);
};
