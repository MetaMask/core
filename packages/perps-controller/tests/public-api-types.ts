import type {
  CrossLiquidationEstimate as ImportedCrossLiquidationEstimate,
  EstimateCrossLiquidationParams as ImportedEstimateCrossLiquidationParams,
  formatLeverage as importedFormatLeverage,
  HyperLiquidMarginTier as ImportedHyperLiquidMarginTier,
  PERPS_DISPLAY_PRECISION as IMPORTED_PERPS_DISPLAY_PRECISION,
  PerpsController as ImportedPerpsController,
  PerpsControllerEstimateCrossLiquidationAction as ImportedPerpsControllerEstimateCrossLiquidationAction,
  PerpsIntlFormatters as ImportedPerpsIntlFormatters,
  PerpsLeverageFormatOptions as ImportedPerpsLeverageFormatOptions,
  PerpsProvider as ImportedPerpsProvider,
  PerpsProviderType as ImportedPerpsProviderType,
  PositionModifyPreviewKind as ImportedPositionModifyPreviewKind,
  PositionModifyPreviewParams as ImportedPositionModifyPreviewParams,
  PositionModifyPreviewResult as ImportedPositionModifyPreviewResult,
  PositionPreviewUnavailableReason as ImportedPositionPreviewUnavailableReason,
  PositionPreviewValue as ImportedPositionPreviewValue,
} from '@metamask/perps-controller';
import type {
  OrderType as StreamOrderType,
  PerpsControllerGetStreamSnapshotAction as StreamSnapshotAction,
  PerpsControllerResubscribeStreamsAction as StreamResubscribeAction,
  PerpsControllerSubscribeToConnectionLatencyAction as StreamLatencyAction,
  PerpsControllerSubscribeToFeeRatesAction as StreamFeeRatesAction,
  PerpsControllerSubscribeToMarginAdjustmentLimitsAction as StreamMarginLimitsAction,
  PerpsControllerSubscribeToMarketMetaAction as StreamMarketMetaAction,
  PerpsControllerSubscribeToTradingAgentValidityAction as StreamAgentValidityAction,
  PerpsFeeRates as StreamFeeRates,
  PerpsPlatformDependencies as StreamDependencies,
  PerpsStreamName as StreamName,
  PerpsStreamParams as StreamParams,
  PerpsStreamSnapshot as StreamSnapshot,
  PerpsTradingAgentValidity as StreamAgentValidity,
  StreamChannelManager as StreamManager,
  StreamChannelSource as StreamSource,
  SubscribeConnectionLatencyParams as StreamLatencyParams,
  SubscribeFeeRatesParams as StreamFeeRatesParams,
  SubscribeMarginAdjustmentLimitsParams as StreamMarginLimitsParams,
  SubscribeMarketMetaParams as StreamMarketMetaParams,
  SubscribeTradingAgentValidityParams as StreamAgentValidityParams,
} from '@metamask/perps-controller';
import type {
  CloseSizeParams as ImportedCloseSizeParams,
  CloseSizeRounding as ImportedCloseSizeRounding,
  GetMarketDataWithPricesParams as ImportedGetMarketDataWithPricesParams,
  MarketSortField as ImportedMarketSortField,
  PERPS_EVENT_PROPERTY as IMPORTED_PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE as IMPORTED_PERPS_EVENT_VALUE,
  PerpsMarketData as ImportedPerpsMarketData,
  PerpsMarketNumericValues as ImportedPerpsMarketNumericValues,
  OrderBookGroupingLadder as ImportedOrderBookGroupingLadder,
  OrderBookGroupingOptionsParams as ImportedOrderBookGroupingOptionsParams,
  AccountReturnOnEquityParams as ImportedAccountReturnOnEquityParams,
  calculateAccountReturnOnEquity as importedCalculateAccountReturnOnEquity,
  SortMarketsParams as ImportedSortMarketsParams,
  calculateOrderBookGroupingOptions as importedCalculateOrderBookGroupingOptions,
} from '@metamask/perps-controller';
import type {
  ChaseOrder,
  PerpsController,
  GetAccountSupportParams,
  ResolveWithdrawalRouteParams,
  WithdrawalRoute,
  PerpsControllerResolveWithdrawalRouteAction,
  GetChaseOrderOwnershipParams,
  PerpsAccountSupport,
  PerpsChaseOrderOwner,
  PerpsChaseOrderChild,
  PerpsChaseOrderDispatch,
  PerpsChaseOrderOwnership,
  PerpsControllerGetChaseOrderOwnershipAction,
  PerpsControllerGetAccountSupportAction,
  ReconcileChaseOrderCancellationParams,
  ReconcileChaseOrderCancellationResult,
  PerpsControllerReconcileChaseOrderCancellationAction,
  OrderResult,
  PositionProtectionReceipt,
  LighterCredentials,
  UpdatePositionTPSLParams,
  OrderEditObservation,
  EditOrderParams,
  LighterSignModifyOrderWireParams,
  PerpsControllerEditOrderAction,
  PerpsProvider,
  DirectProviderOrderCapabilities,
  ExpectedScaleLadder,
  OrderParams,
  ScaleOrderGroup,
  ScaleOrderChild,
  GetScalePriceLadderParams,
  PerpsScalePriceLadder,
  PerpsControllerGetScalePriceLadderAction,
  PerpsControllerGetScaleOrderGroupsAction,
  PerpsControllerReviewScaleOrderGroupsAction,
  LighterWasmCall,
  AttachedOrderGroup,
  PerpsControllerGetAttachedOrderGroupsAction,
  PerpsControllerReviewAttachedOrderGroupsAction,
  TriggerOrderType,
  PerpsRecoveredDispatch,
  PerpsPendingManualRecovery,
  PerpsRecoveryVenueReview,
  PerpsRecoveryProtectionResult,
  ResolveRecoveryProtectionParams,
  PerpsControllerReviewRecoveryVenueAction,
  PerpsControllerResolveRecoveryProtectionAction,
  PerpsControllerGetRecoveredDispatchesAction,
  PerpsControllerReconcileRecoveredDispatchesAction,
  PerpsControllerAcknowledgeRecoveredDispatchAction,
  PositionTPSLLeg,
  ReplacePositionTPSLLegParams,
  PerpsControllerReplacePositionTPSLLegAction,
  PublicTrade,
  GetPublicTradesParams,
  SubscribePublicTradesParams,
  PerpsControllerGetPublicTradesAction,
  PerpsControllerSubscribeToPublicTradesAction,
  TwapOrder,
  LiveTwapOrderSource,
  LiveChaseOrderSource,
  SubscribeLiveTwapOrdersParams,
  SubscribeChaseOrderListsParams,
  PerpsControllerSubscribeToLiveTwapOrdersAction,
  PerpsControllerSubscribeToChaseOrderListsAction,
  PERPS_ERROR_CODES,
  PerpsErrorCode,
  PerpsErrorDetails,
  PriceMovedErrorDetails,
  HyperLiquidErrorDetails,
  ClosePositionsResult,
  DisconnectResult,
  InitializeResult,
  MarginResult,
  ReadyToTradeResult,
  ToggleTestnetResult,
  TransferBetweenDexsResult,
  WithdrawResult,
  AccountState,
  AccountAggregateMetadata,
  PerpsProviderAccountStateEntry,
  ClosePositionsParams,
  ClosePositionsTarget,
  CancelOrdersParams,
  SubscribeAccountParams,
  PerpsProviderType,
  TrackingData,
  CrossMarginRatioTone,
  CloseSize,
  CloseSizeParams,
  FeeNotionalParams,
  OrderBookAggregationParams,
  OrderBookSlippageEstimate,
  OrderBookSlippageParams,
  OrderBookSpread,
  GlobalSnapshotContext,
  PerpsGlobalSnapshotRequest,
  getCrossMarginRatioTone,
  calculateCloseSize,
  calculateFeeNotionalUsd,
  calculateOrderBookAggregationParams,
  estimateOrderBookSlippage,
  calculateOrderBookSpread,
} from '@metamask/perps-controller';
import type {
  HyperLiquidMarginTier as AccountMetaMarginTier,
  MarketInfo as AccountMetaMarketInfo,
  PerpsOrderCapabilities as AccountMetaOrderCapabilities,
  PriceUpdate as AccountMetaPriceUpdate,
  adaptMarketFromSDK as accountMetaAdaptMarketFromSDK,
  GetMarginAdjustmentLimitsParams as AccountMetaLimitsParams,
  MarginAdjustmentLimits as AccountMetaLimits,
  MarginAdjustmentLimitsUnavailableReason as AccountMetaLimitsReason,
  GetMarketMetaParams as AccountMetaMarketMetaParams,
  PerpsMarketMeta as AccountMetaMarketMeta,
  PerpsController as AccountMetaController,
  PerpsControllerGetMarginAdjustmentLimitsAction as AccountMetaLimitsAction,
  PerpsControllerGetMarketMetaAction as AccountMetaMarketMetaAction,
  PerpsProviderType as AccountMetaProviderType,
  PERPS_ERROR_CODES as AccountMetaErrorCodes,
  AccountState as AccountMetaAccountState,
  CalculateAccountSummaryParams as AccountMetaSummaryParams,
  calculateAccountSummary as accountMetaCalculateAccountSummary,
} from '@metamask/perps-controller';
import type * as PerpsControllerPackage from '@metamask/perps-controller';
import type { isCrossMarginSupported as accountMetaIsCrossMarginSupported } from '@metamask/perps-controller/constants/hyperLiquidConfig';
import type {
  LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT,
  LIGHTER_NATIVE_PROBE_CANCEL_LIMIT,
  LIGHTER_NATIVE_PROBE_MAX_NOTIONAL,
  LIGHTER_CHASE_MIN_INTERVAL_MS,
  LIGHTER_CHASE_MAX_DURATION_MS,
  LIGHTER_CHASE_MAX_REPRICINGS,
  LIGHTER_CHASE_MAX_DISTANCE_BPS,
  LIGHTER_CHASE_DEFAULT_INTERVAL_MS,
  LIGHTER_CHASE_DEFAULT_DURATION_MS,
  LIGHTER_CHASE_DEFAULT_REPRICINGS,
  LIGHTER_CHASE_DEFAULT_DISTANCE_BPS,
} from '@metamask/perps-controller/constants/lighterConfig';
import type {
  isMarginRemovalAllowed as accountMetaIsMarginRemovalAllowed,
  classifyCrossLiquidationPrice as importedClassifyCrossLiquidationPrice,
  CrossLiquidationClassification as ImportedCrossLiquidationClassification,
  CrossLiquidationPriceParams as ImportedCrossLiquidationPriceParams,
  HyperLiquidCrossAccount as ImportedHyperLiquidCrossAccount,
  HyperLiquidCrossPositionModifyProjection as ImportedHyperLiquidCrossPositionModifyProjection,
  previewHyperLiquidCrossPositionModify as importedPreviewHyperLiquidCrossPositionModify,
  projectHyperLiquidCrossPositionModify as importedProjectHyperLiquidCrossPositionModify,
  ProjectHyperLiquidCrossPositionModifyParams as ImportedProjectHyperLiquidCrossPositionModifyParams,
} from '@metamask/perps-controller/utils/hyperLiquidPositionPreview';
import type {
  readLighterChaseQuote,
  reconcileLighterChaseChild,
  identifyLighterChaseChild,
} from '@metamask/perps-controller/utils/lighterChase';
import type { prepareLighterTwapOrder } from '@metamask/perps-controller/utils/lighterTwap';
import type {
  reconcileLighterTwapObservation,
  identifyLighterTwapParent,
} from '@metamask/perps-controller/utils/lighterTwapReconciliation';
import type * as PerpsMarketUtilsModule from '@metamask/perps-controller/utils/marketUtils';
import type * as PerpsSortMarketsModule from '@metamask/perps-controller/utils/sortMarkets';

// Compile-time consumer contracts. These are not runtime fixture assertions.
type AssertCompatible<Expected, Actual extends Expected> = Actual;
type IsExact<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? true
    : false;
type AssertTrue<Value extends true> = Value;
export type AccountSupportConsumerContracts = [
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerGetAccountSupportAction['handler']>,
      [params?: GetAccountSupportParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerGetAccountSupportAction['handler']>,
      Promise<PerpsAccountSupport>
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerGetAccountSupportAction['type'],
      'PerpsController:getAccountSupport'
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsController['getAccountSupport']>,
      Promise<PerpsAccountSupport>
    >
  >,
];

export type WithdrawalRouteConsumerContracts = [
  AssertTrue<
    IsExact<
      Parameters<PerpsController['resolveWithdrawalRoute']>,
      [params?: ResolveWithdrawalRouteParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsController['resolveWithdrawalRoute']>,
      Promise<WithdrawalRoute>
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerResolveWithdrawalRouteAction['type'],
      'PerpsController:resolveWithdrawalRoute'
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerResolveWithdrawalRouteAction['handler'],
      PerpsController['resolveWithdrawalRoute']
    >
  >,
  AssertTrue<
    IsExact<
      Extract<WithdrawalRoute, { status: 'route_required' }>['error'],
      'PROVIDER_ROUTE_REQUIRED'
    >
  >,
];

export type PublicTradesConsumerContracts = [
  AssertTrue<
    IsExact<
      PerpsControllerGetPublicTradesAction['type'],
      'PerpsController:getPublicTrades'
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerGetPublicTradesAction['handler']>,
      [params: GetPublicTradesParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerGetPublicTradesAction['handler']>,
      Promise<PublicTrade[]>
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerSubscribeToPublicTradesAction['type'],
      'PerpsController:subscribeToPublicTrades'
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerSubscribeToPublicTradesAction['handler']>,
      [params: SubscribePublicTradesParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerSubscribeToPublicTradesAction['handler']>,
      () => void
    >
  >,
  AssertTrue<IsExact<PublicTrade['side'], 'buy' | 'sell'>>,
  AssertTrue<
    IsExact<
      keyof PublicTrade,
      | 'id'
      | 'symbol'
      | 'price'
      | 'size'
      | 'side'
      | 'timestamp'
      | 'txHash'
      | 'providerId'
    >
  >,
  AssertCompatible<
    Parameters<SubscribePublicTradesParams['callback']>,
    [trades: PublicTrade[]]
  >,
];

export type NativeEditConsumerContracts = [
  AssertTrue<
    IsExact<NonNullable<OrderResult['orderEdit']>, OrderEditObservation>
  >,
  AssertTrue<
    IsExact<
      OrderEditObservation['status'],
      'pending' | 'settled' | 'failed' | 'terminal'
    >
  >,
  AssertTrue<
    IsExact<
      LighterWasmCall<'_signModifyOrder'>['params'],
      LighterSignModifyOrderWireParams
    >
  >,
  AssertTrue<
    IsExact<
      LighterSignModifyOrderWireParams,
      [
        accountIndex: number,
        marketIndex: number,
        orderIndex: string,
        baseAmount: number,
        price: number,
        triggerPrice: number,
        nonce: number,
      ]
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerEditOrderAction['handler']>,
      [params: EditOrderParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerEditOrderAction['handler']>,
      Promise<OrderResult>
    >
  >,
];
export type RecoveryConsumerContracts = [
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerReviewRecoveryVenueAction['handler']>,
      Promise<PerpsRecoveryVenueReview>
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerResolveRecoveryProtectionAction['handler']>,
      [params: ResolveRecoveryProtectionParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerResolveRecoveryProtectionAction['handler']>,
      Promise<PerpsRecoveryProtectionResult>
    >
  >,

  AssertTrue<
    IsExact<
      Parameters<PerpsControllerReconcileRecoveredDispatchesAction['handler']>,
      []
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerReconcileRecoveredDispatchesAction['handler']>,
      Promise<PerpsRecoveredDispatch[]>
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerReconcileRecoveredDispatchesAction['type'],
      'PerpsController:reconcileRecoveredDispatches'
    >
  >,
  AssertTrue<
    IsExact<PerpsRecoveredDispatch['apiKeyIndex'], number | undefined>
  >,
  AssertTrue<
    IsExact<PerpsRecoveredDispatch['acknowledgeable'], boolean | undefined>
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerGetRecoveredDispatchesAction['handler']>,
      []
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerGetRecoveredDispatchesAction['handler']>,
      Promise<PerpsRecoveredDispatch[]>
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerAcknowledgeRecoveredDispatchAction['handler']>,
      [recoveryId: string]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerAcknowledgeRecoveredDispatchAction['handler']>,
      Promise<void>
    >
  >,
  AssertCompatible<
    PerpsRecoveredDispatch,
    {
      recoveryId: string;
      kind: number;
      intent: string;
      txHash: null;
      outcome: 'unknown';
      evidence: string;
    }
  >,
  AssertCompatible<
    PerpsRecoveredDispatch,
    {
      recoveryId: string;
      kind: number;
      intent: string;
      txHash: null;
      outcome: 'unknown';
      evidence: string;
      apiKeyIndex: number;
      acknowledgeable: false;
    }
  >,
  AssertCompatible<
    PerpsControllerGetRecoveredDispatchesAction['handler'],
    () => Promise<PerpsRecoveredDispatch[]>
  >,
  AssertCompatible<
    PerpsControllerAcknowledgeRecoveredDispatchAction['handler'],
    (recoveryId: string) => Promise<void>
  >,
  AssertCompatible<
    PerpsControllerGetRecoveredDispatchesAction['type'],
    'PerpsController:getRecoveredDispatches'
  >,
  AssertCompatible<
    PerpsControllerAcknowledgeRecoveredDispatchAction['type'],
    'PerpsController:acknowledgeRecoveredDispatch'
  >,
];

export type TriggerCapabilityConsumerContract = AssertTrue<
  IsExact<
    Extract<
      DirectProviderOrderCapabilities,
      { status: 'ready' }
    >['supportedTriggerOrderTypes'],
    readonly TriggerOrderType[] | undefined
  >
>;

export type PartialProtectionCapabilityConsumerContract = AssertTrue<
  IsExact<
    NonNullable<
      NonNullable<
        Extract<
          DirectProviderOrderCapabilities,
          { status: 'ready' }
        >['positionTpsl']
      >['partialCoverage']
    >['pair'],
    'equal-quantity-oco' | 'independent'
  >
>;

export type PartialRecoveryConsumerContract = AssertTrue<
  IsExact<
    PerpsPendingManualRecovery['partialIntent'],
    | {
        version: 1 | 2;
        positionSide: 'long' | 'short';
        linkage: 'single' | 'oco' | 'independent';
        legs: {
          type: 'take-profit' | 'stop-loss';
          size: string;
          clientOrderId: string;
        }[];
      }
    | undefined
  >
>;

export type RecoveryAccountCapacityConsumerContract = AssertTrue<
  IsExact<typeof LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT, 64>
>;
// Native grouped signing preserves a fixed tuple for every supported shape.
type GroupedCall = LighterWasmCall<'_signCreateGroupedOrders'>;
type WireOrder = [
  number,
  number,
  string,
  string,
  number,
  number,
  number,
  number,
  string,
  number,
];
type TwoOrderParams<Group extends number, Count extends number = 2> = [
  number,
  Group,
  Count,
  ...WireOrder,
  ...WireOrder,
  number,
];
type ThreeOrderParams<Group extends number, Count extends number = 3> = [
  number,
  Group,
  Count,
  ...WireOrder,
  ...WireOrder,
  ...WireOrder,
  number,
];
type RejectsParams<Params> = Params extends GroupedCall['params']
  ? false
  : true;
export type GroupedSigningConsumerContracts = [
  AssertCompatible<GroupedCall['params'], TwoOrderParams<1>>,
  AssertCompatible<GroupedCall['params'], TwoOrderParams<2>>,
  AssertCompatible<GroupedCall['params'], ThreeOrderParams<3>>,
  AssertTrue<RejectsParams<TwoOrderParams<3>>>,
  AssertTrue<RejectsParams<ThreeOrderParams<1>>>,
  AssertTrue<RejectsParams<ThreeOrderParams<2>>>,
  AssertTrue<RejectsParams<TwoOrderParams<0>>>,
  AssertTrue<RejectsParams<ThreeOrderParams<4>>>,
  AssertTrue<RejectsParams<TwoOrderParams<1, 3>>>,
  AssertTrue<RejectsParams<ThreeOrderParams<3, 2>>>,
  AssertTrue<RejectsParams<[string, 1, 2, ...WireOrder, ...WireOrder, number]>>,
  AssertTrue<RejectsParams<[number, 1, 2, ...WireOrder, ...WireOrder, string]>>,
  AssertTrue<RejectsParams<[number, 1, 2, ...WireOrder, number]>>,
  AssertTrue<RejectsParams<(number | string)[]>>,
];

export type AttachedGroupConsumerContracts = [
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerGetAttachedOrderGroupsAction['handler']>,
      Promise<AttachedOrderGroup[]>
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerReviewAttachedOrderGroupsAction['handler']>,
      Promise<AttachedOrderGroup[]>
    >
  >,
  AssertTrue<
    IsExact<
      AttachedOrderGroup['submission'],
      'prepared' | 'unknown' | 'accepted' | 'canceled' | 'completed'
    >
  >,
];

export type AttachedHistoryConsumerContract = AssertTrue<
  IsExact<
    AttachedOrderGroup['historyStatus'],
    'complete' | 'bounded' | undefined
  >
>;

export type ScaleInventoryConsumerContracts = [
  AssertTrue<
    IsExact<
      Extract<
        keyof ScaleOrderGroup,
        'success' | 'error' | 'partialState' | 'averagePrice'
      >,
      never
    >
  >,
  AssertTrue<
    IsExact<Parameters<NonNullable<PerpsProvider['getScaleOrderGroups']>>, []>
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerGetScaleOrderGroupsAction['handler']>,
      Promise<ScaleOrderGroup[]>
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerReviewScaleOrderGroupsAction['handler']>,
      Promise<ScaleOrderGroup[]>
    >
  >,
  AssertTrue<
    IsExact<
      Extract<
        ScaleOrderChild,
        { state: 'resting' | 'filled' | 'canceled' }
      >['orderId'],
      string
    >
  >,
  AssertTrue<
    IsExact<
      ScaleOrderGroup['state'],
      'placing' | 'stopped' | 'unknown' | 'terminal'
    >
  >,
];

export type ScaleSizingConsumerContracts = [
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerGetScalePriceLadderAction['handler']>,
      [params: GetScalePriceLadderParams]
    >
  >,
  AssertTrue<
    IsExact<
      NonNullable<GetScalePriceLadderParams['sizing']>,
      Readonly<
        (
          | { size: string; usdAmount?: never }
          | { usdAmount: string; size?: never }
        ) & {
          skew?: number;
        }
      >
    >
  >,
  AssertTrue<
    IsExact<
      Extract<PerpsScalePriceLadder, { status: 'ready' }>['sizingPreview'],
      | Readonly<{
          sizes: readonly string[];
          totalSize: string;
          totalNotional: string;
          minimumBaseSize: string;
          minimumQuoteAmount: string;
          sizeDecimals: number;
        }>
      | undefined
    >
  >,
  AssertTrue<
    IsExact<
      { size: string; usdAmount: string } extends NonNullable<
        GetScalePriceLadderParams['sizing']
      >
        ? true
        : false,
      false
    >
  >,
  AssertTrue<
    IsExact<
      Record<string, never> extends NonNullable<
        GetScalePriceLadderParams['sizing']
      >
        ? true
        : false,
      false
    >
  >,
];

export type LighterTwapWireConsumerContract = AssertCompatible<
  {
    readonly baseAmount: string;
    readonly price: string;
    readonly orderExpiry: number;
  },
  ReturnType<typeof prepareLighterTwapOrder>
>;

export type LighterChaseConsumerContracts = [
  AssertTrue<IsExact<typeof LIGHTER_NATIVE_PROBE_CANCEL_LIMIT, 16>>,
  AssertTrue<IsExact<typeof LIGHTER_NATIVE_PROBE_MAX_NOTIONAL, 20>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_MIN_INTERVAL_MS, 1000>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_MAX_DURATION_MS, 300000>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_MAX_REPRICINGS, 20>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_MAX_DISTANCE_BPS, 10000>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_DEFAULT_INTERVAL_MS, 15000>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_DEFAULT_DURATION_MS, 60000>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_DEFAULT_REPRICINGS, 1>>,
  AssertTrue<IsExact<typeof LIGHTER_CHASE_DEFAULT_DISTANCE_BPS, 100>>,
  AssertTrue<
    IsExact<
      Awaited<ReturnType<NonNullable<PerpsProvider['getChaseOrders']>>>,
      ChaseOrder[]
    >
  >,
  AssertTrue<
    IsExact<
      Awaited<ReturnType<NonNullable<PerpsProvider['suspendChaseOrders']>>>,
      ChaseOrder[]
    >
  >,
  AssertTrue<IsExact<ReturnType<typeof readLighterChaseQuote>, string>>,
];

export type LighterTwapObservationConsumerContracts = [
  AssertTrue<IsExact<ReturnType<typeof identifyLighterTwapParent>, string>>,
  AssertTrue<
    IsExact<
      Parameters<
        typeof reconcileLighterTwapObservation
      >[0]['intent']['clientOrderId'],
      string
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof reconcileLighterTwapObservation>['terminalObserved'],
      boolean
    >
  >,
];

export type LighterChaseIdentityConsumerContracts = [
  AssertTrue<IsExact<ReturnType<typeof identifyLighterChaseChild>, string>>,
  AssertTrue<
    IsExact<ReturnType<typeof reconcileLighterChaseChild>['filledSize'], string>
  >,
];
export type ExpectedScalePreviewConsumer = AssertTrue<
  IsExact<OrderParams['expectedScaleLadder'], ExpectedScaleLadder | undefined>
>;
export type PreviewFieldsSatisfyPlacement = AssertCompatible<
  ExpectedScaleLadder,
  { prices: readonly string[] } & NonNullable<
    Extract<PerpsScalePriceLadder, { status: 'ready' }>['sizingPreview']
  >
>;

export type ChaseOwnershipConsumerContracts = [
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerGetChaseOrderOwnershipAction['handler']>,
      [input: GetChaseOrderOwnershipParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsControllerGetChaseOrderOwnershipAction['handler']>,
      Promise<PerpsChaseOrderOwnership>
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerGetChaseOrderOwnershipAction['type'],
      'PerpsController:getChaseOrderOwnership'
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsController['getChaseOrderOwnership']>,
      Promise<PerpsChaseOrderOwnership>
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<NonNullable<PerpsProvider['getChaseOrderOwnership']>>,
      Promise<PerpsChaseOrderOwnership>
    >
  >,
  AssertTrue<
    IsExact<
      Extract<PerpsChaseOrderOwnership, { status: 'available' }>['children'],
      PerpsChaseOrderChild[]
    >
  >,
  AssertTrue<
    IsExact<
      Extract<PerpsChaseOrderOwnership, { status: 'available' }>['owner'],
      PerpsChaseOrderOwner
    >
  >,
  AssertTrue<
    IsExact<PerpsChaseOrderChild['placement'], PerpsChaseOrderDispatch>
  >,
  AssertTrue<IsExact<PerpsChaseOrderChild['clientOrderId'], string>>,
  AssertTrue<
    IsExact<NonNullable<PerpsChaseOrderChild['observation']>['orderId'], string>
  >,
  AssertTrue<
    IsExact<
      NonNullable<PerpsChaseOrderChild['observation']>['filledSize'],
      string
    >
  >,
  AssertTrue<
    IsExact<
      PerpsChaseOrderOwnership['status'],
      'available' | 'unavailable' | 'unsupported'
    >
  >,
];

export type ChaseCancellationReconciliationConsumerContracts = [
  AssertTrue<
    IsExact<
      Parameters<
        PerpsControllerReconcileChaseOrderCancellationAction['handler']
      >,
      [input: ReconcileChaseOrderCancellationParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<
        PerpsControllerReconcileChaseOrderCancellationAction['handler']
      >,
      Promise<ReconcileChaseOrderCancellationResult>
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerReconcileChaseOrderCancellationAction['type'],
      'PerpsController:reconcileChaseOrderCancellation'
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsController['reconcileChaseOrderCancellation']>,
      [input: ReconcileChaseOrderCancellationParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<NonNullable<PerpsProvider['reconcileChaseOrderCancellation']>>,
      Promise<ReconcileChaseOrderCancellationResult>
    >
  >,
  AssertTrue<
    IsExact<
      ReconcileChaseOrderCancellationParams['owner'],
      PerpsChaseOrderOwner
    >
  >,
  AssertTrue<
    IsExact<
      ReconcileChaseOrderCancellationParams['cancellation'],
      { nonce: number; txHash: string; expiresAt: number }
    >
  >,
  AssertTrue<
    IsExact<
      ReconcileChaseOrderCancellationResult['status'],
      'settled' | 'unresolved' | 'unsupported'
    >
  >,
  AssertTrue<
    IsExact<
      Exclude<
        ReconcileChaseOrderCancellationResult,
        { status: 'unsupported' }
      >['order'],
      ChaseOrder
    >
  >,
];

export type IndependentProtectionPublicContract = [
  AssertTrue<
    IsExact<
      UpdatePositionTPSLParams['partialPairLinkage'],
      'equal-quantity-oco' | 'independent' | undefined
    >
  >,
  AssertTrue<
    IsExact<
      NonNullable<OrderResult['positionProtection']>,
      PositionProtectionReceipt
    >
  >,
  AssertTrue<
    IsExact<
      PositionProtectionReceipt['legs'][number]['requestedSize'],
      string | undefined
    >
  >,
];

export type ChaseProbePublicContract = AssertTrue<
  IsExact<LighterCredentials['chaseTestnetProbe'], boolean | undefined>
>;

export type ReplacePositionTPSLLegConsumerContracts = [
  AssertTrue<IsExact<PositionTPSLLeg, 'tp' | 'sl'>>,
  AssertTrue<
    IsExact<
      ReplacePositionTPSLLegParams,
      {
        symbol: string;
        leg: PositionTPSLLeg;
        triggerPrice: string;
        limitPrice?: string;
        maxSlippageBps?: number;
        expectedPosition?: UpdatePositionTPSLParams['expectedPosition'];
        trackingData?: UpdatePositionTPSLParams['trackingData'];
        providerId?: UpdatePositionTPSLParams['providerId'];
      }
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerReplacePositionTPSLLegAction['type'],
      'PerpsController:replacePositionTPSLLeg'
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerReplacePositionTPSLLegAction['handler']>,
      [params: ReplacePositionTPSLLegParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<PerpsController['replacePositionTPSLLeg']>,
      Promise<OrderResult>
    >
  >,
  // Optional member: a provider written before the method still type-checks.
  AssertCompatible<
    PerpsProvider,
    Omit<PerpsProvider, 'replacePositionTPSLLeg'>
  >,
];

export type AdvancedOrderListsConsumerContracts = [
  AssertTrue<
    IsExact<
      PerpsControllerSubscribeToLiveTwapOrdersAction['type'],
      'PerpsController:subscribeToLiveTwapOrders'
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerSubscribeToLiveTwapOrdersAction['handler']>,
      [params: SubscribeLiveTwapOrdersParams]
    >
  >,
  AssertTrue<
    IsExact<
      PerpsControllerSubscribeToChaseOrderListsAction['type'],
      'PerpsController:subscribeToChaseOrderLists'
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<PerpsControllerSubscribeToChaseOrderListsAction['handler']>,
      [params: SubscribeChaseOrderListsParams]
    >
  >,
  AssertTrue<
    IsExact<LiveTwapOrderSource['getTwapOrders'], () => Promise<TwapOrder[]>>
  >,
  AssertTrue<
    IsExact<LiveChaseOrderSource['getChaseOrders'], () => Promise<ChaseOrder[]>>
  >,
];

type PostOnlyErrorCode =
  | 'ORDER_POST_ONLY_WOULD_CROSS'
  | 'ORDER_POST_ONLY_WINDOW';

// Clients key exhaustive `Record<PerpsErrorCode, string>` translation maps
// (Mobile `translatePerpsError.ts`, Extension `translate-perps-error.ts`), so
// each new code is a compile-time change for them. A code added or renamed
// here must come with matching client entries.
export type PostOnlyErrorCodeConsumerContracts = [
  AssertTrue<
    IsExact<
      (typeof PERPS_ERROR_CODES)['ORDER_POST_ONLY_WOULD_CROSS'],
      'ORDER_POST_ONLY_WOULD_CROSS'
    >
  >,
  AssertTrue<
    IsExact<
      (typeof PERPS_ERROR_CODES)['ORDER_POST_ONLY_WINDOW'],
      'ORDER_POST_ONLY_WINDOW'
    >
  >,
  AssertTrue<
    IsExact<Extract<PerpsErrorCode, PostOnlyErrorCode>, PostOnlyErrorCode>
  >,
  AssertTrue<
    IsExact<
      Record<Exclude<PerpsErrorCode, PostOnlyErrorCode>, string> extends Record<
        PerpsErrorCode,
        string
      >
        ? true
        : false,
      false
    >
  >,
];

export type ProviderErrorDetailsConsumerContracts = [
  AssertTrue<
    IsExact<PerpsErrorDetails, PriceMovedErrorDetails | HyperLiquidErrorDetails>
  >,
  AssertTrue<
    IsExact<
      HyperLiquidErrorDetails,
      {
        code: Exclude<PerpsErrorCode, 'PRICE_MOVED'>;
        provider: 'hyperliquid';
      }
    >
  >,
  // Clients narrow on `code === PRICE_MOVED` before reading the numeric
  // payload; the provider-tagged variant must never satisfy that check.
  AssertTrue<
    IsExact<
      Extract<PerpsErrorDetails, { code: 'PRICE_MOVED' }>,
      PriceMovedErrorDetails
    >
  >,
  AssertTrue<
    IsExact<Extract<HyperLiquidErrorDetails['code'], 'PRICE_MOVED'>, never>
  >,
  AssertTrue<
    IsExact<
      Extract<HyperLiquidErrorDetails['code'], PostOnlyErrorCode>,
      PostOnlyErrorCode
    >
  >,
  AssertTrue<
    IsExact<OrderResult['errorDetails'], PerpsErrorDetails | undefined>
  >,
];

type HasNormalizedErrorFields<Result> =
  IsExact<
    Result[Extract<keyof Result, 'errorCode'>],
    PerpsErrorCode | undefined
  > extends true
    ? IsExact<
        Result[Extract<keyof Result, 'errorDetails'>],
        PerpsErrorDetails | undefined
      >
    : false;

export type NormalizedResultErrorFieldsConsumerContracts = [
  AssertTrue<HasNormalizedErrorFields<OrderResult>>,
  AssertTrue<HasNormalizedErrorFields<MarginResult>>,
  AssertTrue<HasNormalizedErrorFields<WithdrawResult>>,
  AssertTrue<HasNormalizedErrorFields<TransferBetweenDexsResult>>,
  AssertTrue<HasNormalizedErrorFields<InitializeResult>>,
  AssertTrue<HasNormalizedErrorFields<ReadyToTradeResult>>,
  AssertTrue<HasNormalizedErrorFields<DisconnectResult>>,
  AssertTrue<HasNormalizedErrorFields<ToggleTestnetResult>>,
  AssertTrue<HasNormalizedErrorFields<ClosePositionsResult>>,
  AssertTrue<HasNormalizedErrorFields<ClosePositionsResult['results'][number]>>,
];

// Aggregated account reads/streams and tagged close targets, imported through
// the package entrypoint the way a client imports them, so a dropped or
// renamed export fails here instead of only in internal `src/types` tests.
export type AggregatedAccountConsumerContracts = [
  AssertTrue<
    IsExact<
      Extract<PerpsProviderAccountStateEntry, { status: 'available' }>,
      {
        status: 'available';
        state: AccountState;
        providerId: PerpsProviderType;
      }
    >
  >,
  AssertTrue<
    IsExact<
      PerpsProviderAccountStateEntry,
      | {
          status: 'available';
          state: AccountState;
          providerId: PerpsProviderType;
        }
      | {
          status: 'unavailable';
          error?: string;
          providerId: PerpsProviderType;
        }
      | {
          status: 'pending';
          providerId: PerpsProviderType;
        }
    >
  >,
  AssertTrue<
    IsExact<
      Extract<PerpsProviderAccountStateEntry, { status: 'pending' }>,
      {
        status: 'pending';
        providerId: PerpsProviderType;
      }
    >
  >,
  AssertTrue<
    IsExact<
      Extract<PerpsProviderAccountStateEntry, { status: 'unavailable' }>,
      {
        status: 'unavailable';
        error?: string;
        providerId: PerpsProviderType;
      }
    >
  >,
  AssertTrue<
    IsExact<
      AccountAggregateMetadata,
      {
        status: 'complete' | 'partial';
        availableProviders: PerpsProviderType[];
        unavailableProviders: PerpsProviderType[];
        pendingProviders?: PerpsProviderType[];
      }
    >
  >,
  AssertTrue<
    IsExact<
      AccountState['providerStates'],
      | Partial<Record<PerpsProviderType, PerpsProviderAccountStateEntry>>
      | undefined
    >
  >,
  AssertTrue<
    IsExact<AccountState['aggregate'], AccountAggregateMetadata | undefined>
  >,
  AssertTrue<
    IsExact<
      Parameters<SubscribeAccountParams['callback']>,
      [account: AccountState | null, aggregate?: AccountAggregateMetadata]
    >
  >,
  AssertTrue<
    IsExact<
      CancelOrdersParams['orders'],
      { orderId: string; providerId: PerpsProviderType }[] | undefined
    >
  >,
  AssertTrue<
    IsExact<AccountState['providerId'], PerpsProviderType | undefined>
  >,
  AssertTrue<
    IsExact<
      ClosePositionsTarget,
      { symbol: string; providerId: PerpsProviderType }
    >
  >,
  AssertTrue<
    IsExact<ClosePositionsParams['targets'], ClosePositionsTarget[] | undefined>
  >,
  AssertTrue<IsExact<TrackingData['totalFee'], number | undefined>>,
  AssertTrue<IsExact<TrackingData['marketPrice'], number | undefined>>,
];

// Shared client helpers: their parameter and result types are importable
// from the package entry and are the ones the helpers use.
export type SharedHelperConsumerContracts = [
  AssertTrue<
    IsExact<
      ReturnType<typeof getCrossMarginRatioTone>,
      CrossMarginRatioTone | undefined
    >
  >,
  AssertTrue<IsExact<CrossMarginRatioTone, 'safe' | 'warning' | 'danger'>>,
  AssertTrue<
    IsExact<Parameters<typeof calculateCloseSize>, [params: CloseSizeParams]>
  >,
  AssertTrue<
    IsExact<ReturnType<typeof calculateCloseSize>, CloseSize | undefined>
  >,
  AssertTrue<IsExact<CloseSize, { size: number; usdValue: number }>>,
  AssertCompatible<
    CloseSizeParams,
    { positionSize: '2'; price: 100; sizeDecimals: 3; percent: 50 }
  >,
  AssertCompatible<
    CloseSizeParams,
    { positionSize: 2; price: '100'; sizeDecimals: 3; usdAmount: '50' }
  >,
  AssertTrue<
    IsExact<
      Parameters<typeof calculateFeeNotionalUsd>,
      [params: FeeNotionalParams]
    >
  >,
  AssertCompatible<
    FeeNotionalParams,
    { size: '1'; price: readonly ['100', '']; closePercent: 50 }
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof calculateOrderBookAggregationParams>,
      OrderBookAggregationParams
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<typeof estimateOrderBookSlippage>,
      [params: OrderBookSlippageParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof estimateOrderBookSlippage>,
      OrderBookSlippageEstimate
    >
  >,
  AssertTrue<
    IsExact<OrderBookSlippageEstimate['canFill'], boolean | undefined>
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof calculateOrderBookSpread>,
      OrderBookSpread | undefined
    >
  >,
  AssertTrue<
    IsExact<
      OrderBookSpread,
      { spread: number; midPrice: number; spreadPercentage: number }
    >
  >,
  AssertTrue<
    IsExact<GlobalSnapshotContext['request'], PerpsGlobalSnapshotRequest>
  >,
  AssertTrue<IsExact<ReturnType<GlobalSnapshotContext['isCurrent']>, boolean>>,
];

// Client-gap helpers (TAT-4755 follow-up): sort fields, market values, close
// rounding, tick-based grouping and chart event keys.
export type ClientGapHelperContracts = [
  AssertTrue<
    IsExact<ImportedSortMarketsParams['sortBy'], ImportedMarketSortField>
  >,
  AssertTrue<
    IsExact<
      ImportedMarketSortField,
      | 'volume'
      | 'priceChange'
      | 'fundingRate'
      | 'openInterest'
      | 'price'
      | 'name'
    >
  >,
  AssertTrue<
    IsExact<
      ImportedPerpsMarketData['numericValues'],
      ImportedPerpsMarketNumericValues | undefined
    >
  >,
  AssertTrue<
    IsExact<
      ImportedPerpsMarketNumericValues,
      {
        price?: number;
        change24hPercent?: number;
        volume?: number;
        openInterest?: number;
      }
    >
  >,
  AssertTrue<IsExact<ImportedCloseSizeRounding, 'up' | 'down'>>,
  AssertTrue<
    IsExact<
      ImportedOrderBookGroupingOptionsParams,
      {
        midPrice: number;
        tickSize?: number;
        ladder?: ImportedOrderBookGroupingLadder;
      }
    >
  >,
  AssertTrue<IsExact<ImportedOrderBookGroupingLadder, 'decade' | 'tick'>>,
  AssertTrue<
    IsExact<
      Parameters<typeof importedCalculateAccountReturnOnEquity>,
      [params: ImportedAccountReturnOnEquityParams]
    >
  >,
  AssertTrue<
    IsExact<
      ImportedAccountReturnOnEquityParams,
      { unrealizedPnl: number | string; marginUsed: number | string }
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof importedCalculateAccountReturnOnEquity>,
      number | undefined
    >
  >,
  AssertTrue<
    IsExact<
      ImportedCloseSizeParams['rounding'],
      ImportedCloseSizeRounding | undefined
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<typeof importedCalculateOrderBookGroupingOptions>,
      [params: number | ImportedOrderBookGroupingOptionsParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof importedCalculateOrderBookGroupingOptions>,
      number[]
    >
  >,
  AssertTrue<
    IsExact<
      (typeof IMPORTED_PERPS_EVENT_PROPERTY)['CHART_INTERACTION'],
      'chart_interaction'
    >
  >,
  AssertTrue<
    IsExact<
      (typeof IMPORTED_PERPS_EVENT_VALUE)['INTERACTION_TYPE']['CHART_INTERACTED'],
      'chart_interacted'
    >
  >,
];

// Helper review follow-up: sort options, chart event keys, and helpers kept
// out of the public surface.
export type ClientGapReviewContracts = [
  AssertTrue<IsExact<ImportedSortMarketsParams['missing'], 'last' | undefined>>,
  AssertTrue<
    IsExact<
      ImportedGetMarketDataWithPricesParams['sortBy'],
      ImportedMarketSortField | undefined
    >
  >,
  AssertTrue<
    IsExact<
      (typeof IMPORTED_PERPS_EVENT_PROPERTY)['PREVIOUS_CANDLE_PERIOD'],
      'previous_candle_period'
    >
  >,
  AssertTrue<
    IsExact<
      (typeof IMPORTED_PERPS_EVENT_PROPERTY)['PREVIOUS_CHART_TYPE'],
      'previous_chart_type'
    >
  >,
  AssertTrue<
    IsExact<
      Extract<keyof typeof IMPORTED_PERPS_EVENT_PROPERTY, 'FROM' | 'TO'>,
      never
    >
  >,
  AssertTrue<
    IsExact<
      Pick<
        (typeof IMPORTED_PERPS_EVENT_VALUE)['CHART_INTERACTION'],
        'FULLSCREEN_ENTERED' | 'FULLSCREEN_EXITED'
      >,
      {
        readonly FULLSCREEN_ENTERED: 'fullscreen_entered';
        readonly FULLSCREEN_EXITED: 'fullscreen_exited';
      }
    >
  >,
  AssertTrue<
    IsExact<
      Extract<
        keyof (typeof IMPORTED_PERPS_EVENT_VALUE)['CHART_INTERACTION'],
        'FULLSCREEN'
      >,
      never
    >
  >,
  AssertTrue<
    IsExact<
      Pick<
        (typeof IMPORTED_PERPS_EVENT_VALUE)['STATUS'],
        'CRAFTED' | 'DRAGGED' | 'DROPPED' | 'CANCELLED' | 'MODIFIED' | 'TAPPED'
      >,
      {
        readonly CRAFTED: 'crafted';
        readonly DRAGGED: 'dragged';
        readonly DROPPED: 'dropped';
        readonly CANCELLED: 'cancelled';
        readonly MODIFIED: 'modified';
        readonly TAPPED: 'tapped';
      }
    >
  >,
  AssertTrue<
    IsExact<
      Pick<
        (typeof IMPORTED_PERPS_EVENT_VALUE)['ACTION'],
        'ADD' | 'REMOVE' | 'EDIT' | 'FAVORITE' | 'UNFAVORITE'
      >,
      {
        readonly ADD: 'add';
        readonly REMOVE: 'remove';
        readonly EDIT: 'edit';
        readonly FAVORITE: 'favorite';
        readonly UNFAVORITE: 'unfavorite';
      }
    >
  >,
  AssertTrue<
    IsExact<(typeof IMPORTED_PERPS_EVENT_VALUE)['SOURCE']['CHART'], 'chart'>
  >,
  AssertTrue<
    IsExact<
      typeof PerpsMarketUtilsModule.getPerpsDisplaySymbol,
      (symbol: string) => string
    >
  >,
  AssertTrue<
    IsExact<
      typeof PerpsControllerPackage.getPerpsDisplaySymbol,
      typeof PerpsMarketUtilsModule.getPerpsDisplaySymbol
    >
  >,
  // Internal: built into market rows, not exported.
  AssertTrue<
    IsExact<
      Extract<
        | keyof typeof PerpsControllerPackage
        | keyof typeof PerpsSortMarketsModule,
        'buildMarketNumericValues'
      >,
      never
    >
  >,
];

// Cross liquidation (TAT-4754 R1, R2): typed estimate and preview reasons.
export type CrossLiquidationContracts = [
  AssertTrue<
    IsExact<
      ImportedEstimateCrossLiquidationParams,
      {
        symbol: string;
        direction: 'long' | 'short';
        size: string;
        entryPrice: string;
        leverage: number;
        feeAmountUsd?: number;
        providerId?: ImportedPerpsProviderType;
      }
    >
  >,
  AssertTrue<
    IsExact<
      ImportedCrossLiquidationEstimate,
      | { status: 'price'; price: string }
      | { status: 'none'; reason: 'covered_by_account' }
      | {
          status: 'unavailable';
          reason: 'missing_inputs' | 'account_unknown' | 'provider';
        }
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<ImportedPerpsController['estimateCrossLiquidation']>,
      [params: ImportedEstimateCrossLiquidationParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<ImportedPerpsController['estimateCrossLiquidation']>,
      Promise<ImportedCrossLiquidationEstimate>
    >
  >,
  AssertTrue<
    IsExact<
      ImportedPerpsControllerEstimateCrossLiquidationAction['type'],
      'PerpsController:estimateCrossLiquidation'
    >
  >,
  AssertTrue<
    IsExact<
      ImportedPerpsControllerEstimateCrossLiquidationAction['handler'],
      ImportedPerpsController['estimateCrossLiquidation']
    >
  >,
  AssertTrue<
    IsExact<
      ImportedPerpsProvider['estimateCrossLiquidation'],
      | ((
          params: ImportedEstimateCrossLiquidationParams,
        ) => Promise<ImportedCrossLiquidationEstimate>)
      | undefined
    >
  >,
  AssertTrue<
    IsExact<
      ImportedPositionPreviewUnavailableReason,
      'covered_by_account' | 'missing_inputs'
    >
  >,
  AssertTrue<
    IsExact<
      Extract<ImportedPositionPreviewValue, { available: false }>,
      { available: false; reason?: ImportedPositionPreviewUnavailableReason }
    >
  >,
];

// Leverage display (TAT-4754 R16).
export type LeverageFormatContracts = [
  AssertTrue<
    IsExact<
      ImportedPerpsLeverageFormatOptions,
      Pick<{ formatters?: ImportedPerpsIntlFormatters }, 'formatters'> & {
        minimumFractionDigits?: number;
        maximumFractionDigits?: number;
      }
    >
  >,
  AssertTrue<
    IsExact<
      typeof importedFormatLeverage,
      (
        value: string | number | null | undefined,
        options?: ImportedPerpsLeverageFormatOptions,
      ) => string
    >
  >,
  AssertTrue<IsExact<(typeof IMPORTED_PERPS_DISPLAY_PRECISION)['Leverage'], 2>>,
];

// Cross liquidation and preview helpers on the `./utils` subpaths.
export type CrossPositionPreviewContracts = [
  AssertTrue<
    IsExact<
      ImportedCrossLiquidationPriceParams,
      {
        isLong: boolean;
        markPrice: number;
        positionSize: number;
        accountValue: number;
        maintenanceMargin: number;
        marginTiers: ImportedHyperLiquidMarginTier[] | null | undefined;
      }
    >
  >,
  AssertTrue<
    IsExact<
      ImportedCrossLiquidationClassification,
      | { status: 'price'; price: number }
      | { status: 'covered_by_account' }
      | { status: 'missing_inputs' }
    >
  >,
  AssertTrue<
    IsExact<
      typeof importedClassifyCrossLiquidationPrice,
      (
        params: ImportedCrossLiquidationPriceParams,
      ) => ImportedCrossLiquidationClassification
    >
  >,
  AssertTrue<
    IsExact<
      ImportedHyperLiquidCrossAccount,
      {
        accountValue: number;
        maintenanceMargin: number;
        hip3Funding?: { withdrawable: number; requiredMargin: number };
      }
    >
  >,
  AssertTrue<
    IsExact<
      ImportedProjectHyperLiquidCrossPositionModifyParams,
      ImportedPositionModifyPreviewParams & {
        marginTiers?: ImportedHyperLiquidMarginTier[] | null;
        crossAccount: ImportedHyperLiquidCrossAccount | null;
      }
    >
  >,
  AssertTrue<
    IsExact<
      ImportedHyperLiquidCrossPositionModifyProjection,
      | { status: 'none' }
      | { status: 'full_close'; resultingDirection: 'long' | 'short' }
      | {
          status: 'open';
          kind: ImportedPositionModifyPreviewKind;
          direction: 'long' | 'short';
          size: number;
          entryPrice: number;
          margin: number;
          liquidation: ImportedCrossLiquidationClassification;
        }
    >
  >,
  AssertTrue<
    IsExact<
      typeof importedProjectHyperLiquidCrossPositionModify,
      (
        params: ImportedProjectHyperLiquidCrossPositionModifyParams,
      ) => ImportedHyperLiquidCrossPositionModifyProjection
    >
  >,
  AssertTrue<
    IsExact<
      typeof importedPreviewHyperLiquidCrossPositionModify,
      (
        params: ImportedProjectHyperLiquidCrossPositionModifyParams,
      ) => ImportedPositionModifyPreviewResult
    >
  >,
];

// Venue meta, mark/oracle prices (TAT-4755 gaps 5 and 8).
export type AccountMetaContracts = [
  AssertTrue<
    IsExact<AccountMetaMarginTier, { lowerBound: number; maxLeverage: number }>
  >,
  AssertTrue<
    IsExact<
      AccountMetaMarketInfo['marginTiers'],
      AccountMetaMarginTier[] | undefined
    >
  >,
  AssertTrue<
    IsExact<
      Extract<AccountMetaOrderCapabilities, { status: 'ready' }>['marginTiers'],
      AccountMetaMarginTier[] | undefined
    >
  >,
  AssertTrue<IsExact<AccountMetaPriceUpdate['markPrice'], string | undefined>>,
  AssertTrue<
    IsExact<AccountMetaPriceUpdate['oraclePrice'], string | undefined>
  >,
  AssertTrue<
    IsExact<
      Parameters<typeof accountMetaAdaptMarketFromSDK>[1],
      | [
          number,
          {
            description: string;
            marginTiers: { lowerBound: string; maxLeverage: number }[];
          },
        ][]
      | undefined
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof accountMetaAdaptMarketFromSDK>,
      AccountMetaMarketInfo
    >
  >,
];

// Margin adjustment limits (R3) and cached market meta (R11).
declare const accountMetaController: AccountMetaController;
const accountMetaOneMarket = accountMetaController.getMarketMeta({
  symbol: 'BTC',
});
const accountMetaAllMarkets = accountMetaController.getMarketMeta();
export type MarginLimitsAndMarketMetaContracts = [
  AssertTrue<
    IsExact<
      AccountMetaLimitsParams,
      { symbol: string; providerId?: AccountMetaProviderType }
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaLimits,
      | { status: 'available'; maxAdd: string; maxRemove: string }
      | { status: 'unavailable'; reason: AccountMetaLimitsReason }
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaLimitsReason,
      'no_isolated_position' | 'account_unknown' | 'provider'
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaLimitsAction['handler'],
      (params: AccountMetaLimitsParams) => Promise<AccountMetaLimits>
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaLimitsAction['type'],
      'PerpsController:getMarginAdjustmentLimits'
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaMarketMetaParams,
      { symbol?: string; providerId?: AccountMetaProviderType }
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaMarketMeta,
      {
        symbol: string;
        marginTiers: AccountMetaMarginTier[] | null;
        isDelisted: boolean;
        maxLeverage: number;
        onlyIsolated: boolean;
      }
    >
  >,
  AssertTrue<
    IsExact<Awaited<typeof accountMetaOneMarket>, AccountMetaMarketMeta>
  >,
  AssertTrue<
    IsExact<Awaited<typeof accountMetaAllMarkets>, AccountMetaMarketMeta[]>
  >,
  // Through the messenger, the last overload: the caller narrows the result.
  AssertTrue<
    IsExact<
      Parameters<AccountMetaMarketMetaAction['handler']>,
      [params?: AccountMetaMarketMetaParams]
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<AccountMetaMarketMetaAction['handler']>,
      Promise<AccountMetaMarketMeta | AccountMetaMarketMeta[]>
    >
  >,
  AssertTrue<
    IsExact<
      AccountMetaMarketMetaAction['type'],
      'PerpsController:getMarketMeta'
    >
  >,
  AssertTrue<
    IsExact<
      (typeof AccountMetaErrorCodes)['MARKET_NOT_FOUND'],
      'MARKET_NOT_FOUND'
    >
  >,
  AssertTrue<
    IsExact<
      typeof accountMetaIsCrossMarginSupported,
      (market: {
        onlyIsolated?: boolean;
        marginMode?: string | null;
      }) => boolean
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<typeof accountMetaIsMarginRemovalAllowed>,
      boolean | undefined
    >
  >,
];

// Shared streams (TAT-4769): every subscription a client consumes, its
// messenger action and the manager itself.
type Flat<Type> = { [Key in keyof Type]: Type[Key] };
type StreamCallbacks<Args extends unknown[]> = {
  callback: (...args: Args) => void;
  onError?: (error: Error) => void;
  throttleMs?: number;
  onReset?: () => void;
};
export type SharedStreamContracts = [
  AssertTrue<
    IsExact<
      Flat<StreamMarketMetaParams>,
      Flat<
        {
          providerId?: ImportedPerpsProviderType;
        } & StreamCallbacks<[markets: AccountMetaMarketMeta[]]>
      >
    >
  >,
  AssertTrue<
    IsExact<
      Flat<StreamMarginLimitsParams>,
      Flat<
        AccountMetaLimitsParams & StreamCallbacks<[limits: AccountMetaLimits]>
      >
    >
  >,
  AssertTrue<
    IsExact<
      Flat<StreamLatencyParams>,
      Flat<
        {
          providerId?: ImportedPerpsProviderType;
        } & StreamCallbacks<[latencyMs: number]>
      >
    >
  >,
  AssertTrue<
    IsExact<
      Flat<StreamFeeRatesParams>,
      Flat<
        {
          symbol: string;
          orderType?: StreamOrderType;
          providerId?: ImportedPerpsProviderType;
          amount?: string;
        } & StreamCallbacks<[rates: StreamFeeRates]>
      >
    >
  >,
  AssertTrue<
    IsExact<
      Flat<StreamAgentValidityParams>,
      Flat<
        {
          accountId?: `${string}:${string}:${string}`;
          providerId?: ImportedPerpsProviderType;
        } & StreamCallbacks<[validity: StreamAgentValidity]>
      >
    >
  >,
  AssertTrue<
    IsExact<
      [
        StreamMarketMetaAction['type'],
        StreamMarginLimitsAction['type'],
        StreamLatencyAction['type'],
        StreamFeeRatesAction['type'],
        StreamAgentValidityAction['type'],
        StreamSnapshotAction['type'],
        StreamResubscribeAction['type'],
      ],
      [
        'PerpsController:subscribeToMarketMeta',
        'PerpsController:subscribeToMarginAdjustmentLimits',
        'PerpsController:subscribeToConnectionLatency',
        'PerpsController:subscribeToFeeRates',
        'PerpsController:subscribeToTradingAgentValidity',
        'PerpsController:getStreamSnapshot',
        'PerpsController:resubscribeStreams',
      ]
    >
  >,
  AssertTrue<
    IsExact<
      [
        StreamMarketMetaAction['handler'],
        StreamMarginLimitsAction['handler'],
        StreamLatencyAction['handler'],
        StreamFeeRatesAction['handler'],
        StreamAgentValidityAction['handler'],
        StreamResubscribeAction['handler'],
      ],
      [
        (params: StreamMarketMetaParams) => () => void,
        (params: StreamMarginLimitsParams) => () => void,
        (params: StreamLatencyParams) => () => void,
        (params: StreamFeeRatesParams) => () => void,
        (params: StreamAgentValidityParams) => () => void,
        () => void,
      ]
    >
  >,
  AssertTrue<
    IsExact<
      StreamName,
      | 'account'
      | 'availableToTrade'
      | 'candles'
      | 'chaseOrderLists'
      | 'connectionLatency'
      | 'feeRates'
      | 'liveTwapOrders'
      | 'marginAdjustmentLimits'
      | 'marketMeta'
      | 'oiCaps'
      | 'orderBook'
      | 'orderFills'
      | 'orders'
      | 'positions'
      | 'prices'
      | 'publicTrades'
      | 'tradingAgentValidity'
      | 'twapOrders'
    >
  >,
  AssertTrue<
    IsExact<StreamSnapshot<'prices'>, [prices: AccountMetaPriceUpdate[]]>
  >,
  // A failed seed or subscription reaches every client-facing live read.
  AssertTrue<
    IsExact<
      [
        NonNullable<StreamParams['prices']['onError']>,
        NonNullable<StreamParams['positions']['onError']>,
        NonNullable<StreamParams['account']['onError']>,
        NonNullable<StreamParams['oiCaps']['onError']>,
        NonNullable<StreamParams['twapOrders']['onError']>,
      ],
      [
        (error: Error) => void,
        (error: Error) => void,
        (error: Error) => void,
        (error: Error) => void,
        (error: Error) => void,
      ]
    >
  >,
  // Optional members: a provider or client written before them type-checks.
  AssertCompatible<
    PerpsProvider,
    Omit<
      PerpsProvider,
      'subscribeToMarketChanges' | 'subscribeToChaseOrderChanges'
    >
  >,
  AssertTrue<
    IsExact<
      NonNullable<StreamDependencies['rewards']['subscribeToPerpsFeeChanges']>,
      (listener: () => void) => () => void
    >
  >,
  AssertTrue<
    IsExact<
      NonNullable<LiveChaseOrderSource['subscribeToChaseOrderChanges']>,
      (listener: () => void) => () => void
    >
  >,
  AssertTrue<
    IsExact<
      ReturnType<StreamManager['subscribe']>,
      ReturnType<StreamManager['pause']>
    >
  >,
  AssertTrue<
    IsExact<
      Pick<StreamSource<[number]>, 'delivery' | 'replay' | 'selfRecovering'>,
      {
        delivery?: 'latest' | 'merge' | 'queue';
        replay?: boolean;
        selfRecovering?: boolean;
      }
    >
  >,
];

// Account leverage by account mode (R17): clients pass the account state's
// mode straight through.
export type AccountSummaryModeContracts = [
  AssertTrue<
    IsExact<
      AccountMetaSummaryParams['accountMode'],
      AccountMetaAccountState['accountMode']
    >
  >,
  AssertTrue<
    IsExact<
      Parameters<typeof accountMetaCalculateAccountSummary>[0],
      AccountMetaSummaryParams
    >
  >,
];
