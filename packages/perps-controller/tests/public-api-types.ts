import type {
  ChaseOrder,
  PerpsController,
  GetChaseOrderOwnershipParams,
  PerpsChaseOrderOwner,
  PerpsChaseOrderChild,
  PerpsChaseOrderDispatch,
  PerpsChaseOrderOwnership,
  PerpsControllerGetChaseOrderOwnershipAction,
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
} from '@metamask/perps-controller';
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
  readLighterChaseQuote,
  reconcileLighterChaseChild,
  identifyLighterChaseChild,
} from '@metamask/perps-controller/utils/lighterChase';
import type { prepareLighterTwapOrder } from '@metamask/perps-controller/utils/lighterTwap';
import type {
  reconcileLighterTwapObservation,
  identifyLighterTwapParent,
} from '@metamask/perps-controller/utils/lighterTwapReconciliation';

// Compile-time consumer contracts. These are not runtime fixture assertions.
type AssertCompatible<Expected, Actual extends Expected> = Actual;
type IsExact<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? true
    : false;
type AssertTrue<Value extends true> = Value;
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
