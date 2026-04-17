import { getBridgeFeatureFlags } from '@metamask/bridge-controller';
import { BridgeStatusControllerMessenger } from '../types';
import { DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS } from '../constants';

export const getMaxPendingHistoryItemAgeMs = (
  messenger: BridgeStatusControllerMessenger,
) => {
  const bridgeFeatureFlags = getBridgeFeatureFlags(messenger);
  return (
    bridgeFeatureFlags.maxPendingHistoryItemAgeMs ??
    DEFAULT_MAX_PENDING_HISTORY_ITEM_AGE_MS
  );
};
