import type {
  ChaseOrder,
  PerpsController,
  GetChaseOrderOwnershipParams,
  PerpsChaseOrderOwner,
  PerpsChaseOrderChild,
  PerpsChaseOrderDispatch,
  PerpsChaseOrderOwnership,
  PerpsControllerGetChaseOrderOwnershipAction,
  PerpsProvider,
  DirectProviderOrderCapabilities,
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
