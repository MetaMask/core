import { PERPS_ERROR_CODES, isPerpsErrorCode } from '../perpsErrorCodes.js';
import type { PerpsErrorCode } from '../perpsErrorCodes.js';
import type { OrderType } from '../types/perps-types.js';

/**
 * Translation key and English text for one piece of client copy. Clients
 * translate `key` and fall back to the default when they have no
 * translation. `{{name}}` placeholders are filled by the client.
 */
export type PerpsErrorCopy = Readonly<{ key: string; defaultMessage: string }>;

/** Translation key and English label of an order type. */
export type PerpsOrderTypeLabel = Readonly<{
  key: string;
  defaultLabel: string;
}>;

/**
 * Copy for every `PERPS_ERROR_CODES` value. Keys follow the Mobile locale
 * files. `IOC_CANCEL` expects `{{maxSlippage}}`; without a known tolerance,
 * clients show `perps.errors.iocCancelUnknownTolerance` instead.
 */
export const PERPS_ERROR_COPY: Readonly<
  Record<PerpsErrorCode, PerpsErrorCopy>
> = Object.freeze({
  [PERPS_ERROR_CODES.CLIENT_NOT_INITIALIZED]: {
    key: 'perps.errors.clientNotInitialized',
    defaultMessage: 'HyperLiquid SDK clients not properly initialized',
  },
  [PERPS_ERROR_CODES.CLIENT_REINITIALIZING]: {
    key: 'perps.errors.clientReinitializing',
    defaultMessage:
      'Service is reinitializing. Please wait a moment and try again.',
  },
  [PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE]: {
    key: 'perps.errors.providerNotAvailable',
    defaultMessage: 'Provider {{providerId}} not available',
  },
  [PERPS_ERROR_CODES.PROVIDER_NOT_FOUND]: {
    key: 'perps.errors.providerNotAvailable',
    defaultMessage: 'Provider {{providerId}} not available',
  },
  [PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED]: {
    key: 'perps.errors.providerRouteRequired',
    defaultMessage: 'Choose a provider for this order and try again.',
  },
  [PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE]: {
    key: 'perps.errors.clientReinitializing',
    defaultMessage:
      'Service is reinitializing. Please wait a moment and try again.',
  },
  [PERPS_ERROR_CODES.TOKEN_NOT_SUPPORTED]: {
    key: 'perps.errors.tokenNotSupported',
    defaultMessage: 'Token {{token}} not supported for deposits',
  },
  [PERPS_ERROR_CODES.BRIDGE_CONTRACT_NOT_FOUND]: {
    key: 'perps.errors.bridgeContractNotFound',
    defaultMessage: 'Unable to get HyperLiquid bridge contract address',
  },
  [PERPS_ERROR_CODES.WITHDRAW_FAILED]: {
    key: 'perps.errors.withdrawFailed',
    defaultMessage: 'Failed to withdraw',
  },
  [PERPS_ERROR_CODES.POSITIONS_FAILED]: {
    key: 'perps.errors.positionsFailed',
    defaultMessage: 'Failed to get positions',
  },
  [PERPS_ERROR_CODES.ACCOUNT_STATE_FAILED]: {
    key: 'perps.errors.accountStateFailed',
    defaultMessage: 'Failed to get account state',
  },
  [PERPS_ERROR_CODES.MARKETS_FAILED]: {
    key: 'perps.errors.marketsFailed',
    defaultMessage: 'Failed to get markets',
  },
  [PERPS_ERROR_CODES.UNKNOWN_ERROR]: {
    key: 'perps.errors.unknownError',
    defaultMessage: 'Unknown error occurred',
  },
  [PERPS_ERROR_CODES.ORDER_LEVERAGE_REDUCTION_FAILED]: {
    key: 'perps.errors.orderLeverageReductionFailed',
    defaultMessage: 'You cannot reduce your leverage',
  },
  [PERPS_ERROR_CODES.IOC_CANCEL]: {
    key: 'perps.errors.iocCancel',
    defaultMessage:
      "Your order couldn't fill within your {{maxSlippage}}% slippage tolerance. Try a limit order or adjust your slippage.",
  },
  [PERPS_ERROR_CODES.CONNECTION_TIMEOUT]: {
    key: 'perps.errors.connectionTimeout',
    defaultMessage:
      'Connection timed out. Please check your network and try again.',
  },
  [PERPS_ERROR_CODES.WITHDRAW_ASSET_ID_REQUIRED]: {
    key: 'perps.errors.withdrawValidation.assetIdRequired',
    defaultMessage: 'assetId is required for withdrawals',
  },
  [PERPS_ERROR_CODES.WITHDRAW_AMOUNT_REQUIRED]: {
    key: 'perps.errors.withdrawValidation.amountRequired',
    defaultMessage: 'amount is required for withdrawals',
  },
  [PERPS_ERROR_CODES.WITHDRAW_AMOUNT_POSITIVE]: {
    key: 'perps.errors.withdrawValidation.amountPositive',
    defaultMessage: 'Amount must be a positive number',
  },
  [PERPS_ERROR_CODES.WITHDRAW_INVALID_DESTINATION]: {
    key: 'perps.errors.withdrawValidation.invalidDestination',
    defaultMessage: 'Invalid destination address format: {{address}}',
  },
  [PERPS_ERROR_CODES.WITHDRAW_ASSET_NOT_SUPPORTED]: {
    key: 'perps.errors.withdrawValidation.assetNotSupported',
    defaultMessage:
      'Asset {{assetId}} is not supported for withdrawals. Supported assets: {{supportedAssets}}',
  },
  [PERPS_ERROR_CODES.WITHDRAW_INSUFFICIENT_BALANCE]: {
    key: 'perps.errors.withdrawValidation.insufficientBalance',
    defaultMessage:
      'Insufficient balance. Available: {{available}}, Requested: {{requested}}',
  },
  [PERPS_ERROR_CODES.DEPOSIT_ASSET_ID_REQUIRED]: {
    key: 'perps.errors.depositValidation.assetIdRequired',
    defaultMessage: 'AssetId is required for deposit validation',
  },
  [PERPS_ERROR_CODES.DEPOSIT_AMOUNT_REQUIRED]: {
    key: 'perps.errors.depositValidation.amountRequired',
    defaultMessage: 'Amount is required and must be greater than 0',
  },
  [PERPS_ERROR_CODES.DEPOSIT_AMOUNT_POSITIVE]: {
    key: 'perps.errors.depositValidation.amountPositive',
    defaultMessage: 'Amount must be a positive number',
  },
  [PERPS_ERROR_CODES.DEPOSIT_MINIMUM_AMOUNT]: {
    key: 'perps.errors.minimumDeposit',
    defaultMessage: 'Minimum deposit amount is {{amount}} USDC',
  },
  [PERPS_ERROR_CODES.ORDER_COIN_REQUIRED]: {
    key: 'perps.errors.orderValidation.coinRequired',
    defaultMessage: 'Coin is required for orders',
  },
  [PERPS_ERROR_CODES.ORDER_LIMIT_PRICE_REQUIRED]: {
    key: 'perps.errors.orderValidation.limitPriceRequired',
    defaultMessage: 'Price is required for limit orders',
  },
  [PERPS_ERROR_CODES.ORDER_PRICE_POSITIVE]: {
    key: 'perps.errors.orderValidation.pricePositive',
    defaultMessage: 'Price must be a positive number if provided',
  },
  [PERPS_ERROR_CODES.ORDER_UNKNOWN_COIN]: {
    key: 'perps.errors.orderValidation.unknownCoin',
    defaultMessage: 'Unknown coin: {{coin}}',
  },
  [PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE]: {
    key: 'perps.errors.orderValidation.sizePositive',
    defaultMessage: 'Size must be a positive number',
  },
  [PERPS_ERROR_CODES.ORDER_PRICE_REQUIRED]: {
    key: 'perps.order.validation.price_required',
    defaultMessage: 'Price is required',
  },
  [PERPS_ERROR_CODES.ORDER_SIZE_MIN]: {
    key: 'perps.order.validation.minimum_amount',
    // A literal dollar sign before a client-filled placeholder.
    // eslint-disable-next-line no-template-curly-in-string
    defaultMessage: 'Minimum order size is ${{amount}}',
  },
  [PERPS_ERROR_CODES.ORDER_LEVERAGE_INVALID]: {
    key: 'perps.order.validation.invalid_leverage',
    defaultMessage: 'Leverage must be between {{min}}x and {{max}}x',
  },
  [PERPS_ERROR_CODES.ORDER_MARGIN_MODE_INVALID]: {
    key: 'perps.errors.orderValidation.marginModeInvalid',
    defaultMessage: 'Choose a valid margin mode.',
  },
  [PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.marginModeUnsupported',
    defaultMessage:
      'The selected margin mode is not available for this market.',
  },
  [PERPS_ERROR_CODES.ORDER_MARGIN_MODE_POSITION_OPEN]: {
    key: 'perps.errors.orderValidation.marginModePositionOpen',
    defaultMessage:
      'Close the open position on this market before changing margin mode.',
  },
  [PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN]: {
    key: 'perps.errors.orderValidation.marginModeOrderOpen',
    defaultMessage:
      'Cancel the open orders on this market before changing margin mode.',
  },
  [PERPS_ERROR_CODES.ORDER_LEVERAGE_BELOW_POSITION]: {
    key: 'perps.order.validation.leverage_below_position',
    defaultMessage:
      'Leverage must be at least {{required}}x to match your existing position (current: {{provided}}x)',
  },
  [PERPS_ERROR_CODES.ORDER_MAX_VALUE_EXCEEDED]: {
    key: 'perps.order.validation.max_order_value',
    // A literal dollar sign before a client-filled placeholder.
    // eslint-disable-next-line no-template-curly-in-string
    defaultMessage: 'Order size must be below ${{maxValue}}',
  },
  [PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED]: {
    key: 'perps.errors.orderValidation.triggerPriceRequired',
    defaultMessage:
      'A trigger price is required for stop and take profit orders',
  },
  [PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE]: {
    key: 'perps.errors.orderValidation.triggerPricePositive',
    defaultMessage: 'Trigger price must be a positive number',
  },
  [PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED]: {
    key: 'perps.errors.orderValidation.triggerPriceNotSupported',
    defaultMessage: "Market and limit orders can't have a trigger price",
  },
  [PERPS_ERROR_CODES.ORDER_TRIGGER_TPSL_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.triggerTpslUnsupported',
    defaultMessage:
      "Stop and take profit orders can't carry their own take profit or stop loss",
  },
  [PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID]: {
    key: 'perps.errors.orderValidation.tpslSizeInvalid',
    defaultMessage:
      'Take profit and stop loss size must be positive and no larger than the order',
  },
  [PERPS_ERROR_CODES.ORDER_EDIT_TRIGGER_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.editTriggerUnsupported',
    defaultMessage:
      "Stop and take profit orders can't be edited. Cancel the order and place a new one.",
  },
  [PERPS_ERROR_CODES.ORDER_TPSL_LINKAGE_CONFLICT]: {
    key: 'perps.errors.orderValidation.tpslLinkageConflict',
    defaultMessage: 'Conflicting take profit and stop loss settings',
  },
  [PERPS_ERROR_CODES.ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.tpslPositionLinkageUnsupported',
    defaultMessage:
      'Take profit and stop loss can only be attached to a position once the order has filled',
  },
  [PERPS_ERROR_CODES.ORDER_TPSL_LINKAGE_REQUIRED]: {
    key: 'perps.errors.orderValidation.tpslLinkageRequired',
    defaultMessage:
      'Take profit and stop loss must be attached to the order or to the position',
  },
  [PERPS_ERROR_CODES.ORDER_EDIT_ORDER_UNVERIFIABLE]: {
    key: 'perps.errors.orderValidation.editOrderUnverifiable',
    defaultMessage:
      'This order can no longer be found. Refresh your orders and try again.',
  },
  [PERPS_ERROR_CODES.ORDER_TIME_IN_FORCE_NOT_SUPPORTED]: {
    key: 'perps.errors.orderValidation.timeInForceNotSupported',
    defaultMessage: 'Time in force can only be set on limit orders',
  },
  [PERPS_ERROR_CODES.ORDER_STRATEGY_PARAMS_NOT_SUPPORTED]: {
    key: 'perps.errors.orderValidation.strategyParamsNotSupported',
    defaultMessage: "These order settings aren't supported for this order type",
  },
  [PERPS_ERROR_CODES.ORDER_STRATEGY_FIELD_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.strategyFieldUnsupported',
    defaultMessage:
      "This field can't be used with a TWAP, scale, or chase order",
  },
  [PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.strategyMarketUnsupported',
    defaultMessage:
      "TWAP, scale, and chase orders aren't available on this market",
  },
  [PERPS_ERROR_CODES.ORDER_STRATEGY_ROUTE_UNAVAILABLE]: {
    key: 'perps.errors.orderValidation.strategyMarketUnsupported',
    defaultMessage:
      "TWAP, scale, and chase orders aren't available on this market",
  },
  [PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN]: {
    key: 'perps.errors.orderValidation.strategyHandleUnknown',
    defaultMessage:
      'This strategy order can no longer be found. Refresh your orders and try again.',
  },
  [PERPS_ERROR_CODES.ORDER_EDIT_STRATEGY_UNSUPPORTED]: {
    key: 'perps.errors.orderValidation.strategyEditUnsupported',
    defaultMessage:
      "TWAP, scale, and chase orders can't be edited. Cancel the order and place a new one.",
  },
  [PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE]: {
    key: 'perps.errors.orderValidation.strategyCancelIncomplete',
    defaultMessage:
      "Some parts of this strategy order couldn't be cancelled. Try again.",
  },
  [PERPS_ERROR_CODES.ORDER_TWAP_DURATION_REQUIRED]: {
    key: 'perps.errors.orderValidation.twapDurationRequired',
    defaultMessage: 'A duration is required for TWAP orders',
  },
  [PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID]: {
    key: 'perps.errors.orderValidation.twapDurationInvalid',
    defaultMessage: 'TWAP duration must be between 5 and 1440 minutes',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE]: {
    key: 'perps.errors.orderValidation.scalePreviewStale',
    defaultMessage:
      'Scale order details changed. Review the updated preview and try again.',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_RANGE_REQUIRED]: {
    key: 'perps.errors.orderValidation.scaleRangeRequired',
    defaultMessage: 'Scale orders need a minimum and maximum price',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID]: {
    key: 'perps.errors.orderValidation.scaleRangeInvalid',
    defaultMessage: 'Scale order maximum price must be above the minimum',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID]: {
    key: 'perps.errors.orderValidation.scaleCountInvalid',
    defaultMessage: 'Scale order count is invalid',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL]: {
    key: 'perps.errors.orderValidation.scaleSizeTooSmall',
    defaultMessage: 'Each scale order is below the minimum size',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL]: {
    key: 'perps.errors.orderValidation.scaleNotionalTooSmall',
    defaultMessage: 'Each scale order is below the exchange minimum value',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_SIZE_CONSERVATION_FAILED]: {
    key: 'perps.errors.unknownError',
    defaultMessage: 'Unknown error occurred',
  },
  [PERPS_ERROR_CODES.ORDER_SCALE_EXPOSURE_EXCEEDS_INTENT]: {
    key: 'perps.errors.unknownError',
    defaultMessage: 'Unknown error occurred',
  },
  [PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL]: {
    key: 'perps.errors.orderValidation.twapNotionalTooSmall',
    defaultMessage: 'TWAP order value is below the exchange minimum',
  },
  [PERPS_ERROR_CODES.ORDER_CHASE_INTERVAL_INVALID]: {
    key: 'perps.errors.orderValidation.chaseIntervalInvalid',
    defaultMessage: 'Chase interval is invalid',
  },
  [PERPS_ERROR_CODES.ORDER_CHASE_DURATION_INVALID]: {
    key: 'perps.errors.orderValidation.chaseDurationInvalid',
    defaultMessage: 'Chase duration is invalid',
  },
  [PERPS_ERROR_CODES.ORDER_CHASE_MAX_DISTANCE_INVALID]: {
    key: 'perps.errors.orderValidation.chaseMaxDistanceInvalid',
    defaultMessage: 'Max chase distance is outside the allowed range',
  },
  [PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED]: {
    key: 'perps.errors.orderValidation.chaseAbandoned',
    defaultMessage: 'Chase order was cancelled because the connection dropped',
  },
  [PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED]: {
    key: 'perps.errors.orderValidation.chaseLimitReached',
    defaultMessage: 'Too many chase orders are already running',
  },
  [PERPS_ERROR_CODES.ORDER_CHASE_TOUCH_UNAVAILABLE]: {
    key: 'perps.errors.orderValidation.chaseTouchUnavailable',
    defaultMessage: 'No market price is available to place this chase order',
  },
  [PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE]: {
    key: 'perps.errors.exchangeClientNotAvailable',
    defaultMessage: 'ExchangeClient not available after initialization',
  },
  [PERPS_ERROR_CODES.INFO_CLIENT_NOT_AVAILABLE]: {
    key: 'perps.errors.infoClientNotAvailable',
    defaultMessage: 'InfoClient not available after initialization',
  },
  [PERPS_ERROR_CODES.SUBSCRIPTION_CLIENT_NOT_AVAILABLE]: {
    key: 'perps.errors.subscriptionClientNotAvailable',
    defaultMessage: 'SubscriptionClient not available after initialization',
  },
  [PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED]: {
    key: 'perps.errors.noAccountSelected',
    defaultMessage: 'No account selected',
  },
  [PERPS_ERROR_CODES.KEYRING_LOCKED]: {
    key: 'perps.errors.unknownError',
    defaultMessage: 'Unknown error occurred',
  },
  [PERPS_ERROR_CODES.INVALID_ADDRESS_FORMAT]: {
    key: 'perps.errors.invalidAddressFormat',
    defaultMessage: 'Invalid address format: {{address}}',
  },
  [PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND]: {
    key: 'perps.errors.exchangeAccountNotFound',
    defaultMessage: 'Add funds to your account before placing an order',
  },
  [PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED]: {
    key: 'perps.errors.exchangeMultiSigRequired',
    defaultMessage: 'This account needs its multi-signature signers to trade',
  },
  [PERPS_ERROR_CODES.EXCHANGE_INVALID_NONCE]: {
    key: 'perps.errors.exchangeInvalidNonce',
    defaultMessage: 'Something went wrong. Try again.',
  },
  [PERPS_ERROR_CODES.TRANSFER_FAILED]: {
    key: 'perps.errors.transferFailed',
    defaultMessage: 'Unable to transfer funds. Please try again.',
  },
  [PERPS_ERROR_CODES.SWAP_FAILED]: {
    key: 'perps.errors.swapFailed',
    defaultMessage: 'Unable to swap tokens. Please try again.',
  },
  [PERPS_ERROR_CODES.SPOT_PAIR_NOT_FOUND]: {
    key: 'perps.errors.spotPairNotFound',
    defaultMessage: 'Trading pair is not available at this time.',
  },
  [PERPS_ERROR_CODES.PRICE_UNAVAILABLE]: {
    key: 'perps.errors.priceUnavailable',
    defaultMessage: 'Price data is unavailable. Please refresh and try again.',
  },
  [PERPS_ERROR_CODES.UNSUPPORTED_COLLATERAL]: {
    key: 'perps.errors.unsupportedCollateral',
    defaultMessage: "This market's collateral is not supported",
  },
  [PERPS_ERROR_CODES.BATCH_CANCEL_FAILED]: {
    key: 'perps.errors.batchCancelFailed',
    defaultMessage: "Some orders couldn't be cancelled. Please try again.",
  },
  [PERPS_ERROR_CODES.BATCH_CLOSE_FAILED]: {
    key: 'perps.errors.batchCloseFailed',
    defaultMessage: "Some positions couldn't be closed. Please try again.",
  },
  [PERPS_ERROR_CODES.INSUFFICIENT_MARGIN]: {
    key: 'perps.errors.insufficientMargin',
    defaultMessage:
      'Insufficient margin to execute this trade. Consider adding more funds or reducing your position size.',
  },
  [PERPS_ERROR_CODES.INSUFFICIENT_BALANCE]: {
    key: 'perps.errors.insufficientBalance',
    defaultMessage:
      'Insufficient balance to complete this operation. Check your available funds.',
  },
  [PERPS_ERROR_CODES.REDUCE_ONLY_VIOLATION]: {
    key: 'perps.errors.reduceOnlyViolation',
    defaultMessage:
      'This order would increase your position. Only reduce-only orders are allowed.',
  },
  [PERPS_ERROR_CODES.POSITION_WOULD_FLIP]: {
    key: 'perps.errors.positionWouldFlip',
    defaultMessage:
      'This order would flip your position direction. Please close your existing position first.',
  },
  [PERPS_ERROR_CODES.POSITION_NOT_FOUND]: {
    key: 'perps.errors.position_not_found',
    defaultMessage: 'Position not found',
  },
  [PERPS_ERROR_CODES.MARGIN_ADJUSTMENT_FAILED]: {
    key: 'perps.errors.marginAdjustmentFailed',
    defaultMessage: 'Unable to adjust margin. Try again.',
  },
  [PERPS_ERROR_CODES.TPSL_UPDATE_FAILED]: {
    key: 'perps.errors.tpslUpdateFailed',
    defaultMessage: 'Unable to update take profit/stop loss. Try again.',
  },
  [PERPS_ERROR_CODES.TPSL_PROTECTION_LOST]: {
    key: 'perps.errors.tpslUpdateFailed',
    defaultMessage: 'Unable to update take profit/stop loss. Try again.',
  },
  [PERPS_ERROR_CODES.TPSL_LEG_REPLACE_UNSUPPORTED]: {
    key: 'perps.errors.tpslLegReplaceUnsupported',
    defaultMessage:
      'Updating only take profit or only stop loss isn’t available for this provider. Update take profit and stop loss together instead.',
  },
  [PERPS_ERROR_CODES.ORDER_REJECTED]: {
    key: 'perps.errors.orderRejected',
    defaultMessage: 'Order was rejected. Check your parameters and try again.',
  },
  [PERPS_ERROR_CODES.SLIPPAGE_EXCEEDED]: {
    key: 'perps.errors.slippageExceeded',
    defaultMessage:
      'Price moved too much. Try using a limit order or increase slippage tolerance.',
  },
  [PERPS_ERROR_CODES.PRICE_MOVED]: {
    key: 'perps.errors.priceMoved',
    defaultMessage:
      'The price moved {{priceDelta}}%, exceeding your {{maxSlippage}}% slippage tolerance. Review the updated price and try again.',
  },
  [PERPS_ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
    key: 'perps.errors.rateLimitExceeded',
    defaultMessage: 'Too many requests. Wait a moment and try again.',
  },
  [PERPS_ERROR_CODES.SERVICE_UNAVAILABLE]: {
    key: 'perps.errors.serviceUnavailable',
    defaultMessage: 'Service is temporarily unavailable. Try again later.',
  },
  [PERPS_ERROR_CODES.NETWORK_ERROR]: {
    key: 'perps.errors.networkErrorSimple',
    defaultMessage:
      'Network error occurred. Check your connection and try again.',
  },
});

/**
 * Copy for an error code, or the `UNKNOWN_ERROR` copy for anything that is not
 * a Perps error code (a code from a newer controller, or a raw message).
 *
 * @param code - Error code from a controller result or error.
 * @returns The code's copy.
 */
export function getPerpsErrorCopy(code: unknown): PerpsErrorCopy {
  return isPerpsErrorCode(code)
    ? PERPS_ERROR_COPY[code]
    : PERPS_ERROR_COPY[PERPS_ERROR_CODES.UNKNOWN_ERROR];
}

/** Label for every normalised order type, keyed by `OrderType`. */
export const PERPS_ORDER_TYPE_LABELS: Readonly<
  Record<OrderType, PerpsOrderTypeLabel>
> = Object.freeze({
  market: { key: 'perps.order.type.market.title', defaultLabel: 'Market' },
  limit: { key: 'perps.order.type.limit.title', defaultLabel: 'Limit' },
  stop_market: {
    key: 'perps.order.type.stop_market.title',
    defaultLabel: 'Stop market',
  },
  stop_limit: {
    key: 'perps.order.type.stop_limit.title',
    defaultLabel: 'Stop limit',
  },
  take_profit_market: {
    key: 'perps.order.type.take_profit_market.title',
    defaultLabel: 'Take market',
  },
  take_profit_limit: {
    key: 'perps.order.type.take_profit_limit.title',
    defaultLabel: 'Take limit',
  },
  twap: { key: 'perps.order.type.twap.title', defaultLabel: 'TWAP' },
  scale: { key: 'perps.order.type.scale.title', defaultLabel: 'Scale' },
  chase: { key: 'perps.order.type.chase.title', defaultLabel: 'Chase' },
});
