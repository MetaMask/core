import type { ChaseOrder } from '@metamask/perps-controller';
import type {
  OrderResult,
  OrderEditObservation,
  EditOrderParams,
  LighterSignModifyOrderWireParams,
  PerpsControllerEditOrderAction,
} from '@metamask/perps-controller';
import type {
  ScaleOrderGroup,
  PerpsProvider,
  ScaleOrderChild,
  GetScalePriceLadderParams,
  PerpsScalePriceLadder,
  PerpsControllerGetScalePriceLadderAction,
  PerpsControllerGetScaleOrderGroupsAction,
  PerpsControllerReviewScaleOrderGroupsAction,
} from '@metamask/perps-controller';
import type {
  DirectProviderOrderCapabilities,
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
import type { LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT } from '@metamask/perps-controller/constants/lighterConfig';
import type {
  readLighterChaseQuote,
  reconcileLighterChaseChild,
  identifyLighterChaseChild,
} from '@metamask/perps-controller/utils/lighterChase';
import type { prepareLighterTwapOrder } from '@metamask/perps-controller/utils/lighterTwap';
import {
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
        version: 1;
        positionSide: 'long' | 'short';
        linkage: 'single' | 'oco';
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
