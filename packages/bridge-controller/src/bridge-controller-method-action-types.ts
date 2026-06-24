/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { BridgeController } from './bridge-controller';

export type BridgeControllerUpdateBridgeQuoteRequestParamsAction = {
  type: `BridgeController:updateBridgeQuoteRequestParams`;
  handler: BridgeController['updateBridgeQuoteRequestParams'];
};

export type BridgeControllerFetchQuotesAction = {
  type: `BridgeController:fetchQuotes`;
  handler: BridgeController['fetchQuotes'];
};

export type BridgeControllerUpdateBatchSellTradesAction = {
  type: `BridgeController:updateBatchSellTrades`;
  handler: BridgeController['updateBatchSellTrades'];
};

export type BridgeControllerStopPollingForQuotesAction = {
  type: `BridgeController:stopPollingForQuotes`;
  handler: BridgeController['stopPollingForQuotes'];
};

export type BridgeControllerSetLocationAction = {
  type: `BridgeController:setLocation`;
  handler: BridgeController['setLocation'];
};

export type BridgeControllerGetLocationAction = {
  type: `BridgeController:getLocation`;
  handler: BridgeController['getLocation'];
};

export type BridgeControllerSetInputPrimaryDenominationAction = {
  type: `BridgeController:setInputPrimaryDenomination`;
  handler: BridgeController['setInputPrimaryDenomination'];
};

export type BridgeControllerResetStateAction = {
  type: `BridgeController:resetState`;
  handler: BridgeController['resetState'];
};

export type BridgeControllerSetChainIntervalLengthAction = {
  type: `BridgeController:setChainIntervalLength`;
  handler: BridgeController['setChainIntervalLength'];
};

export type BridgeControllerTrackUnifiedSwapBridgeEventAction = {
  type: `BridgeController:trackUnifiedSwapBridgeEvent`;
  handler: BridgeController['trackUnifiedSwapBridgeEvent'];
};

/**
 * Union of all BridgeController action types.
 */
export type BridgeControllerMethodActions =
  | BridgeControllerUpdateBridgeQuoteRequestParamsAction
  | BridgeControllerFetchQuotesAction
  | BridgeControllerUpdateBatchSellTradesAction
  | BridgeControllerStopPollingForQuotesAction
  | BridgeControllerSetLocationAction
  | BridgeControllerGetLocationAction
  | BridgeControllerSetInputPrimaryDenominationAction
  | BridgeControllerResetStateAction
  | BridgeControllerSetChainIntervalLengthAction
  | BridgeControllerTrackUnifiedSwapBridgeEventAction;
