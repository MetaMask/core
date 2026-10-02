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

// Compile-time consumer contracts. These are not runtime fixture assertions.
type AssertCompatible<Expected, Actual extends Expected> = Actual;
type IsExact<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? true
    : false;
type AssertTrue<Value extends true> = Value;
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
