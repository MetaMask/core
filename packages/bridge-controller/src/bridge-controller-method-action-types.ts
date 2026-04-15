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

export type BridgeControllerStopPollingForQuotesAction = {
  type: `BridgeController:stopPollingForQuotes`;
  handler: BridgeController['stopPollingForQuotes'];
};

export type BridgeControllerSetLocationAction = {
  type: `BridgeController:setLocation`;
  handler: BridgeController['setLocation'];
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
  | BridgeControllerStopPollingForQuotesAction
  | BridgeControllerSetLocationAction
  | BridgeControllerResetStateAction
  | BridgeControllerSetChainIntervalLengthAction
  | BridgeControllerTrackUnifiedSwapBridgeEventAction;
