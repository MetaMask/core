import {
  AbortReason,
  UnifiedSwapBridgeEventName,
  BatchSellTradesResponse,
  RequiredEventContextFromClient,
} from '@metamask/bridge-controller';

import { BridgeStatusControllerMessenger } from '../types';

export const stopPollingForQuotes = (
  messenger: BridgeStatusControllerMessenger,
  metricsContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
): void => {
  messenger.call(
    'BridgeController:stopPollingForQuotes',
    AbortReason.TransactionSubmitted,
    metricsContext,
  );
};

export const getBatchSellTrades = (
  messenger: BridgeStatusControllerMessenger,
): BatchSellTradesResponse | null => {
  return messenger.call('BridgeController:getState').batchSellTrades;
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
