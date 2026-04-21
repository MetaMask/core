import { getBridgeFeatureFlags } from '@metamask/bridge-controller';

import { DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS } from '../constants';
import { BridgeStatusControllerMessenger } from '../types';

export const getMaxPendingHistoryItemAgeMs = (
  messenger: BridgeStatusControllerMessenger,
): number => {
  const bridgeFeatureFlags = getBridgeFeatureFlags(messenger);
  return (
    bridgeFeatureFlags.maxPendingHistoryItemAgeMs ??
    DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS
  );
};
