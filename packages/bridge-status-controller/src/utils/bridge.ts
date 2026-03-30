import {
  AbortReason,
  FeatureId,
  UnifiedSwapBridgeEventName,
} from '@metamask/bridge-controller';
import type { RequiredEventContextFromClient } from '@metamask/bridge-controller';

import { BridgeStatusControllerMessenger } from '../types';

export const stopPollingForQuotes = (
  messenger: BridgeStatusControllerMessenger,
  featureId?: FeatureId,
  metricsContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
): void => {
  messenger.call(
    'BridgeController:stopPollingForQuotes',
    AbortReason.TransactionSubmitted,
    // If trade is submitted before all quotes are loaded, the QuotesReceived event is published
    // If the trade has a featureId, it means it was submitted outside of the Unified Swap and Bridge experience, so no QuotesReceived event is published
    featureId ? undefined : metricsContext,
  );
};

export const trackMetricsEvent = ({
  messenger,
  eventName,
  properties,
}: {
  messenger: BridgeStatusControllerMessenger;
  eventName: UnifiedSwapBridgeEventName;
  properties: RequiredEventContextFromClient[UnifiedSwapBridgeEventName];
}): void => {
  messenger.call(
    'BridgeController:trackUnifiedSwapBridgeEvent',
    eventName,
    properties,
  );
};
