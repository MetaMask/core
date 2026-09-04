import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { BrokenCircuitError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';
import type { Draft } from 'immer';

import type {
  AutorampAccount,
  AutorampRemoteSnapshot,
  CreateAutorampRequest,
} from './autorampAccount.js';
import {
  applyAutorampRemoteStatus,
  AutorampStatus,
  createAutorampAccount,
  markAutorampNotified,
} from './autorampAccount.js';
import {
  getHeadlessProviderAllowlist,
  isHeadlessAllProvidersEnabled,
  normalizeHeadlessProviderId,
} from './featureFlags.js';
import type {
  MoneyAccountDeposit,
  MoneyAccountDepositRemoteSnapshot,
} from './moneyAccountDeposit.js';
import {
  applyDepositRemoteStatus,
  isTerminalDepositStatus,
  markDepositNotified,
} from './moneyAccountDeposit.js';
import type {
  NeoBankServiceCreateAutorampAction,
  NeoBankServiceGetAutorampAction,
  NeoBankServiceGetAutorampTransactionsAction,
  NeoBankServiceGetCustomerByExternalIdAction,
  NeoBankServiceGetWalletRegistrationStatusAction,
  NeoBankServiceRegisterSelfHostedWalletAction,
} from './NeoBankService-method-action-types.js';
import type { NeoBankServiceActions } from './NeoBankService.js';
import {
  PENDING_ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
} from './orderStatus.js';
import { buildOwnershipMessage } from './ownership-message.js';
import {
  mergePaymentMethodsById,
  pickPaymentMethod,
} from './paymentMethodMerge.js';
import {
  getProvidersServingAsset,
  normalizeRampsAssetId,
  providerServesAsset,
} from './providerAvailability.js';
import type { RampsControllerMethodActions } from './RampsController-method-action-types.js';
import type { RampsErrorCode } from './rampsErrorCodes.js';
import { RAMPS_ERROR_CODES } from './rampsErrorCodes.js';
import type {
  RampsServiceGetDefaultRedirectCallbackUrlAction,
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
  RampsServiceGetPaymentMethodsAction,
  RampsServiceGetQuotesAction,
  RampsServiceGetBuyWidgetUrlAction,
  RampsServiceGetOrderAction,
  RampsServiceGetOrderFromCallbackAction,
} from './RampsService-method-action-types.js';
import type {
  BuyWidget,
  Country,
  TokensResponse,
  Provider,
  State,
  RampAction,
  PaymentMethod,
  PaymentMethodsResponse,
  QuotesResponse,
  Quote,
  QuoteSortBy,
  RampsToken,
  RampsServiceActions,
  RampsOrder,
  ProvidersResponse,
} from './RampsService.js';
import { RampsOrderStatus } from './RampsService.js';
import type {
  RequestCache as RequestCacheType,
  RequestState,
  ExecuteRequestOptions,
  PendingRequest,
  ResourceType,
} from './RequestCache.js';
import {
  DEFAULT_REQUEST_CACHE_TTL,
  DEFAULT_REQUEST_CACHE_MAX_SIZE,
  createCacheKey,
  isCacheExpired,
  createLoadingState,
  createSuccessState,
  createErrorState,
  RequestStatus,
} from './RequestCache.js';
import type {
  TransakServiceSetApiKeyAction,
  TransakServiceSetAccessTokenAction,
  TransakServiceClearAccessTokenAction,
  TransakServiceSendUserOtpAction,
  TransakServiceVerifyUserOtpAction,
  TransakServiceLogoutAction,
  TransakServiceGetUserDetailsAction,
  TransakServiceGetBuyQuoteAction,
  TransakServiceGetKycRequirementAction,
  TransakServiceGetAdditionalRequirementsAction,
  TransakServiceCreateOrderAction,
  TransakServiceGetOrderAction,
  TransakServiceGetUserLimitsAction,
  TransakServiceRequestOttAction,
  TransakServiceGeneratePaymentWidgetUrlAction,
  TransakServiceCreateWidgetUrlAction,
  TransakServiceSubmitPurposeOfUsageFormAction,
  TransakServicePatchUserAction,
  TransakServiceSubmitSsnDetailsAction,
  TransakServiceConfirmPaymentAction,
  TransakServiceGetTranslationAction,
  TransakServiceGetIdProofStatusAction,
  TransakServiceCancelOrderAction,
  TransakServiceCancelAllActiveOrdersAction,
  TransakServiceGetActiveOrdersAction,
} from './TransakService-method-action-types.js';
import type {
  TransakAccessToken,
  TransakUserDetails,
  TransakBuyQuote,
  TransakKycRequirement,
  TransakAdditionalRequirementsResponse,
  TransakDepositOrder,
  TransakUserLimits,
  TransakOttResponse,
  TransakQuoteTranslation,
  TransakTranslationRequest,
  TransakIdProofStatus,
  TransakOrderPaymentMethod,
  PatchUserRequestBody,
  TransakOrder,
} from './TransakService.js';
import type { TransakServiceActions } from './TransakService.js';
import {
  createInitialState as createInitialWalletRegistrationState,
  transition as transitionWalletRegistration,
} from './wallet-registration-machine.js';
import {
  createIdempotencyKey,
  WalletRegistrationError,
} from './wallet-registration-service.js';
import type {
  RegistrationStatus,
  SelfHostedRegistration,
} from './wallet-registration-service.js';

// === GENERAL ===

/**
 * The name of the {@link RampsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'RampsController';

/**
 * RampsService action types that RampsController calls via the messenger.
 * Any host (e.g. mobile) that creates a RampsController messenger must delegate
 * these actions from the root messenger so the controller can function.
 */
export const RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS = [
  'RampsService:getDefaultRedirectCallbackUrl',
  'RampsService:getGeolocation',
  'RampsService:getCountries',
  'RampsService:getTokens',
  'RampsService:getProviders',
  'RampsService:getPaymentMethods',
  'RampsService:getQuotes',
  'RampsService:getBuyWidgetUrl',
  'RampsService:getOrder',
  'RampsService:getOrderFromCallback',
  'TransakService:setApiKey',
  'TransakService:setAccessToken',
  'TransakService:clearAccessToken',
  'TransakService:sendUserOtp',
  'TransakService:verifyUserOtp',
  'TransakService:logout',
  'TransakService:getUserDetails',
  'TransakService:getBuyQuote',
  'TransakService:getKycRequirement',
  'TransakService:getAdditionalRequirements',
  'TransakService:createOrder',
  'TransakService:getOrder',
  'TransakService:getUserLimits',
  'TransakService:requestOtt',
  'TransakService:generatePaymentWidgetUrl',
  'TransakService:createWidgetUrl',
  'TransakService:submitPurposeOfUsageForm',
  'TransakService:patchUser',
  'TransakService:submitSsnDetails',
  'TransakService:confirmPayment',
  'TransakService:getTranslation',
  'TransakService:getIdProofStatus',
  'TransakService:cancelOrder',
  'TransakService:cancelAllActiveOrders',
  'TransakService:getActiveOrders',
  'NeoBankService:getAutoramp',
  'NeoBankService:getAutorampTransactions',
  'NeoBankService:createAutoramp',
  'NeoBankService:getCustomerByExternalId',
  'NeoBankService:getWalletRegistrationStatus',
  'NeoBankService:registerSelfHostedWallet',
] as const satisfies readonly (
  | RampsServiceActions['type']
  | TransakServiceActions['type']
  | NeoBankServiceActions['type']
)[];

/**
 * Every external controller action RampsController calls via the messenger,
 * which hosts must delegate from the root messenger.
 * `AuthenticationController:getSessionProfile` resolves the vendor customer
 * identity from Profile Sync, and `KeyringController:signPersonalMessage` signs
 * the EIP-191 ownership proof for Money Account self-hosted wallet
 * registration; both are only exercised by the autoramp paths.
 */
export const RAMPS_CONTROLLER_REQUIRED_CONTROLLER_ACTIONS = [
  'AuthenticationController:getSessionProfile',
  'KeyringController:signPersonalMessage',
  'RemoteFeatureFlagController:getState',
] as const;

/**
 * Structural type for the keyring controller's `signPersonalMessage` messenger
 * action (EIP-191). Declared locally to avoid a package dependency for a single
 * type-only messenger action.
 */
export type KeyringControllerSignPersonalMessageAction = {
  type: 'KeyringController:signPersonalMessage';
  handler: (messageParams: { data: string; from: string }) => Promise<string>;
};

/**
 * Outcome of {@link RampsController.registerMoneyAccountWallet}.
 *
 * `lookupUnavailable` means the address list could not be fetched or parsed.
 * It is not the same as unregistered — callers must not treat it as a cue to
 * submit a new ownership proof.
 */
export type MoneyAccountWalletRegistrationResult =
  | {
      type: 'registered' | 'alreadyRegistered';
      registration: SelfHostedRegistration;
    }
  | {
      type: 'registeredDisabled';
      registration: SelfHostedRegistration;
    }
  | {
      type: 'lookupUnavailable';
      error: WalletRegistrationError;
    };

type LookupUnavailableResult = Extract<
  MoneyAccountWalletRegistrationResult,
  { type: 'lookupUnavailable' }
>;

/**
 * Distinguishes an already-materialized {@link AutorampAccount} from the
 * create-fields shape accepted by {@link RampsController.addAutoramp}.
 *
 * @param value - Full account or create fields.
 * @returns Whether the value already carries the derived account fields.
 */
function isFullAutorampAccount(
  value: AutorampAccount | { id: string; customerId: string },
): value is AutorampAccount {
  return (
    typeof (value as AutorampAccount).updatedAt === 'number' &&
    (value as AutorampAccount).lastSeenStatus !== undefined
  );
}

/**
 * Default TTL for quotes requests (15 seconds).
 * Quotes are time-sensitive and should have a shorter cache duration.
 */
const DEFAULT_QUOTES_TTL = 15000;

const CIRCUIT_BREAKER_OPEN_ERROR =
  'Execution prevented because the circuit breaker is open';

type ErrorWithMessage = {
  message: string;
};

type ErrorWithRampsErrorKey = Error & {
  errorKey?: RampsErrorCode;
};

type ErrorWithHttpStatus = Error & {
  httpStatus: number;
};

type RampsErrorInfo = {
  errorKey: RampsErrorCode | null;
  message: string;
};

type NormalizedRampsError = {
  errorInfo: RampsErrorInfo;
  normalizedError: unknown;
};

function hasStringMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

function hasHttpStatus(error: unknown): error is ErrorWithHttpStatus {
  return (
    error instanceof Error &&
    typeof (error as { httpStatus?: unknown }).httpStatus === 'number'
  );
}

function getRampsErrorInfo(error: unknown): RampsErrorInfo {
  if (error instanceof BrokenCircuitError && hasStringMessage(error)) {
    return {
      errorKey: RAMPS_ERROR_CODES.CIRCUIT_BREAKER_OPEN,
      message: error.message,
    };
  }

  let rawMessage: string | undefined;

  if (hasStringMessage(error)) {
    rawMessage = error.message;
  } else if (typeof error === 'string') {
    rawMessage = error;
  }

  if (rawMessage?.includes(CIRCUIT_BREAKER_OPEN_ERROR)) {
    return {
      errorKey: RAMPS_ERROR_CODES.CIRCUIT_BREAKER_OPEN,
      message: rawMessage,
    };
  }

  return {
    errorKey: null,
    message: rawMessage ?? 'Unknown error',
  };
}

function getNormalizedRampsError(error: unknown): NormalizedRampsError {
  const errorInfo = getRampsErrorInfo(error);

  return {
    errorInfo,
    normalizedError: normalizeRampsErrorForRethrow(error, errorInfo),
  };
}

function normalizeRampsErrorForRethrow(
  error: unknown,
  errorInfo: RampsErrorInfo,
): unknown {
  if (!errorInfo.errorKey) {
    return error;
  }

  if (error instanceof Error) {
    (error as ErrorWithRampsErrorKey).errorKey = errorInfo.errorKey;
    return error;
  }

  return Object.assign(new Error(errorInfo.message), {
    errorKey: errorInfo.errorKey,
  });
}

// === STATE ===

/**
 * Represents the user's selected region with full country and state objects.
 */
export type UserRegion = {
  /**
   * The country object for the selected region.
   */
  country: Country;
  /**
   * The state object if a state was selected, null if only country was selected.
   */
  state: State | null;
  /**
   * The region code string (e.g., "us-ut" or "fr") used for API calls.
   */
  regionCode: string;
};

/**
 * Generic type for resource state that bundles data with loading/error states.
 *
 * @template TData - The type of the resource data
 * @template TSelected - The type of the selected item (defaults to null for resources without selection)
 */
export type ResourceState<TData, TSelected = null> = {
  /**
   * The resource data.
   */
  data: TData;
  /**
   * The currently selected item, or null if none selected.
   */
  selected: TSelected;
  /**
   * Whether the resource is currently being fetched.
   */
  isLoading: boolean;
  /**
   * Error message if the fetch failed, or null.
   */
  error: string | null;
  /**
   * Stable error key for client-side localization, if available.
   */
  errorKey?: RampsErrorCode | null;
};

/**
 * Describes the transak-specific state managed by the RampsController.
 * This state is used by the unified V2 native flow.
 */
export type TransakState = {
  isAuthenticated: boolean;
  userDetails: ResourceState<TransakUserDetails | null>;
  buyQuote: ResourceState<TransakBuyQuote | null>;
  kycRequirement: ResourceState<TransakKycRequirement | null>;
};

/**
 * Describes the state for all native providers managed by the RampsController.
 * Each native provider has its own nested state object.
 */
export type NativeProvidersState = {
  transak: TransakState;
};

/**
 * Response from {@link RampsController.getPaymentMethodsForContext}.
 *
 * Methods are request-eligible for the resolved provider set; they are not a
 * guarantee that every amount will produce a quote (provider fiat limits still
 * apply at quote time).
 */
export type PaymentMethodsForContextResponse = {
  /**
   * Deduped payment methods contributed by the resolved provider set.
   */
  methods: PaymentMethod[];
  /**
   * Suggested selection for this request only. Written to controller state only
   * when `updateState` was true on the call.
   */
  selected: PaymentMethod | null;
  /**
   * Provider IDs whose methods were requested (after resolution / allowlist
   * filtering).
   */
  providerIds: string[];
};

/**
 * Describes the shape of the state object for {@link RampsController}.
 */
export type RampsControllerState = {
  /**
   * The user's region (full country and state objects).
   * Initially set via geolocation fetch, but can be manually changed by the user.
   */
  userRegion: UserRegion | null;
  /**
   * Countries resource state with data, loading, and error.
   * Data contains the list of countries available for ramp actions.
   */
  countries: ResourceState<Country[]>;
  /**
   * Providers resource state with data, selected, loading, and error.
   * Data contains the list of providers available for the current region.
   */
  providers: ResourceState<Provider[], Provider | null>;
  /**
   * Tokens resource state with data, selected, loading, and error.
   * Data contains topTokens and allTokens arrays.
   */
  tokens: ResourceState<TokensResponse | null, RampsToken | null>;
  /**
   * Payment methods resource state with data, selected, loading, and error.
   * Data contains payment methods filtered by region, fiat, asset, and provider.
   */
  paymentMethods: ResourceState<PaymentMethod[], PaymentMethod | null>;
  /**
   * Cache of request states, keyed by cache key.
   * This stores loading, success, and error states for API requests.
   */
  requests: RequestCacheType;
  /**
   * State for native providers in the unified V2 flow.
   * Each provider has its own nested state containing authentication,
   * user details, quote, and KYC data.
   */
  nativeProviders: NativeProvidersState;
  /**
   * The controller is the authority for V2 orders — it polls, updates,
   * and persists them.
   */
  orders: RampsOrder[];
  /**
   * Last-seen MoonPay autoramp accounts (standing routes). MoonPay is the
   * source of truth; this cache is used to detect status transitions for
   * notifications after refresh or push.
   */
  autoramps: AutorampAccount[];
  /**
   * Money Account deposit/payout transactions observed via polling, separate
   * from {@link AutorampAccount} standing routes. A thin local clone of the
   * partner transactions used to detect status changes and emit notifications;
   * persisted for cross-restart dedupe.
   */
  deposits: MoneyAccountDeposit[];
  /**
   * Whether the currently selected provider was auto-selected by the system
   * (no order history, no Transak) rather than chosen by the user or derived
   * from order history. When true, the UI should silently switch providers on
   * token conflict instead of showing the "Token Not Available" modal.
   */
  providerAutoSelected: boolean;
};

/**
 * The metadata for each property in {@link RampsControllerState}.
 */
const rampsControllerMetadata = {
  userRegion: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  countries: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  providers: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  tokens: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  paymentMethods: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  requests: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: false,
    usedInUi: true,
  },
  nativeProviders: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: false,
    usedInUi: true,
  },
  orders: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  autoramps: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  deposits: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  providerAutoSelected: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
} satisfies StateMetadata<RampsControllerState>;

/**
 * Creates a default resource state object.
 *
 * @template TData - The type of the resource data.
 * @template TSelected - The type of the selected item.
 * @param data - The initial data value.
 * @param selected - The initial selected value.
 * @returns A ResourceState object with default loading and error values.
 */
function createDefaultResourceState<TData, TSelected = null>(
  data: TData,
  selected: TSelected = null as TSelected,
): ResourceState<TData, TSelected> {
  return {
    data,
    selected,
    isLoading: false,
    error: null,
  };
}

/**
 * Constructs the default {@link RampsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link RampsController} state.
 */
export function getDefaultRampsControllerState(): RampsControllerState {
  return {
    userRegion: null,
    countries: createDefaultResourceState<Country[]>([]),
    providers: createDefaultResourceState<Provider[], Provider | null>(
      [],
      null,
    ),
    tokens: createDefaultResourceState<
      TokensResponse | null,
      RampsToken | null
    >(null, null),
    paymentMethods: createDefaultResourceState<
      PaymentMethod[],
      PaymentMethod | null
    >([], null),
    requests: {},
    nativeProviders: {
      transak: {
        isAuthenticated: false,
        userDetails: createDefaultResourceState<TransakUserDetails | null>(
          null,
        ),
        buyQuote: createDefaultResourceState<TransakBuyQuote | null>(null),
        kycRequirement:
          createDefaultResourceState<TransakKycRequirement | null>(null),
      },
    },
    orders: [],
    autoramps: [],
    deposits: [],
    providerAutoSelected: false,
  };
}

const DEPENDENT_RESOURCE_KEYS = [
  'providers',
  'tokens',
  'paymentMethods',
] as const;

type DependentResourceKey = (typeof DEPENDENT_RESOURCE_KEYS)[number];

const DEPENDENT_RESOURCE_KEYS_SET = new Set<string>(DEPENDENT_RESOURCE_KEYS);

function getResourceState<TResourceType extends ResourceType>(
  state: Draft<RampsControllerState>,
  resourceType: TResourceType,
): Draft<RampsControllerState[TResourceType]> {
  switch (resourceType) {
    case 'countries':
      return state.countries as Draft<RampsControllerState[TResourceType]>;
    case 'providers':
      return state.providers as Draft<RampsControllerState[TResourceType]>;
    case 'tokens':
      return state.tokens as Draft<RampsControllerState[TResourceType]>;
    case 'paymentMethods':
      return state.paymentMethods as Draft<RampsControllerState[TResourceType]>;
    /* istanbul ignore next -- ResourceType is a closed internal union. */
    default:
      throw new Error(`Unsupported resource type: ${resourceType as string}`);
  }
}

function resetResource(
  state: Draft<RampsControllerState>,
  resourceType: DependentResourceKey,
  defaultResource: RampsControllerState[DependentResourceKey],
): void {
  const resource = getResourceState(state, resourceType);
  resource.data = defaultResource.data;
  resource.selected = defaultResource.selected;
  resource.isLoading = defaultResource.isLoading;
  resource.error = defaultResource.error;
  resource.errorKey = defaultResource.errorKey ?? null;
}

/**
 * Resets region-dependent resources (userRegion, providers, tokens, paymentMethods).
 * Mutates state in place; use from within controller update() for atomic updates.
 *
 * @param state - The state object to mutate.
 * @param options - Options for the reset.
 * @param options.clearUserRegionData - When true, sets userRegion to null (e.g. for full cleanup).
 */
function resetDependentResources(
  state: Draft<RampsControllerState>,
  options?: { clearUserRegionData?: boolean },
): void {
  if (options?.clearUserRegionData) {
    state.userRegion = null;
  }
  const defaultState = getDefaultRampsControllerState();
  for (const key of DEPENDENT_RESOURCE_KEYS) {
    resetResource(state, key, defaultState[key]);
  }
  state.providerAutoSelected = false;
}

// === MESSENGER ===

/**
 * Retrieves the state of the {@link RampsController}.
 */
export type RampsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Actions that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerActions =
  | RampsControllerGetStateAction
  | RampsControllerMethodActions;

/**
 * Actions from other messengers that {@link RampsController} calls.
 */
type AllowedActions =
  | RemoteFeatureFlagControllerGetStateAction
  | RampsServiceGetDefaultRedirectCallbackUrlAction
  | RampsServiceGetGeolocationAction
  | RampsServiceGetCountriesAction
  | RampsServiceGetTokensAction
  | RampsServiceGetProvidersAction
  | RampsServiceGetPaymentMethodsAction
  | RampsServiceGetQuotesAction
  | RampsServiceGetBuyWidgetUrlAction
  | RampsServiceGetOrderAction
  | RampsServiceGetOrderFromCallbackAction
  | TransakServiceSetApiKeyAction
  | TransakServiceSetAccessTokenAction
  | TransakServiceClearAccessTokenAction
  | TransakServiceSendUserOtpAction
  | TransakServiceVerifyUserOtpAction
  | TransakServiceLogoutAction
  | TransakServiceGetUserDetailsAction
  | TransakServiceGetBuyQuoteAction
  | TransakServiceGetKycRequirementAction
  | TransakServiceGetAdditionalRequirementsAction
  | TransakServiceCreateOrderAction
  | TransakServiceGetOrderAction
  | TransakServiceGetUserLimitsAction
  | TransakServiceRequestOttAction
  | TransakServiceGeneratePaymentWidgetUrlAction
  | TransakServiceCreateWidgetUrlAction
  | TransakServiceSubmitPurposeOfUsageFormAction
  | TransakServicePatchUserAction
  | TransakServiceSubmitSsnDetailsAction
  | TransakServiceConfirmPaymentAction
  | TransakServiceGetTranslationAction
  | TransakServiceGetIdProofStatusAction
  | TransakServiceCancelOrderAction
  | TransakServiceCancelAllActiveOrdersAction
  | TransakServiceGetActiveOrdersAction
  | NeoBankServiceGetAutorampAction
  | NeoBankServiceGetAutorampTransactionsAction
  | NeoBankServiceCreateAutorampAction
  | NeoBankServiceGetCustomerByExternalIdAction
  | NeoBankServiceGetWalletRegistrationStatusAction
  | NeoBankServiceRegisterSelfHostedWalletAction
  | AuthenticationController.AuthenticationControllerGetSessionProfileAction
  | KeyringControllerSignPersonalMessageAction;

/**
 * Published when the state of {@link RampsController} changes.
 */
export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Published when a V2 order's status transitions.
 * Consumed by mobile's init layer for notifications and analytics.
 */
export type RampsControllerOrderStatusChangedEvent = {
  type: `${typeof controllerName}:orderStatusChanged`;
  payload: [{ order: RampsOrder; previousStatus: RampsOrderStatus }];
};

/**
 * Published when an autoramp's last-seen status changes after refresh or push.
 * Every transition is published so analytics can observe the full lifecycle;
 * `shouldNotify` distinguishes the subset the UI should surface to the user.
 */
export type RampsControllerAutorampStatusChangedEvent = {
  type: `${typeof controllerName}:autorampStatusChanged`;
  payload: [
    {
      autoramp: AutorampAccount;
      previousStatus: AutorampAccount['status'];
      shouldNotify: boolean;
    },
  ];
};

/**
 * Published when a Money Account deposit/payout transaction status transitions.
 * Consumed by mobile's init layer for notifications (toast / account refresh);
 * `shouldNotify` is true only for a notable transition not yet surfaced.
 */
export type RampsControllerDepositStatusChangedEvent = {
  type: `${typeof controllerName}:depositStatusChanged`;
  payload: [
    {
      deposit: MoneyAccountDeposit;
      previousStatus: MoneyAccountDeposit['status'];
      shouldNotify: boolean;
    },
  ];
};

/**
 * Events that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerEvents =
  | RampsControllerStateChangeEvent
  | RampsControllerOrderStatusChangedEvent
  | RampsControllerAutorampStatusChangedEvent
  | RampsControllerDepositStatusChangedEvent;

/**
 * Events from other messengers that {@link RampsController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link RampsController}.
 */
export type RampsControllerMessenger = Messenger<
  typeof controllerName,
  RampsControllerActions | AllowedActions,
  RampsControllerEvents | AllowedEvents
>;

/**
 * Configuration options for the RampsController.
 */
export type RampsControllerOptions = {
  /** The messenger suited for this controller. */
  messenger: RampsControllerMessenger;
  /** The desired state with which to initialize this controller. */
  state?: Partial<RampsControllerState>;
  /** Time to live for cached requests in milliseconds. Defaults to 15 minutes. */
  requestCacheTTL?: number;
  /** Maximum number of entries in the request cache. Defaults to 250. */
  requestCacheMaxSize?: number;
};

// === HELPER FUNCTIONS ===

/**
 * Finds a country and state from a region code string.
 *
 * @param regionCode - The region code (e.g., "us-ca" or "us").
 * @param countries - Array of countries to search.
 * @returns UserRegion object with country and state, or null if not found.
 */
function findRegionFromCode(
  regionCode: string,
  countries: Country[],
): UserRegion | null {
  const normalizedCode = regionCode.toLowerCase().trim();
  const parts = normalizedCode.split('-');
  const countryCode = parts[0];
  const stateCode = parts[1];

  const country = countries.find((countryItem) => {
    if (countryItem.isoCode?.toLowerCase() === countryCode) {
      return true;
    }
    if (countryItem.id) {
      const id = countryItem.id.toLowerCase();
      if (id.startsWith('/regions/')) {
        const extractedCode = id.replace('/regions/', '').split('/')[0];
        return extractedCode === countryCode;
      }
      return id === countryCode || id.endsWith(`/${countryCode}`);
    }
    return false;
  });

  if (!country) {
    return null;
  }

  let state: State | null = null;
  if (stateCode && country.states) {
    state =
      country.states.find((stateItem) => {
        if (stateItem.stateId?.toLowerCase() === stateCode) {
          return true;
        }
        if (stateItem.id) {
          const stateId = stateItem.id.toLowerCase();
          if (
            stateId.includes(`-${stateCode}`) ||
            stateId.endsWith(`/${stateCode}`)
          ) {
            return true;
          }
        }
        return false;
      }) ?? null;
  }

  return {
    country,
    state,
    regionCode: normalizedCode,
  };
}

/**
 * Returns the internal MetaMask order code used for state lookups and polling.
 * Prefers the code embedded in the canonical order `id` path over `providerOrderId`,
 * which may contain the provider's native order identifier.
 *
 * @param orderOrId - Order fields or a full order id / order code string.
 * @returns The internal order code.
 */
export function getInternalOrderCode(
  orderOrId: Pick<RampsOrder, 'id' | 'providerOrderId'> | string,
): string {
  if (typeof orderOrId === 'string') {
    return orderOrId.includes('/orders/')
      ? orderOrId.split('/orders/')[1]
      : orderOrId;
  }

  const { id, providerOrderId } = orderOrId;
  if (id?.includes('/orders/')) {
    return id.split('/orders/')[1];
  }

  return providerOrderId;
}

// === ORDER POLLING CONSTANTS ===

const DEFAULT_POLLING_INTERVAL_MS = 30_000;
const MAX_ERROR_COUNT = 5;

type OrderPollingMetadata = {
  lastTimeFetched: number;
  errorCount: number;
};

// === CONTROLLER DEFINITION ===

const MESSENGER_EXPOSED_METHODS = [
  'executeRequest',
  'abortRequest',
  'getRequestState',
  'setUserRegion',
  'setSelectedProvider',
  'setSelectedProviderForAsset',
  'init',
  'getCountries',
  'getTokens',
  'setSelectedToken',
  'getProviders',
  'getPaymentMethods',
  'getPaymentMethodsForContext',
  'setSelectedPaymentMethod',
  'getQuotes',
  'addOrder',
  'removeOrder',
  'addAutoramp',
  'createAutoramp',
  'removeAutoramp',
  'registerMoneyAccountWallet',
  'markAutorampAsNotified',
  'applyAutorampStatusFromPush',
  'refreshAutoramp',
  'refreshAutoramps',
  'startOrderPolling',
  'stopOrderPolling',
  'refreshDeposits',
  'markDepositAsNotified',
  'removeDeposit',
  'startDepositPolling',
  'stopDepositPolling',
  'getBuyWidgetData',
  'addPrecreatedOrder',
  'getOrder',
  'getOrderFromCallback',
  'transakSetApiKey',
  'transakSetAccessToken',
  'transakClearAccessToken',
  'transakSetAuthenticated',
  'transakResetState',
  'transakSendUserOtp',
  'transakVerifyUserOtp',
  'transakLogout',
  'transakGetUserDetails',
  'transakGetBuyQuote',
  'transakGetKycRequirement',
  'transakGetAdditionalRequirements',
  'transakCreateOrder',
  'transakGetOrder',
  'transakGetUserLimits',
  'transakRequestOtt',
  'transakGeneratePaymentWidgetUrl',
  'transakCreateWidgetUrl',
  'transakSubmitPurposeOfUsageForm',
  'transakPatchUser',
  'transakSubmitSsnDetails',
  'transakConfirmPayment',
  'transakGetTranslation',
  'transakGetIdProofStatus',
  'transakCancelOrder',
  'transakCancelAllActiveOrders',
  'transakGetActiveOrders',
] as const;

/**
 * Manages cryptocurrency on/off ramps functionality.
 */
/**
 * The state fields {@link contextStillMatches} reads, narrowed rather than
 * taking `RampsControllerState`. Callers pass Immer's deep `WritableDraft`, and
 * checking that against the full state type exceeds the type instantiation
 * depth limit on declaration emit (TS2589), even though `tsc --noEmit` accepts
 * it.
 */
type ContextGuardState = {
  userRegion: { regionCode?: string } | null;
  tokens: { selected: { assetId: string } | null };
  providers: { selected: { id: string } | null };
};

/**
 * Whether controller state still describes the context a payment-method
 * request was issued for, so a completed request may write the Buy catalog.
 *
 * Compared at commit time rather than against a snapshot, so an older request
 * that returns after the context moved on is dropped.
 *
 * @param state - Controller state at commit time.
 * @param context - The context the request was issued for.
 * @param context.region - Normalized region code.
 * @param context.assetId - Canonicalized CAIP-19 asset id.
 * @param context.providerId - Trimmed provider id, or an empty string.
 * @returns Whether the write may proceed.
 */
function contextStillMatches(
  state: ContextGuardState,
  context: { region: string; assetId: string; providerId: string },
): boolean {
  return (
    state.userRegion?.regionCode?.trim().toLowerCase() === context.region &&
    normalizeRampsAssetId(state.tokens.selected?.assetId ?? '') ===
      context.assetId &&
    (state.providers.selected?.id.trim() ?? '') === context.providerId
  );
}

export class RampsController extends BaseController<
  typeof controllerName,
  RampsControllerState,
  RampsControllerMessenger
> {
  /**
   * Default TTL for cached requests.
   */
  readonly #requestCacheTTL: number;

  /**
   * Maximum number of entries in the request cache.
   */
  readonly #requestCacheMaxSize: number;

  /**
   * Map of pending requests for deduplication.
   * Key is the cache key, value is the pending request with abort controller.
   */
  readonly #pendingRequests: Map<string, PendingRequest> = new Map();

  /**
   * Count of in-flight requests per resource type.
   * Used so isLoading is only cleared when the last request for that resource finishes.
   */
  readonly #pendingResourceCount: Map<ResourceType, number> = new Map();

  /**
   * Monotonic generation per resource type used to invalidate stale in-flight
   * requests after region/token/provider dependent-resource resets.
   */
  readonly #pendingResourceGeneration: Map<ResourceType, number> = new Map();

  readonly #orderPollingMeta: Map<string, OrderPollingMetadata> = new Map();

  #orderPollingTimer: ReturnType<typeof setInterval> | null = null;

  #isPolling = false;

  /** Deposit poll bookkeeping (last fetch time + error count), keyed by autoramp id. */
  readonly #depositPollingMeta: Map<string, OrderPollingMetadata> = new Map();

  #depositPollingTimer: ReturnType<typeof setInterval> | null = null;

  #isPollingDeposits = false;

  #initPromise: Promise<void> | null = null;

  /**
   * Clears the pending resource count map. Used only in tests to exercise the
   * defensive path when get() returns undefined in the finally block.
   *
   * @internal
   */
  clearPendingResourceCountForTest(): void {
    this.#pendingResourceCount.clear();
  }

  #clearPendingResourceCountForDependentResources(): void {
    for (const resourceType of DEPENDENT_RESOURCE_KEYS) {
      this.#pendingResourceCount.delete(resourceType);
      const generation = this.#pendingResourceGeneration.get(resourceType) ?? 0;
      this.#pendingResourceGeneration.set(resourceType, generation + 1);
    }
  }

  #abortDependentRequests(): void {
    for (const [cacheKey, pending] of this.#pendingRequests.entries()) {
      if (
        pending.resourceType &&
        DEPENDENT_RESOURCE_KEYS_SET.has(pending.resourceType)
      ) {
        pending.abortController.abort();
        this.#pendingRequests.delete(cacheKey);
        this.#removeRequestState(cacheKey);
      }
    }
  }

  /**
   * Constructs a new {@link RampsController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   * @param args.requestCacheTTL - Time to live for cached requests in milliseconds.
   * @param args.requestCacheMaxSize - Maximum number of entries in the request cache.
   */
  constructor({
    messenger,
    state = {},
    requestCacheTTL = DEFAULT_REQUEST_CACHE_TTL,
    requestCacheMaxSize = DEFAULT_REQUEST_CACHE_MAX_SIZE,
  }: RampsControllerOptions) {
    super({
      messenger,
      metadata: rampsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultRampsControllerState(),
        ...state,
        // Always reset requests cache on initialization (non-persisted)
        requests: {},
      },
    });

    this.#requestCacheTTL = requestCacheTTL;
    this.#requestCacheMaxSize = requestCacheMaxSize;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Resolves the Headless Buy all-providers feature flag: whether widening is
   * enabled, and the provider-id allowlist the widened pick is restricted to
   * (if the flag's object payload carries one).
   *
   * Reads `RemoteFeatureFlagController` state through the messenger on every
   * call, so a remote flag fetch or a local dev override takes effect at
   * runtime without reconstructing the controller. The single read keeps the
   * enabled bit and the allowlist consistent even if the flag changes while a
   * quote request is in flight. Key lookup, local-override merging, and value
   * coercion live in the shared `isHeadlessAllProvidersEnabled` /
   * `getHeadlessProviderAllowlist` helpers so UI consumers resolve the flag
   * identically. Fails closed: when `RemoteFeatureFlagController:getState` is
   * not wired up, quoting stays native-only.
   *
   * @returns The enabled bit and the optional provider-id allowlist.
   */
  #resolveAllProvidersFlag(): {
    enabled: boolean;
    allowlist?: string[];
  } {
    try {
      const remoteFeatureFlagState = this.messenger.call(
        'RemoteFeatureFlagController:getState',
      );
      return {
        enabled: isHeadlessAllProvidersEnabled(remoteFeatureFlagState),
        allowlist: getHeadlessProviderAllowlist(remoteFeatureFlagState),
      };
    } catch {
      return { enabled: false };
    }
  }

  /**
   * Executes a request with caching, deduplication, and at most one in-flight
   * request per resource type.
   *
   * 1. **Same cache key in flight** – If a request with this cache key is
   *    already pending, returns that promise (deduplication; no second request).
   *
   * 2. **Cache hit** – If valid, non-expired data exists in state.requests for
   *    this key and forceRefresh is not set, returns that data without fetching.
   *
   * 3. **New request** – Creates an AbortController and fires the fetcher.
   *    If options.resourceType is set, tags the pending request with that
   *    resource type (so #abortDependentRequests can cancel it on region
   *    change or cleanup) and ref-counts resource-level loading state.
   *    On success or error, updates request state and resource error;
   *    in finally, clears resource loading only if this request was not
   *    aborted.
   *
   * @param cacheKey - Unique identifier for this request (e.g. from createCacheKey).
   * @param fetcher - Async function that performs the fetch. Receives an AbortSignal
   *   that is aborted when this request is superseded by another for the same resource.
   * @param options - Optional forceRefresh, ttl, and resourceType for loading/error state.
   * @returns The result of the request (from cache, joined promise, or fetcher).
   */
  async executeRequest<TResult>(
    cacheKey: string,
    fetcher: (signal: AbortSignal) => Promise<TResult>,
    options?: ExecuteRequestOptions,
  ): Promise<TResult> {
    // Get TTL for verifying cache expiration
    const ttl = options?.ttl ?? this.#requestCacheTTL;

    // DEDUPLICATION:
    // Check if a request is already in flight for this cache key
    // If so, return the original promise for that request
    const pending = this.#pendingRequests.get(cacheKey);
    if (pending) {
      return pending.promise as Promise<TResult>;
    }

    // CACHE HIT:
    // If cache is not expired, return the cached data
    if (!options?.forceRefresh) {
      const cached = this.state.requests[cacheKey];
      if (cached && !isCacheExpired(cached, ttl)) {
        return cached.data as TResult;
      }
    }

    // Create a new abort controller for this request
    // Record the time the request was started
    const abortController = new AbortController();
    const lastFetchedAt = Date.now();
    const { resourceType } = options ?? {};
    const resourceGeneration = resourceType
      ? (this.#pendingResourceGeneration.get(resourceType) ?? 0)
      : undefined;

    // Update state to loading
    this.#updateRequestState(cacheKey, createLoadingState());

    // Set resource-level loading state (only on cache miss). Ref-count so concurrent
    // requests for the same resource type (different cache keys) keep isLoading true.
    if (resourceType) {
      const count = this.#pendingResourceCount.get(resourceType) ?? 0;
      this.#pendingResourceCount.set(resourceType, count + 1);
      if (count === 0) {
        this.#setResourceLoading(resourceType, true);
      }
    }

    // Create the fetch promise
    const promise = (async (): Promise<TResult> => {
      try {
        const data = await fetcher(abortController.signal);

        if (abortController.signal.aborted) {
          throw new Error('Request was aborted');
        }

        this.#updateRequestState(
          cacheKey,
          createSuccessState(data as Json, lastFetchedAt),
        );

        if (resourceType) {
          const isCurrent =
            !options?.isResultCurrent || options.isResultCurrent();
          if (isCurrent) {
            this.#setResourceError(resourceType, null);
          }
        }
        return data;
      } catch (error) {
        if (abortController.signal.aborted) {
          throw error;
        }

        const { errorInfo, normalizedError } = getNormalizedRampsError(error);
        this.#updateRequestState(
          cacheKey,
          createErrorState(
            errorInfo.message,
            lastFetchedAt,
            errorInfo.errorKey,
          ),
        );
        if (resourceType) {
          const isCurrent =
            !options?.isResultCurrent || options.isResultCurrent();
          if (isCurrent) {
            this.#setResourceError(resourceType, errorInfo);
          }
        }
        throw normalizedError;
      } finally {
        if (
          this.#pendingRequests.get(cacheKey)?.abortController ===
          abortController
        ) {
          this.#pendingRequests.delete(cacheKey);
        }

        // Clear resource-level loading state only when no requests for this resource remain
        if (resourceType && !abortController.signal.aborted) {
          const currentGeneration =
            this.#pendingResourceGeneration.get(resourceType) ?? 0;
          if (currentGeneration === resourceGeneration) {
            const count = this.#pendingResourceCount.get(resourceType) ?? 0;
            const next = Math.max(0, count - 1);
            if (next === 0) {
              this.#pendingResourceCount.delete(resourceType);
              this.#setResourceLoading(resourceType, false);
            } else {
              this.#pendingResourceCount.set(resourceType, next);
            }
          }
        }
      }
    })();

    this.#pendingRequests.set(cacheKey, {
      promise,
      abortController,
      resourceType,
    });

    return promise;
  }

  /**
   * Aborts a pending request if one exists.
   *
   * @param cacheKey - The cache key of the request to abort.
   * @returns True if a request was aborted.
   */
  abortRequest(cacheKey: string): boolean {
    const pending = this.#pendingRequests.get(cacheKey);
    if (pending) {
      pending.abortController.abort();
      this.#pendingRequests.delete(cacheKey);
      this.#removeRequestState(cacheKey);
      return true;
    }
    return false;
  }

  /**
   * Mutates state.requests inside update(); cast is centralized here.
   *
   * @param fn - Callback that mutates the requests record.
   */
  #mutateRequests(
    fn: (requests: Record<string, RequestState | undefined>) => void,
  ): void {
    this.update((state) => {
      const requests = state.requests as unknown as Record<
        string,
        RequestState | undefined
      >;
      fn(requests);
    });
  }

  #removeRequestState(cacheKey: string): void {
    this.#mutateRequests((requests) => {
      delete requests[cacheKey];
    });
  }

  #cleanupState(): void {
    this.#abortDependentRequests();
    this.#clearPendingResourceCountForDependentResources();
    this.update((state) =>
      resetDependentResources(state, { clearUserRegionData: true }),
    );
  }

  #requireRegion(): string {
    const regionCode = this.state.userRegion?.regionCode;
    if (!regionCode) {
      throw new Error(
        'Region is required. Cannot proceed without valid region information.',
      );
    }
    return regionCode;
  }

  #isRegionCurrent(normalizedRegion: string): boolean {
    const current = this.state.userRegion?.regionCode;
    return current === undefined || current === normalizedRegion;
  }

  #isTokenCurrent(normalizedAssetId: string): boolean {
    const current = this.state.tokens.selected?.assetId ?? '';
    return current === normalizedAssetId;
  }

  #isProviderCurrent(normalizedProviderId: string): boolean {
    const current = this.state.providers.selected?.id ?? '';
    return current === normalizedProviderId;
  }

  /**
   * Updates a single field (isLoading or error) on a resource state.
   * All resources share the same ResourceState structure, so we use
   * dynamic property access to avoid duplicating switch statements.
   *
   * @param resourceType - The type of resource.
   * @param field - The field to update ('isLoading' or 'error').
   * @param value - The value to set.
   */
  #updateResourceField(
    resourceType: ResourceType,
    field: 'isLoading' | 'error' | 'errorKey',
    value: boolean | string | RampsErrorCode | null,
  ): void {
    this.update((state) => {
      const resource = getResourceState(state, resourceType);
      (resource as Record<string, unknown>)[field] = value;
    });
  }

  /**
   * Sets the loading state for a resource type.
   *
   * @param resourceType - The type of resource.
   * @param loading - Whether the resource is loading.
   */
  #setResourceLoading(resourceType: ResourceType, loading: boolean): void {
    this.#updateResourceField(resourceType, 'isLoading', loading);
  }

  /**
   * Sets the error state for a resource type.
   *
   * @param resourceType - The type of resource.
   * @param errorInfo - The error info, or null to clear.
   */
  #setResourceError(
    resourceType: ResourceType,
    errorInfo: RampsErrorInfo | null,
  ): void {
    this.update((state) => {
      const resource = getResourceState(state, resourceType);
      resource.error = errorInfo?.message ?? null;
      resource.errorKey = errorInfo?.errorKey ?? null;
    });
  }

  /**
   * Gets the state of a specific cached request.
   *
   * @param cacheKey - The cache key to look up.
   * @returns The request state, or undefined if not cached.
   */
  getRequestState(cacheKey: string): RequestState | undefined {
    return this.state.requests[cacheKey];
  }

  /**
   * Updates the state for a specific request.
   *
   * @param cacheKey - The cache key.
   * @param requestState - The new state for the request.
   */
  #updateRequestState(cacheKey: string, requestState: RequestState): void {
    const maxSize = this.#requestCacheMaxSize;
    const ttl = this.#requestCacheTTL;
    this.#mutateRequests((requests) => {
      requests[cacheKey] = requestState;
      const keys = Object.keys(requests);
      for (const key of keys) {
        const entry = requests[key];
        if (
          entry?.status === RequestStatus.SUCCESS &&
          isCacheExpired(entry, ttl)
        ) {
          delete requests[key];
        }
      }
      const remainingKeys = Object.keys(requests);
      if (remainingKeys.length > maxSize) {
        const sortedKeys = remainingKeys.sort((a, b) => {
          const aTime = requests[a]?.timestamp ?? 0;
          const bTime = requests[b]?.timestamp ?? 0;
          return aTime - bTime;
        });
        const entriesToRemove = remainingKeys.length - maxSize;
        for (let i = 0; i < entriesToRemove; i++) {
          const keyToRemove = sortedKeys[i];
          if (keyToRemove) {
            delete requests[keyToRemove];
          }
        }
      }
    });
  }

  /**
   * Sets the user's region manually (without fetching geolocation).
   * This allows users to override the detected region.
   *
   * @param region - The region code to set (e.g., "US-CA").
   * @param options - Options for cache behavior.
   * @returns The user region object.
   */
  async setUserRegion(
    region: string,
    options?: ExecuteRequestOptions,
  ): Promise<UserRegion> {
    const normalizedRegion = region.toLowerCase().trim();

    try {
      const countriesData = this.state.countries.data;
      if (!countriesData || countriesData.length === 0) {
        this.#cleanupState();
        throw new Error(
          'No countries found. Cannot set user region without valid country information.',
        );
      }

      const userRegion = findRegionFromCode(normalizedRegion, countriesData);

      if (!userRegion) {
        this.#cleanupState();
        throw new Error(
          `Region "${normalizedRegion}" not found in countries data. Cannot set user region without valid country information.`,
        );
      }

      const regionChanged =
        Boolean(options?.forceRefresh) ||
        normalizedRegion !== this.state.userRegion?.regionCode;

      if (regionChanged) {
        // Note: we intentionally do NOT abort in-flight requests here.
        // Aborting causes data loss during rapid region switching (e.g.
        // user taps France → Finland → France quickly). Instead we let
        // old requests complete naturally; isResultCurrent guards in
        // getProviders/getPaymentMethods discard stale results.
        this.#clearPendingResourceCountForDependentResources();
      }
      this.update((state) => {
        if (regionChanged) {
          resetDependentResources(state);
        }
        state.userRegion = userRegion;
      });

      return userRegion;
    } catch (error) {
      this.#cleanupState();
      throw error;
    }
  }

  /**
   * Sets the user's selected provider.
   *
   * Accepts either a Provider object (stored directly) or a provider ID
   * string (looked up from state). The object form is preferred when the
   * caller already has the full data (e.g. from React Query cache).
   *
   * @param providerOrId - A Provider object, a provider ID string (e.g., "/providers/moonpay"), or null to clear.
   * @param options - Optional settings for the selection.
   * @param options.autoSelected - When true, marks the provider as system-guessed
   *   (soft selection). The UI will silently auto-switch on token conflict instead
   *   of showing the "Token Not Available" modal. Defaults to false.
   */
  setSelectedProvider(
    providerOrId: string | Provider | null,
    options?: { autoSelected?: boolean },
  ): void {
    if (providerOrId === null) {
      this.update((state) => {
        state.providers.selected = null;
        state.providerAutoSelected = false;
      });
      return;
    }

    this.#requireRegion();

    // If a full Provider object is passed, store it directly (avoids
    // depending on state.providers.data being populated).
    if (typeof providerOrId !== 'string') {
      this.update((state) => {
        state.providers.selected = providerOrId;
        state.providerAutoSelected = options?.autoSelected ?? false;
      });
      return;
    }

    // ID string: look up from state
    const providers = this.state.providers.data;
    const provider = providers?.find((prov) => prov.id === providerOrId);

    if (provider) {
      this.update((state) => {
        state.providers.selected = provider;
        state.providerAutoSelected = options?.autoSelected ?? false;
      });
    }
  }

  /**
   * Switches to the first provider in state that serves the given asset,
   * when the currently selected provider does not.
   *
   * This is the controller-level equivalent of UB2's BuildQuote tier-1
   * silent-switch effect and MMPay's `useEnsureCompatibleProvider` hook: it
   * keeps provider-asset compatibility logic in one place rather than
   * duplicating `providerServesAsset` + find-and-switch across multiple UI
   * layers.
   *
   * The compatibility check prefers the current provider's entry in
   * `providers.data` over the `providers.selected` copy, which can be stale
   * once a fresh providers list arrives.
   *
   * No-op when:
   * - `providers.data` is empty (providers not yet loaded)
   * - the currently selected provider already serves the asset
   * - no provider in the list serves the asset (no safe fallback)
   *
   * @param assetId - CAIP-19 asset id of the deposit asset.
   * @param options - Optional settings forwarded to `setSelectedProvider`.
   * @param options.autoSelected - When true, marks the new selection as
   *   system-guessed (soft selection). Defaults to true.
   * @returns `true` if the selected provider was changed, `false` otherwise.
   */
  setSelectedProviderForAsset(
    assetId: string,
    options?: { autoSelected?: boolean },
  ): boolean {
    const providers = this.state.providers.data;
    if (!providers?.length) {
      return false;
    }

    const selectedId = this.state.providers.selected?.id;
    const currentProvider =
      providers.find((provider) => provider.id === selectedId) ??
      this.state.providers.selected;
    if (currentProvider && providerServesAsset(currentProvider, assetId)) {
      return false;
    }

    const compatible = providers.find(
      (provider) =>
        provider.id !== selectedId && providerServesAsset(provider, assetId),
    );
    if (!compatible) {
      return false;
    }

    this.setSelectedProvider(compatible, {
      autoSelected: true,
      ...options,
    });
    return true;
  }

  /**
   * Initializes the controller by fetching the user's region from geolocation.
   * This should be called once at app startup to set up the initial region.
   *
   * Idempotent: subsequent calls return the same promise unless forceRefresh is set.
   * Force-refetches the countries catalog on startup (bypassing the in-session
   * request cache) so region preset amounts stay current. The catalog is not
   * persisted, so a cold start always re-fetches it regardless. Skips
   * geolocation when userRegion already exists.
   *
   * @param options - Options for cache behavior. forceRefresh bypasses idempotency and re-runs the full flow.
   * @returns Promise that resolves when initialization is complete.
   */
  async init(options?: ExecuteRequestOptions): Promise<void> {
    if (!options?.forceRefresh && this.#initPromise !== null) {
      return this.#initPromise;
    }

    if (options?.forceRefresh) {
      this.#initPromise = null;
    }

    const initPromise = this.#runInit(options).then(
      () => undefined,
      (error) => {
        if (this.#initPromise === initPromise) {
          this.#initPromise = null;
        }
        throw error;
      },
    );
    this.#initPromise = initPromise;
    return initPromise;
  }

  async #runInit(options?: ExecuteRequestOptions): Promise<void> {
    // Force-refetch the catalog on startup so region preset amounts stay
    // current, bypassing the in-session request cache. The catalog is not
    // persisted, so a cold start always re-fetches it regardless.
    await this.getCountries({ ...options, forceRefresh: true });

    // Always prefer the user's persisted region. Geolocation is only used to
    // seed the initial value; once the user (or a prior init) has set a region
    // we must respect that choice — even on forceRefresh.
    const persistedRegionCode = this.state.userRegion?.regionCode;
    const regionCode =
      persistedRegionCode ??
      (await this.messenger.call('RampsService:getGeolocation'));

    if (!regionCode) {
      throw new Error(
        'Failed to fetch geolocation. Cannot initialize controller without valid region information.',
      );
    }

    // For an already-persisted region, getCountries() has already re-synced it
    // from the fresh catalog (see #syncUserRegionFromCountriesCatalog). Calling
    // setUserRegion here would re-validate against that catalog and, if it is
    // momentarily empty or no longer lists the region (e.g. a transient/partial
    // catalog response or a region with no current provider coverage), throw and
    // wipe the persisted region via #cleanupState. Preserve the existing region
    // instead; only resolve a brand-new region (from geolocation) strictly.
    if (persistedRegionCode) {
      return;
    }

    await this.setUserRegion(regionCode, options);
  }

  /**
   * Re-applies `userRegion` from the current countries catalog so preset
   * amounts and support flags stay in sync after a catalog refresh.
   */
  #syncUserRegionFromCountriesCatalog(): void {
    const regionCode = this.state.userRegion?.regionCode;
    if (!regionCode) {
      return;
    }

    const countriesData = this.state.countries.data;
    if (!countriesData.length) {
      return;
    }

    const userRegion = findRegionFromCode(regionCode, countriesData);
    if (!userRegion) {
      return;
    }

    this.update((state) => {
      state.userRegion = userRegion;
    });
  }

  /**
   * Fetches the list of supported countries.
   * The API returns countries with support information for both buy and sell actions.
   * The countries are saved in the controller state once fetched.
   *
   * @param options - Options for cache behavior.
   * @returns An array of countries.
   */
  async getCountries(options?: ExecuteRequestOptions): Promise<Country[]> {
    const cacheKey = createCacheKey('getCountries', []);

    const countries = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getCountries');
      },
      { ...options, resourceType: 'countries' },
    );

    this.update((state) => {
      state.countries.data = Array.isArray(countries) ? [...countries] : [];
    });

    this.#syncUserRegionFromCountriesCatalog();

    return countries;
  }

  /**
   * Fetches the list of available tokens for a given region and action.
   * The tokens are saved in the controller state once fetched.
   *
   * @param region - The region code (e.g., "us", "fr", "us-ny"). If not provided, uses the user's region from controller state.
   * @param action - The ramp action type ('buy' or 'sell').
   * @param options - Options for cache behavior and query filters.
   * @param options.provider - Provider ID(s) to filter by.
   * @returns The tokens response containing topTokens and allTokens.
   */
  async getTokens(
    region?: string,
    action: RampAction = 'buy',
    options?: ExecuteRequestOptions & {
      provider?: string | string[];
    },
  ): Promise<TokensResponse> {
    const regionToUse = region ?? this.#requireRegion();

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getTokens', [
      normalizedRegion,
      action,
      options?.provider,
    ]);

    const tokens = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call(
          'RampsService:getTokens',
          normalizedRegion,
          action,
          {
            provider: options?.provider,
          },
        );
      },
      {
        ...options,
        resourceType: 'tokens',
        isResultCurrent: () => this.#isRegionCurrent(normalizedRegion),
      },
    );

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.tokens.data = tokens;
      }
    });

    return tokens;
  }

  /**
   * Sets the user's selected token by asset ID.
   * Looks up the token from the current tokens in state and automatically
   * fetches payment methods for that token.
   *
   * @param assetId - The asset identifier in CAIP-19 format (e.g., "eip155:1/erc20:0x..."), or undefined to clear.
   * @throws If region is not set, tokens are not loaded, or token is not found.
   */
  setSelectedToken(assetId?: string): void {
    if (!assetId) {
      this.update((state) => {
        state.tokens.selected = null;
      });
      return;
    }

    this.#requireRegion();
    const tokens = this.state.tokens.data;
    if (!tokens) {
      throw new Error(
        'Tokens not loaded. Cannot set selected token before tokens are fetched.',
      );
    }

    const token =
      tokens.allTokens.find((tok) => tok.assetId === assetId) ??
      tokens.topTokens.find((tok) => tok.assetId === assetId);

    if (!token) {
      throw new Error(
        `Token with asset ID "${assetId}" not found in available tokens.`,
      );
    }

    this.update((state) => {
      state.tokens.selected = token;
    });
  }

  /**
   * Fetches the list of providers for a given region.
   * The providers are saved in the controller state once fetched.
   *
   * @param region - The region code (e.g., "us", "fr", "us-ny"). If not provided, uses the user's region from controller state.
   * @param options - Options for cache behavior and query filters.
   * @param options.provider - Provider ID(s) to filter by.
   * @param options.crypto - Crypto currency ID(s) to filter by.
   * @param options.payments - Payment method ID(s) to filter by.
   * @returns The providers response containing providers array.
   */
  async getProviders(
    region?: string,
    options?: ExecuteRequestOptions & {
      provider?: string | string[];
      crypto?: string | string[];
      payments?: string | string[];
    },
  ): Promise<ProvidersResponse> {
    const regionToUse = region ?? this.#requireRegion();

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const cacheKey = createCacheKey('getProviders', [
      normalizedRegion,
      options?.provider,
      options?.crypto,
      options?.payments,
    ]);

    const response = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call(
          'RampsService:getProviders',
          normalizedRegion,
          {
            provider: options?.provider,
            crypto: options?.crypto,
            payments: options?.payments,
          },
        );
      },
      {
        ...options,
        resourceType: 'providers',
        isResultCurrent: () => this.#isRegionCurrent(normalizedRegion),
      },
    );
    const { providers } = response;

    this.update((state) => {
      const userRegionCode = state.userRegion?.regionCode;

      if (userRegionCode === undefined || userRegionCode === normalizedRegion) {
        state.providers.data = providers;
      }
    });

    return response;
  }

  /**
   * Fetches the list of payment methods for a given context.
   * The payment methods are saved in the controller state once fetched.
   *
   * @param region - User's region code (e.g. "fr", "us-ny").
   * @param options - Query parameters for filtering payment methods.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.provider - Provider ID path.
   * @returns The payment methods response containing payments array.
   */
  async getPaymentMethods(
    region?: string,
    options?: ExecuteRequestOptions & {
      assetId?: string;
      provider?: string;
    },
  ): Promise<PaymentMethodsResponse> {
    const regionCode = region ?? this.#requireRegion();
    const assetIdToUse =
      options?.assetId ?? this.state.tokens.selected?.assetId ?? '';
    const providerToUse =
      options?.provider ?? this.state.providers.selected?.id ?? '';

    const normalizedRegion = regionCode.toLowerCase().trim();
    const cacheKey = createCacheKey('getPaymentMethods', [
      normalizedRegion,
      assetIdToUse,
      providerToUse,
    ]);

    const response = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getPaymentMethods', {
          region: normalizedRegion,
          assetId: assetIdToUse,
          provider: providerToUse,
        });
      },
      {
        ...options,
        resourceType: 'paymentMethods',
        isResultCurrent: () => {
          const regionMatch = this.#isRegionCurrent(normalizedRegion);
          const tokenMatch = this.#isTokenCurrent(assetIdToUse);
          const providerMatch = this.#isProviderCurrent(providerToUse);
          return regionMatch && tokenMatch && providerMatch;
        },
      },
    );

    this.update((state) => {
      const currentAssetId = state.tokens.selected?.assetId ?? '';
      const currentProviderId = state.providers.selected?.id ?? '';

      const tokenSelectionUnchanged = assetIdToUse === currentAssetId;
      const providerSelectionUnchanged = providerToUse === currentProviderId;

      // this is a race condition check to ensure that the selected token and provider in state are the same as the tokens we're requesting for
      // ex: if the user rapidly changes the token or provider, the in-flight payment methods might not be valid
      // so this check will ensure that the payment methods are still valid for the token and provider that were requested
      if (tokenSelectionUnchanged && providerSelectionUnchanged) {
        state.paymentMethods.data = response.payments;

        // this will auto-select the first payment method if the selected payment method is not in the new payment methods
        const currentSelectionStillValid = response.payments.some(
          (pm: PaymentMethod) => pm.id === state.paymentMethods.selected?.id,
        );
        if (!currentSelectionStillValid) {
          state.paymentMethods.selected = response.payments[0] ?? null;
        }
      }
    });

    return response;
  }

  /**
   * Fetches payment methods for a quoting context without coupling callers to
   * the Buy flow's globally selected provider/token catalog.
   *
   * Provider contribution mirrors {@link getQuotes}:
   * - explicit `providers` (optionally filtered when
   *   `restrictToKnownOrNativeProviders` is set)
   * - auto-select / restrict path, including `moneyHeadlessAllProviders`
   *   widening: flag off uses the restricted/native resolver; flag on uses
   *   supporting providers, intersected with the flag allowlist when that
   *   allowlist is non-empty (pick-survivor set for picker methods)
   * - when those resolution flags and `providers` are omitted, uses only
   *   `providers.selected` (UB2 selected-provider context)
   *
   * By default this is request-only: it does **not** mutate
   * `paymentMethods.data` or `paymentMethods.selected`. Pass `updateState:
   * true` only when the caller explicitly wants Buy-catalog write semantics
   * (UB2). Headless / MM Pay selection stays TPC-owned. `updateState: true`
   * throws when the resolved provider set holds more than one provider, because
   * the write guards cannot tell two such requests apart.
   *
   * Methods are request-eligible for the resolved provider set; they are not
   * guaranteed to produce a quote for every amount (provider fiat limits still
   * apply at quote time).
   *
   * @param options - Context for the payment-method fetch.
   * @param options.region - Region code. Defaults to `userRegion`.
   * @param options.assetId - Required CAIP-19 quoting asset.
   * @param options.providers - Explicit provider ids.
   * @param options.autoSelectProvider - Resolve providers like `getQuotes`.
   * @param options.preferredProviderIds - Preferred ids for auto-selection.
   * @param options.restrictToKnownOrNativeProviders - Headless gating.
   * @param options.updateState - When true, write `paymentMethods` state.
   * @param options.preferPaymentMethodId - Preserve this id when still present.
   * @param options.forceRefresh - Bypass request cache for provider fetches.
   * @param options.ttl - Custom TTL for provider payment-method fetches.
   * @returns Deduped methods, a request-only suggested selection, and the
   *   provider ids that contributed.
   */
  async getPaymentMethodsForContext(options: {
    region?: string;
    assetId: string;
    providers?: string[];
    autoSelectProvider?: boolean;
    preferredProviderIds?: string[];
    restrictToKnownOrNativeProviders?: boolean;
    updateState?: boolean;
    preferPaymentMethodId?: string;
    forceRefresh?: boolean;
    ttl?: number;
  }): Promise<PaymentMethodsForContextResponse> {
    const regionToUse = options.region ?? this.#requireRegion();
    const normalizedRegion = regionToUse.toLowerCase().trim();
    const assetId = options.assetId.trim();
    if (assetId === '') {
      throw new Error('assetId is required.');
    }
    const normalizedAssetContext = normalizeRampsAssetId(assetId);
    const updateState = options.updateState === true;
    const providerIdForState =
      options.providers?.length === 1
        ? options.providers[0].trim()
        : (this.state.providers.selected?.id.trim() ?? '');

    const providerIds = await this.#resolveProviderIdsForPaymentMethods({
      assetId,
      region: normalizedRegion,
      providers: options.providers,
      autoSelectProvider: options.autoSelectProvider,
      preferredProviderIds: options.preferredProviderIds,
      restrictToKnownOrNativeProviders:
        options.restrictToKnownOrNativeProviders,
    });

    // A fan-out across several providers produces a merged catalog whose value
    // depends on the provider set, but the write guards below only compare
    // region, selected token, and selected provider. Two concurrent
    // multi-provider requests share all three, so nothing distinguishes them
    // and the slower one would silently overwrite the faster one.
    if (updateState && providerIds.length > 1) {
      throw new Error(
        `getPaymentMethodsForContext cannot write paymentMethods state for ${providerIds.length} resolved providers. Use updateState: false, or request exactly one provider.`,
      );
    }

    const writeContext = {
      region: normalizedRegion,
      assetId: normalizedAssetContext,
      providerId: providerIdForState,
    };

    if (providerIds.length === 0) {
      if (updateState) {
        this.update((state) => {
          if (contextStillMatches(state, writeContext)) {
            state.paymentMethods.data = [];
            state.paymentMethods.selected = null;
          }
        });
      }
      return { methods: [], selected: null, providerIds };
    }

    const settled = await Promise.allSettled(
      providerIds.map(async (providerId) => {
        const cacheKey = createCacheKey('getPaymentMethodsForContext', [
          normalizedRegion,
          assetId,
          providerId,
        ]);
        return this.executeRequest(
          cacheKey,
          async () => {
            return this.messenger.call('RampsService:getPaymentMethods', {
              region: normalizedRegion,
              assetId,
              provider: providerId,
            });
          },
          {
            forceRefresh: options.forceRefresh,
            ttl: options.ttl,
            // Intentionally omit resourceType / isResultCurrent so this
            // request-only path never drives Buy paymentMethods loading or
            // selection state unless `updateState` is explicitly set below.
          },
        );
      }),
    );

    const successfulLists: PaymentMethod[][] = [];
    const failures: unknown[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        successfulLists.push(result.value.payments);
      } else {
        failures.push(result.reason);
      }
    }

    if (successfulLists.length === 0) {
      const firstFailure = failures[0];
      throw firstFailure instanceof Error
        ? firstFailure
        : new Error('Failed to fetch payment methods for context.');
    }

    const methods = mergePaymentMethodsById(successfulLists);
    let selected = pickPaymentMethod(methods, [
      options.preferPaymentMethodId,
      this.state.paymentMethods.selected?.id,
    ]);

    if (updateState) {
      this.update((state) => {
        if (contextStillMatches(state, writeContext)) {
          // The stored selection outranks the caller's preference: the user may
          // have picked a method while this request was in flight.
          selected = pickPaymentMethod(methods, [
            state.paymentMethods.selected?.id,
            options.preferPaymentMethodId,
          ]);
          state.paymentMethods.data = methods;
          state.paymentMethods.selected = selected;
        }
      });
    }

    return { methods, selected, providerIds };
  }

  /**
   * Sets the user's selected payment method.
   *
   * Accepts either a payment method ID (looked up from state) or a full
   * PaymentMethod object (stored directly). The object form is preferred
   * when the caller already has the full data (e.g. from React Query cache),
   * as it avoids depending on controller state being populated.
   *
   * @param paymentMethodOrId - A PaymentMethod object, a payment method ID string, or undefined/null to clear.
   */
  setSelectedPaymentMethod(
    paymentMethodOrId?: string | PaymentMethod | null,
  ): void {
    if (!paymentMethodOrId) {
      this.update((state) => {
        state.paymentMethods.selected = null;
      });
      return;
    }

    // If a full object is passed, store it directly
    if (typeof paymentMethodOrId !== 'string') {
      this.update((state) => {
        state.paymentMethods.selected = paymentMethodOrId;
      });
      return;
    }

    // ID string: look up from state
    const paymentMethodId = paymentMethodOrId;
    const paymentMethods = this.state.paymentMethods.data;
    const paymentMethod = paymentMethods?.find(
      (pm) => pm.id === paymentMethodId,
    );

    this.update((state) => {
      state.paymentMethods.selected = paymentMethod ?? null;
    });
  }

  /**
   * Fetches quotes from all providers for a given set of parameters.
   * Uses the controller's request cache; callers manage the response in local state.
   *
   * @param options - The parameters for fetching quotes.
   * @param options.region - User's region code. If not provided, uses userRegion from state.
   * @param options.fiat - Fiat currency code. If not provided, uses userRegion currency.
   * @param options.assetId - CAIP-19 cryptocurrency identifier.
   * @param options.amount - The amount (in fiat for buy, crypto for sell).
   * @param options.walletAddress - The destination wallet address.
   * @param options.paymentMethods - Array of payment method IDs. If not provided, uses paymentMethods from state.
   * @param options.providers - Optional provider IDs to filter quotes.
   * @param options.autoSelectProvider - When true and `providers` is omitted,
   *   resolves a provider that supports `assetId` for this request only (no
   *   state mutation). Ignored when `providers` is passed.
   * @param options.preferredProviderIds - Optional provider IDs to prefer
   *   during auto-selection, in priority order (e.g. derived by the caller
   *   from completed-order history). Only used when `autoSelectProvider` is
   *   true and `providers` is omitted.
   * @param options.restrictToKnownOrNativeProviders - Headless-buy v0 gating. When
   *   true, auto-selection resolves only a native provider, and an explicitly
   *   passed `providers` list is filtered to those supporting the region and
   *   asset. If nothing qualifies, `getQuotes` returns an empty response
   *   instead of quoting other providers.
   * @param options.redirectUrl - Optional redirect URL after order completion.
   * @param options.action - The ramp action type. Defaults to 'buy'.
   * @param options.forceRefresh - Whether to bypass cache.
   * @param options.ttl - Custom TTL for this request.
   * @returns The quotes response containing success, sorted, error, and customActions.
   */
  async getQuotes(options: {
    region?: string;
    fiat?: string;
    assetId?: string;
    amount: number;
    walletAddress: string;
    paymentMethods?: string[];
    providers?: string[];
    autoSelectProvider?: boolean;
    preferredProviderIds?: string[];
    restrictToKnownOrNativeProviders?: boolean;
    redirectUrl?: string;
    action?: RampAction;
    forceRefresh?: boolean;
    ttl?: number;
  }): Promise<QuotesResponse> {
    const regionToUse = options.region ?? this.#requireRegion();
    const fiatToUse = options.fiat ?? this.state.userRegion?.country?.currency;
    const paymentMethodsToUse =
      options.paymentMethods ??
      this.state.paymentMethods.data.map((pm: PaymentMethod) => pm.id);
    const action = options.action ?? 'buy';
    const assetIdToUse = options.assetId ?? this.state.tokens.selected?.assetId;

    if (!fiatToUse) {
      throw new Error(
        'Fiat currency is required. Either provide a fiat parameter or ensure userRegion is set in controller state.',
      );
    }

    const normalizedAssetIdForValidation = (assetIdToUse ?? '').trim();
    if (normalizedAssetIdForValidation === '') {
      throw new Error('assetId is required.');
    }

    // When the all-providers feature flag is enabled, widen the native-only
    // auto-selection path to every supporting provider and pick the best
    // quote from the results. Only the auto-select/restrict path that MM Pay's
    // `getRampsQuote` uses is affected; explicit-`providers` callers and the
    // plain all-provider path are untouched (and never read the flag).
    const wantsAutoSelection =
      !options.providers &&
      (options.autoSelectProvider === true ||
        options.restrictToKnownOrNativeProviders === true);
    // Single flag read per call: the enabled bit and the allowlist come from
    // the same `RemoteFeatureFlagController` state snapshot, so a flag edit
    // during the awaited quote fetch cannot produce a mixed read.
    const { enabled: allProvidersEnabled, allowlist: providerAllowlist } =
      wantsAutoSelection
        ? this.#resolveAllProvidersFlag()
        : { enabled: false, allowlist: undefined };
    const widenToAllProviders = wantsAutoSelection && allProvidersEnabled;

    let providersToUse: string[];
    let widenedProviderCatalog: Provider[] = this.state.providers.data;
    if (options.providers) {
      providersToUse = options.restrictToKnownOrNativeProviders
        ? await this.#filterProviderIdsBySupport({
            providerIds: options.providers,
            assetId: normalizedAssetIdForValidation,
            region: regionToUse,
          })
        : options.providers;
    } else if (widenToAllProviders) {
      // `#getSupportingProvidersForRegion` also hydrates the provider catalog
      // when controller state is empty, so all-provider quoting cannot silently
      // return zero providers here.
      const { supporting } = await this.#getSupportingProvidersForRegion({
        assetId: normalizedAssetIdForValidation,
        region: regionToUse,
      });
      widenedProviderCatalog = supporting;
      providersToUse = supporting.map((provider) => provider.id);
    } else if (
      options.autoSelectProvider ||
      options.restrictToKnownOrNativeProviders
    ) {
      // The restriction flag implies resolution: it must narrow the provider
      // set even when `autoSelectProvider` was not explicitly passed, otherwise
      // it would be silently ignored and every provider quoted.
      providersToUse = await this.#resolveProviderIdsForQuote({
        assetId: normalizedAssetIdForValidation,
        region: regionToUse,
        preferredProviderIds: options.preferredProviderIds,
        restrictToKnownOrNative: options.restrictToKnownOrNativeProviders,
      });
    } else {
      providersToUse = this.state.providers.data.map(
        (provider: Provider) => provider.id,
      );
    }

    if (
      !paymentMethodsToUse ||
      paymentMethodsToUse.length === 0 ||
      paymentMethodsToUse.some((pm) => pm.trim() === '')
    ) {
      throw new Error(
        'Payment methods are required. Either provide paymentMethods parameter or ensure paymentMethods are set in controller state.',
      );
    }

    if (options.amount <= 0 || !Number.isFinite(options.amount)) {
      throw new Error('Amount must be a positive finite number.');
    }

    if (!options.walletAddress || options.walletAddress.trim() === '') {
      throw new Error('walletAddress is required.');
    }

    // Under headless-buy gating, an empty resolved provider list means no
    // eligible (native/supporting) provider exists. Return an empty response
    // rather than passing `[]` to the service, which omits the provider filter
    // and would quote every provider. This also guards the widened path:
    // a caller may trigger widening with `autoSelectProvider` alone (no
    // `restrictToKnownOrNativeProviders`), and an empty supporting set must not
    // fall through to unfiltered quotes from providers that do not support the
    // asset.
    if (
      (options.restrictToKnownOrNativeProviders || widenToAllProviders) &&
      providersToUse.length === 0
    ) {
      return { success: [], sorted: [], error: [], customActions: [] };
    }

    const normalizedRegion = regionToUse.toLowerCase().trim();
    const normalizedFiat = fiatToUse.toLowerCase().trim();
    const normalizedAssetId = normalizedAssetIdForValidation;
    const normalizedWalletAddress = options.walletAddress.trim();

    // The quotes API only embeds a `buyURL`/`buyWidget` when a `redirectUrl` is
    // present, so on the widened path (where MM Pay omits one) ask the service
    // for the callback URL of the environment it is configured with, so
    // aggregator quotes carry a usable widget URL that always matches the
    // environment the quotes came from. An explicit caller `redirectUrl`
    // always wins, and the native-only path (flag off) never injects, so
    // neither reaches the service.
    const effectiveRedirectUrl =
      options.redirectUrl ??
      (widenToAllProviders
        ? this.messenger.call('RampsService:getDefaultRedirectCallbackUrl')
        : undefined);

    const cacheKey = createCacheKey('getQuotes', [
      normalizedRegion,
      normalizedFiat,
      normalizedAssetId,
      options.amount,
      normalizedWalletAddress,
      [...paymentMethodsToUse].sort().join(','),
      [...providersToUse].sort().join(','),
      effectiveRedirectUrl,
      action,
    ]);

    const params = {
      region: normalizedRegion,
      fiat: normalizedFiat,
      assetId: normalizedAssetId,
      amount: options.amount,
      walletAddress: normalizedWalletAddress,
      paymentMethods: paymentMethodsToUse,
      providers: providersToUse,
      redirectUrl: effectiveRedirectUrl,
      action,
    };

    const response = await this.executeRequest(
      cacheKey,
      async () => {
        return this.messenger.call('RampsService:getQuotes', params);
      },
      {
        forceRefresh: options.forceRefresh,
        ttl: options.ttl ?? DEFAULT_QUOTES_TTL,
      },
    );

    if (!widenToAllProviders) {
      return response;
    }

    // Reduce the widened multi-provider result to the single best quote
    // and place it at `success[0]`, since single-pick consumers
    // (`getRampsQuote` -> `success?.[0]`) rely on index 0 while `success[]`
    // order is server-defined rather than ranked.
    const selectedQuote = this.#pickWidenedQuote(response, {
      amount: options.amount,
      fiat: normalizedFiat,
      providers: widenedProviderCatalog,
      allowlist: providerAllowlist,
    });

    if (!selectedQuote) {
      // No quote fits the published provider limits: surface "no quote"
      // rather than handing the single-pick consumer an out-of-limits quote.
      return {
        success: [],
        sorted: response.sorted,
        error: response.error,
        customActions: response.customActions,
      };
    }

    return {
      ...response,
      success: [
        selectedQuote,
        ...response.success.filter((quote) => quote !== selectedQuote),
      ],
    };
  }

  /**
   * Selects the best quote from a widened multi-provider response.
   *
   * Every provider class is eligible (native, in-app WebView aggregator, and
   * external-browser / custom-action). When the feature flag payload carries a
   * provider allowlist, candidates from unlisted providers are dropped first.
   * Enforces per-provider fiat limits up front, then orders by reliability and
   * falls back to price using the server-provided `sorted` order. Returns
   * `undefined` when no quote survives.
   *
   * @param response - The multi-provider quotes response.
   * @param options - Selection inputs.
   * @param options.amount - Fiat amount, for the limit-fit check.
   * @param options.fiat - Lowercased fiat short code, for the limit lookup.
   * @param options.providers - Provider catalog for the limit lookup.
   * @param options.allowlist - Optional provider ids (either `/providers/x`
   * or bare form) the pick is restricted to.
   * @returns The selected quote, or `undefined` when none is usable.
   */
  #pickWidenedQuote(
    response: QuotesResponse,
    {
      amount,
      fiat,
      providers,
      allowlist,
    }: {
      amount: number;
      fiat: string;
      providers: Provider[];
      allowlist?: string[];
    },
  ): Quote | undefined {
    const providerByCode = new Map(
      providers.map((provider) => [provider.id, provider]),
    );

    const allowedProviderIds =
      allowlist && allowlist.length > 0
        ? new Set(allowlist.map(normalizeHeadlessProviderId))
        : undefined;
    const isAllowedProvider = (quote: Quote): boolean =>
      !allowedProviderIds ||
      allowedProviderIds.has(normalizeHeadlessProviderId(quote.provider));

    const fitsProviderLimits = (quote: Quote): boolean => {
      const provider = providerByCode.get(quote.provider);
      const limit = provider?.limits?.fiat?.[fiat]?.[quote.quote.paymentMethod];
      if (!limit) {
        // No published limits for this provider/payment method: treat as
        // eligible and let the provider enforce limits at checkout.
        return true;
      }
      return amount >= limit.minAmount && amount <= limit.maxAmount;
    };

    const candidates = response.success.filter(
      (quote) => isAllowedProvider(quote) && fitsProviderLimits(quote),
    );
    if (candidates.length === 0) {
      return undefined;
    }

    const candidateByCode = new Map(
      candidates.map((quote) => [quote.provider, quote]),
    );

    const pickBySortOrder = (sortBy: QuoteSortBy): Quote | undefined => {
      const order = response.sorted.find(
        (entry) => entry.sortBy === sortBy,
      )?.ids;
      if (!order) {
        return undefined;
      }
      for (const providerId of order) {
        const match = candidateByCode.get(providerId);
        if (match) {
          return match;
        }
      }
      return undefined;
    };

    // Reliability first, then price, then the first surviving candidate.
    return (
      pickBySortOrder('reliability') ??
      pickBySortOrder('price') ??
      candidates[0]
    );
  }

  /**
   * Returns the region's providers that support the given asset, plus the full
   * region provider list. Uses cached providers only when the request targets
   * the current region; otherwise fetches for the requested region, since
   * `getProviders` does not persist results for a non-current region. Does not
   * mutate state.
   *
   * @param options - The options.
   * @param options.assetId - CAIP-19 asset type identifier to resolve for.
   * @param options.region - Region to resolve providers for.
   * @returns The supporting providers and the full region provider list.
   */
  async #getSupportingProvidersForRegion({
    assetId,
    region,
  }: {
    assetId: string;
    region: string;
  }): Promise<{ supporting: Provider[]; all: Provider[] }> {
    const normalizedRegion = region.toLowerCase().trim();

    let providers: Provider[];
    if (
      this.#isRegionCurrent(normalizedRegion) &&
      this.state.providers.data.length > 0
    ) {
      providers = this.state.providers.data;
    } else {
      ({ providers } = await this.getProviders(normalizedRegion));
    }

    // Case-insensitive CAIP-19 matching is shared with headless-buy consumers
    // via `getProvidersServingAsset`, so the controller and the UI region gate
    // cannot disagree about which providers serve the asset.
    const supporting = getProvidersServingAsset(providers, assetId);

    return { supporting, all: providers };
  }

  /**
   * Filters an explicitly-requested provider ID list down to those that support
   * the asset in the region. Used for headless-buy gating so an explicitly
   * passed provider that cannot serve the region/asset yields no providers
   * rather than being trusted blindly.
   *
   * @param options - The options.
   * @param options.providerIds - Explicitly requested provider IDs.
   * @param options.assetId - CAIP-19 asset type identifier to resolve for.
   * @param options.region - Region to resolve providers for.
   * @returns The subset of `providerIds` supporting the asset in the region.
   */
  async #filterProviderIdsBySupport({
    providerIds,
    assetId,
    region,
  }: {
    providerIds: string[];
    assetId: string;
    region: string;
  }): Promise<string[]> {
    const { supporting } = await this.#getSupportingProvidersForRegion({
      assetId,
      region,
    });
    const supportingIds = new Set(supporting.map((provider) => provider.id));
    return providerIds.filter((id) => supportingIds.has(id));
  }

  /**
   * Resolves the provider IDs to use for a single quote request, scoped to the
   * given asset and region. Does not mutate `providers.selected` or any other
   * state.
   *
   * Resolves against the region's supporting providers using this precedence:
   * 1. The currently selected provider, if it is in the supporting set.
   * 2. The first preferred provider that supports the asset, where the
   *    preference is taken from `preferredProviderIds` when supplied, otherwise
   *    derived from the user's completed-order history (most recent first).
   *    This takes priority over Transak Native to preserve an existing KYC
   *    relationship.
   * 3. A native provider (e.g. Transak Native).
   * 4. The first supporting provider — unless `restrictToKnownOrNative` is set, in
   *    which case no further provider is introduced and nothing is returned.
   *
   * When `restrictToKnownOrNative` is unset and no provider supports the asset, falls
   * back to all known provider IDs so the request behaves as if no
   * auto-selection occurred.
   *
   * @param options - The options.
   * @param options.assetId - CAIP-19 asset type identifier to resolve for.
   * @param options.region - Region to resolve providers for.
   * @param options.preferredProviderIds - Provider IDs to prefer, in order.
   * @param options.restrictToKnownOrNative - When true, resolve only a native provider
   *   (or no providers when none supports the asset).
   * @returns Provider IDs for this request only.
   */
  async #resolveProviderIdsForQuote({
    assetId,
    region,
    preferredProviderIds,
    restrictToKnownOrNative,
  }: {
    assetId: string;
    region: string;
    preferredProviderIds?: string[];
    restrictToKnownOrNative?: boolean;
  }): Promise<string[]> {
    const { supporting, all } = await this.#getSupportingProvidersForRegion({
      assetId,
      region,
    });

    // When not restricted and nothing supports the asset, behave as if no
    // auto-selection occurred (quote against all known providers).
    if (!restrictToKnownOrNative && supporting.length === 0) {
      return all.map((provider) => provider.id);
    }

    // 1. The currently selected provider, if it supports the asset.
    const { selected } = this.state.providers;
    if (
      selected &&
      supporting.some((provider) => provider.id === selected.id)
    ) {
      return [selected.id];
    }

    // 2. A provider the user has transacted with before — from
    //    `preferredProviderIds` when supplied, otherwise completed-order
    //    history. Takes priority over Transak Native to preserve an existing
    //    KYC relationship and avoid churn.
    const preferred =
      preferredProviderIds ?? this.#getPreferredProviderIdsFromOrders();

    for (const preferredId of preferred) {
      const match = supporting.find((provider) => provider.id === preferredId);
      if (match) {
        return [match.id];
      }
    }

    // 3. A native provider (e.g. Transak Native).
    const nativeProvider = supporting.find(
      (provider) => provider.type === 'native',
    );
    if (nativeProvider) {
      return [nativeProvider.id];
    }

    // 4. Fallback. Under headless gating, introduce no other provider — return
    //    nothing so the caller surfaces an "unavailable" state. Otherwise the
    //    aggregator and all other providers are treated equally: first wins.
    if (restrictToKnownOrNative) {
      return [];
    }
    return [supporting[0].id];
  }

  /**
   * Resolves provider IDs that should contribute payment methods for a
   * quoting context. Mirrors {@link getQuotes} provider-set selection, with
   * one intentional difference on the widened path: when the all-providers
   * flag allowlist is non-empty, returns supporting providers intersected
   * with that allowlist (pick survivors for the picker). Does not mutate
   * state.
   *
   * @param options - Resolution inputs aligned with `getQuotes`.
   * @param options.assetId - CAIP-19 asset type identifier to resolve for.
   * @param options.region - Region to resolve providers for.
   * @param options.providers - Explicit provider IDs, when provided.
   * @param options.autoSelectProvider - Resolve providers like `getQuotes`.
   * @param options.preferredProviderIds - Preferred provider IDs in order.
   * @param options.restrictToKnownOrNativeProviders - Headless gating.
   * @returns Provider IDs for this request only.
   */
  async #resolveProviderIdsForPaymentMethods({
    assetId,
    region,
    providers,
    autoSelectProvider,
    preferredProviderIds,
    restrictToKnownOrNativeProviders,
  }: {
    assetId: string;
    region: string;
    providers?: string[];
    autoSelectProvider?: boolean;
    preferredProviderIds?: string[];
    restrictToKnownOrNativeProviders?: boolean;
  }): Promise<string[]> {
    const wantsAutoSelection =
      !providers &&
      (autoSelectProvider === true ||
        restrictToKnownOrNativeProviders === true);
    const { enabled: allProvidersEnabled, allowlist: providerAllowlist } =
      wantsAutoSelection
        ? this.#resolveAllProvidersFlag()
        : { enabled: false, allowlist: undefined };
    const widenToAllProviders = wantsAutoSelection && allProvidersEnabled;

    if (providers) {
      return restrictToKnownOrNativeProviders
        ? this.#filterProviderIdsBySupport({
            providerIds: providers,
            assetId,
            region,
          })
        : providers;
    }

    if (widenToAllProviders) {
      const { supporting } = await this.#getSupportingProvidersForRegion({
        assetId,
        region,
      });
      if (providerAllowlist && providerAllowlist.length > 0) {
        const allowedProviderIds = new Set(
          providerAllowlist.map(normalizeHeadlessProviderId),
        );
        return supporting
          .filter((provider) =>
            allowedProviderIds.has(normalizeHeadlessProviderId(provider.id)),
          )
          .map((provider) => provider.id);
      }
      return supporting.map((provider) => provider.id);
    }

    if (autoSelectProvider || restrictToKnownOrNativeProviders) {
      return this.#resolveProviderIdsForQuote({
        assetId,
        region,
        preferredProviderIds,
        restrictToKnownOrNative: restrictToKnownOrNativeProviders,
      });
    }

    const selectedId = this.state.providers.selected?.id;
    return selectedId ? [selectedId] : [];
  }

  /**
   * Derives an ordered list of provider IDs from the user's completed-order
   * history, most recently completed first, with duplicates removed.
   *
   * Reads only this controller's own normalized order state, so it carries no
   * dependency on any client-specific order representation.
   *
   * @returns Provider IDs ordered by most recent completed order.
   */
  #getPreferredProviderIdsFromOrders(): string[] {
    const orderedIds: string[] = [];

    const completedOrders = this.state.orders
      .filter(
        (order) =>
          order.status === RampsOrderStatus.Completed && order.provider?.id,
      )
      .sort((orderA, orderB) => orderB.createdAt - orderA.createdAt);

    for (const order of completedOrders) {
      const id = order.provider?.id;
      if (id && !orderedIds.includes(id)) {
        orderedIds.push(id);
      }
    }

    return orderedIds;
  }

  // === ORDER MANAGEMENT ===

  /**
   * Adds or updates a V2 order in controller state.
   * If an order with the same internal order code already exists, the incoming
   * fields are merged on top of the existing order so that fields not present
   * in the update (e.g. paymentDetails from the Transak API) are preserved.
   *
   * @param order - The RampsOrder to add or update.
   */
  addOrder(order: RampsOrder): void {
    const internalOrderCode = getInternalOrderCode(order);
    const healedOrder = {
      ...order,
      providerOrderId: internalOrderCode,
    };

    this.update((state) => {
      const idx = state.orders.findIndex(
        (existing) => getInternalOrderCode(existing) === internalOrderCode,
      );
      if (idx === -1) {
        state.orders.push(healedOrder as Draft<RampsOrder>);
      } else {
        state.orders[idx] = {
          ...state.orders[idx],
          ...healedOrder,
        } as Draft<RampsOrder>;
      }
    });
  }

  /**
   * Removes a V2 order from controller state by providerOrderId.
   *
   * @param providerOrderId - The provider order ID to remove.
   */
  removeOrder(providerOrderId: string): void {
    this.update((state) => {
      state.orders = state.orders.filter(
        (order) => order.providerOrderId !== providerOrderId,
      );
    });

    this.#orderPollingMeta.delete(providerOrderId);
  }

  /**
   * Adds or updates a local autoramp last-seen cursor (e.g. after create).
   *
   * @param accountOrInput - Full account or create fields.
   * @returns The upserted {@link AutorampAccount}.
   */
  addAutoramp(
    accountOrInput:
      | AutorampAccount
      | {
          id: string;
          customerId: string;
          walletAddress: string;
          status?: AutorampAccount['status'] | string;
        },
  ): AutorampAccount {
    const account: AutorampAccount = isFullAutorampAccount(accountOrInput)
      ? accountOrInput
      : createAutorampAccount(accountOrInput);

    this.update((state) => {
      const idx = state.autoramps.findIndex(
        (existing) => existing.id === account.id,
      );
      if (idx === -1) {
        state.autoramps.push(account as Draft<AutorampAccount>);
      } else {
        state.autoramps[idx] = {
          ...state.autoramps[idx],
          ...account,
        } as Draft<AutorampAccount>;
      }
    });

    return (
      this.state.autoramps.find((existing) => existing.id === account.id) ??
      account
    );
  }

  /**
   * Creates an autoramp via the neo-bank proxy and applies the returned
   * snapshot as the local last-seen cursor.
   *
   * The vendor `customer_id` is resolved via
   * {@link RampsController.resolveAutorampCustomerId} and injected into the
   * request (any caller-supplied `customer_id` is overwritten).
   *
   * @param request - CreateAutoramp payload.
   * @param options - Optional idempotency key forwarded to the proxy.
   * @param options.idempotencyKey - Value sent as `Idempotency-Key`.
   * @returns The created/updated local {@link AutorampAccount}.
   */
  async createAutoramp(
    request: CreateAutorampRequest,
    options: { idempotencyKey?: string } = {},
  ): Promise<AutorampAccount> {
    const customerId = await this.resolveAutorampCustomerId();

    const body = { ...request, customer_id: customerId };
    const remote = await this.messenger.call(
      'NeoBankService:createAutoramp',
      body,
      options,
    );
    return this.#applyAutorampRemoteSnapshot(remote);
  }

  /**
   * Resolves the vendor `customer_id` for autoramp / Money Account operations.
   *
   * Maps the wallet's Profile Sync id (the partner `external_id`) to the
   * vendor customer via `GET /neobank/customers/{external_id}/external`.
   *
   * @returns The vendor customer id.
   */
  async resolveAutorampCustomerId(): Promise<string> {
    const profile = await this.messenger.call(
      'AuthenticationController:getSessionProfile',
    );
    const canonical = profile?.canonicalProfileId;
    const externalId =
      typeof canonical === 'string' && canonical.length > 0
        ? canonical
        : profile?.profileId;
    if (typeof externalId !== 'string' || externalId.length === 0) {
      throw new Error(
        'Cannot resolve MoonPay customer id: wallet is not signed in to Profile Sync.',
      );
    }

    const customer = await this.messenger.call(
      'NeoBankService:getCustomerByExternalId',
      externalId,
    );
    const customerId =
      customer &&
      typeof customer === 'object' &&
      typeof (customer as { id?: unknown }).id === 'string'
        ? (customer as { id: string }).id
        : null;
    if (!customerId) {
      throw new Error(
        `Cannot resolve MoonPay customer id: no MoonPay customer is mapped to external id "${externalId}".`,
      );
    }
    return customerId;
  }

  /**
   * Registers a Money Account wallet with MoonPay Iron via neobank-proxy.
   *
   * @param params - Money Account wallet registration parameters.
   * @param params.address - Monad Money Account address.
   * @returns The registration state, or `{ type: 'lookupUnavailable' }` when
   * the address-list lookup fails (never treated as unregistered).
   */
  async registerMoneyAccountWallet({
    address,
  }: {
    address: string;
  }): Promise<MoneyAccountWalletRegistrationResult> {
    let machine = transitionWalletRegistration(
      createInitialWalletRegistrationState(),
      { type: 'START' },
    );

    const toExistingResult = (
      status: RegistrationStatus,
    ): MoneyAccountWalletRegistrationResult | undefined => {
      if (status.type === 'active') {
        return { type: 'alreadyRegistered', registration: status.registration };
      }
      if (status.type === 'disabled') {
        return {
          type: 'registeredDisabled',
          registration: status.registration,
        };
      }
      return undefined;
    };

    const customerId = await this.resolveAutorampCustomerId();

    const toLookupUnavailableResult = (
      error: unknown,
    ): LookupUnavailableResult => {
      machine = transitionWalletRegistration(machine, {
        type: 'LOOKUP_FAILED',
      });
      return {
        type: 'lookupUnavailable',
        error:
          error instanceof WalletRegistrationError
            ? error
            : new WalletRegistrationError('lookupUnavailable', {
                message: 'self-hosted address lookup failed',
                body: error instanceof Error ? error.message : undefined,
              }),
      };
    };

    const lookup = async (): Promise<
      RegistrationStatus | LookupUnavailableResult
    > => {
      try {
        return await this.messenger.call(
          'NeoBankService:getWalletRegistrationStatus',
          { customerId, address },
        );
      } catch (error) {
        return toLookupUnavailableResult(error);
      }
    };

    const applyLookup = (
      status: RegistrationStatus,
    ): MoneyAccountWalletRegistrationResult | undefined => {
      let eventType: 'LOOKUP_ACTIVE' | 'LOOKUP_DISABLED' | 'LOOKUP_ABSENT' =
        'LOOKUP_ABSENT';
      if (status.type === 'active') {
        eventType = 'LOOKUP_ACTIVE';
      } else if (status.type === 'disabled') {
        eventType = 'LOOKUP_DISABLED';
      }
      machine = transitionWalletRegistration(machine, {
        type: eventType,
      });
      return toExistingResult(status);
    };

    const resolveLookup = async (): Promise<
      MoneyAccountWalletRegistrationResult | undefined
    > => {
      const status = await lookup();
      if (status.type === 'lookupUnavailable') {
        return status;
      }
      return applyLookup(status);
    };

    const existingResult = await resolveLookup();
    if (existingResult) {
      return existingResult;
    }

    let idempotencyKey = createIdempotencyKey();
    let lastMessage: string | undefined;

    while (true) {
      const message = buildOwnershipMessage({
        address,
        customerId,
        now: new Date(),
      });
      if (lastMessage !== undefined && message !== lastMessage) {
        idempotencyKey = createIdempotencyKey();
      }
      lastMessage = message;

      let signature: string;
      try {
        signature = await this.messenger.call(
          'KeyringController:signPersonalMessage',
          { data: message, from: address },
        );
        machine = transitionWalletRegistration(machine, { type: 'SIGN_OK' });
      } catch (error) {
        machine = transitionWalletRegistration(machine, {
          type: 'SIGN_FAILED',
          retryable: false,
        });
        throw error;
      }

      try {
        const result = await this.messenger.call(
          'NeoBankService:registerSelfHostedWallet',
          {
            address,
            customerId,
            message,
            signature,
            idempotencyKey,
          },
        );
        machine = transitionWalletRegistration(machine, { type: 'SUBMIT_OK' });
        return result;
      } catch (error) {
        if (!(error instanceof WalletRegistrationError)) {
          machine = transitionWalletRegistration(machine, {
            type: 'SUBMIT_TERMINAL',
          });
          throw error;
        }

        if (error.kind === 'conflict') {
          machine = transitionWalletRegistration(machine, {
            type: 'SUBMIT_CONFLICT',
          });
        } else if (error.kind === 'transient') {
          machine = transitionWalletRegistration(machine, {
            type: 'SUBMIT_TRANSIENT',
          });
        } else if (error.kind === 'validation') {
          machine = transitionWalletRegistration(machine, {
            type: 'SUBMIT_VALIDATION',
            utcRollover:
              buildOwnershipMessage({
                address,
                customerId,
                now: new Date(),
              }) !== message,
          });
        } else if (error.kind === 'rateLimited') {
          machine = transitionWalletRegistration(machine, {
            type: 'SUBMIT_RATE_LIMITED',
          });
        } else {
          machine = transitionWalletRegistration(machine, {
            type: 'SUBMIT_TERMINAL',
          });
        }

        if (
          machine.status === 'disambiguate409' ||
          machine.status === 'checkThenRetry'
        ) {
          const reconciledResult = await resolveLookup();
          if (reconciledResult) {
            return reconciledResult;
          }
        }

        if (machine.status !== 'signing') {
          throw error;
        }
      }
    }
  }

  /**
   * Removes a local autoramp last-seen cursor by id.
   *
   * @param autorampId - MoonPay autoramp id.
   */
  removeAutoramp(autorampId: string): void {
    this.update((state) => {
      state.autoramps = state.autoramps.filter(
        (autoramp) => autoramp.id !== autorampId,
      );
    });
  }

  /**
   * Marks that the UI has already notified for the autoramp's current status.
   *
   * @param autorampId - MoonPay autoramp id.
   */
  markAutorampAsNotified(autorampId: string): void {
    const existing = this.state.autoramps.find(
      (autoramp) => autoramp.id === autorampId,
    );
    if (!existing) {
      return;
    }
    const notified = markAutorampNotified(existing);
    this.update((state) => {
      const idx = state.autoramps.findIndex(
        (autoramp) => autoramp.id === autorampId,
      );
      if (idx !== -1) {
        state.autoramps[idx] = notified as Draft<AutorampAccount>;
      }
    });
  }

  /**
   * Applies a remote autoramp snapshot from a websocket / webhook push.
   *
   * @param remote - Remote autoramp snapshot.
   * @returns The updated local account.
   */
  applyAutorampStatusFromPush(remote: AutorampRemoteSnapshot): AutorampAccount {
    return this.#applyAutorampRemoteSnapshot(remote);
  }

  /**
   * Fetches one autoramp from the neo-bank proxy and applies it to the
   * last-seen cursor. Does not recreate a cursor that was removed while the
   * request was in flight.
   *
   * @param autorampId - MoonPay autoramp id.
   * @returns The updated local account, or an unpersisted snapshot if the
   * cursor was removed during the fetch.
   */
  async refreshAutoramp(autorampId: string): Promise<AutorampAccount> {
    const remote = await this.messenger.call(
      'NeoBankService:getAutoramp',
      autorampId,
    );
    return this.#applyAutorampRemoteSnapshot(remote, { allowInsert: false });
  }

  /**
   * Refreshes all known local autoramps from MoonPay.
   * Intended for app resume / unlock catch-up when webhooks were missed.
   *
   * @returns Updated autoramp accounts (failed fetches are skipped).
   */
  async refreshAutoramps(): Promise<AutorampAccount[]> {
    const ids = this.state.autoramps.map((autoramp) => autoramp.id);
    const updated: AutorampAccount[] = [];

    for (const id of ids) {
      try {
        const account = await this.refreshAutoramp(id);
        if (
          this.state.autoramps.some((autoramp) => autoramp.id === account.id)
        ) {
          updated.push(account);
        }
      } catch {
        // Keep local cursor for this id; continue remaining refreshes.
      }
    }

    return updated;
  }

  /**
   * Applies a remote snapshot to the last-seen cursor.
   *
   * @param remote - MoonPay snapshot.
   * @param options - Apply options.
   * @param options.allowInsert - When false, a missing local cursor is not
   * recreated (used by refresh so a concurrent `removeAutoramp` wins).
   * @returns The applied account. When `allowInsert` is false and no local
   * cursor exists, the snapshot is returned without writing state.
   */
  #applyAutorampRemoteSnapshot(
    remote: AutorampRemoteSnapshot,
    { allowInsert = true }: { allowInsert?: boolean } = {},
  ): AutorampAccount {
    const local =
      this.state.autoramps.find((autoramp) => autoramp.id === remote.id) ??
      null;
    if (local === null && !allowInsert) {
      return applyAutorampRemoteStatus(null, remote).account;
    }
    const result = applyAutorampRemoteStatus(local, remote);

    this.update((state) => {
      const idx = state.autoramps.findIndex(
        (autoramp) => autoramp.id === result.account.id,
      );
      if (idx === -1) {
        state.autoramps.push(result.account as Draft<AutorampAccount>);
      } else {
        state.autoramps[idx] = result.account as Draft<AutorampAccount>;
      }
    });

    if (result.statusChanged) {
      this.messenger.publish('RampsController:autorampStatusChanged', {
        autoramp: result.account,
        previousStatus: result.previousStatus,
        shouldNotify: result.shouldNotify,
      });
    }

    return (
      this.state.autoramps.find(
        (autoramp) => autoramp.id === result.account.id,
      ) ?? result.account
    );
  }

  /**
   * Autoramps to poll for deposits: those that are Approved (deposit-ready)
   * plus any autoramp that still has a non-terminal deposit locally, so an
   * in-flight deposit keeps being tracked even if its route later goes
   * terminal. Pre-Approved autoramps are skipped since they cannot yet have
   * deposits.
   *
   * @returns Autoramps that should be polled for deposits.
   */
  #autorampsToPollForDeposits(): AutorampAccount[] {
    const autorampIdsWithPendingDeposits = new Set(
      this.state.deposits
        .filter((deposit) => !isTerminalDepositStatus(deposit.status))
        .map((deposit) => deposit.autorampId)
        .filter((id): id is string => id !== undefined),
    );

    return this.state.autoramps.filter(
      (autoramp) =>
        autoramp.status === AutorampStatus.Approved ||
        autorampIdsWithPendingDeposits.has(autoramp.id),
    );
  }

  /**
   * Refreshes Money Account deposit/transaction records for the pollable
   * autoramps from the neo-bank proxy, applying any status changes to local
   * state and emitting `depositStatusChanged`. Intended for app load / unlock
   * catch-up, and reused as the deposit poll worker. Emit-only: no on-chain
   * action is taken.
   */
  async refreshDeposits(): Promise<void> {
    await Promise.allSettled(
      this.#autorampsToPollForDeposits().map(async (autoramp) =>
        this.#refreshAutorampDeposits(autoramp.id),
      ),
    );
  }

  /**
   * Fetches the deposits for one autoramp and applies each snapshot to state.
   * Updates per-autoramp poll bookkeeping (error backoff) and never throws.
   *
   * @param autorampId - Autoramp whose deposits to refresh.
   */
  async #refreshAutorampDeposits(autorampId: string): Promise<void> {
    try {
      const remotes = await this.messenger.call(
        'NeoBankService:getAutorampTransactions',
        autorampId,
      );

      for (const remote of remotes) {
        this.#applyDepositRemoteSnapshot(remote);
      }

      const meta = this.#depositPollingMeta.get(autorampId) ?? {
        lastTimeFetched: 0,
        errorCount: 0,
      };
      meta.errorCount = 0;
      meta.lastTimeFetched = Date.now();
      this.#depositPollingMeta.set(autorampId, meta);
    } catch {
      const meta = this.#depositPollingMeta.get(autorampId) ?? {
        lastTimeFetched: 0,
        errorCount: 0,
      };
      meta.errorCount = Math.min(meta.errorCount + 1, MAX_ERROR_COUNT);
      meta.lastTimeFetched = Date.now();
      this.#depositPollingMeta.set(autorampId, meta);
    }
  }

  /**
   * Applies a remote deposit snapshot onto local state (upsert), publishing
   * `depositStatusChanged` when the status transitions. Shared by catch-up and
   * poll paths.
   *
   * @param remote - Remote deposit snapshot from the proxy.
   * @returns The upserted local deposit.
   */
  #applyDepositRemoteSnapshot(
    remote: MoneyAccountDepositRemoteSnapshot,
  ): MoneyAccountDeposit {
    const local =
      this.state.deposits.find((deposit) => deposit.id === remote.id) ?? null;
    const result = applyDepositRemoteStatus(local, remote);

    this.update((state) => {
      const idx = state.deposits.findIndex(
        (deposit) => deposit.id === result.deposit.id,
      );
      if (idx === -1) {
        state.deposits.push(result.deposit as Draft<MoneyAccountDeposit>);
      } else {
        state.deposits[idx] = result.deposit as Draft<MoneyAccountDeposit>;
      }
    });

    if (result.statusChanged) {
      this.messenger.publish('RampsController:depositStatusChanged', {
        deposit: result.deposit,
        previousStatus: result.previousStatus,
        shouldNotify: result.shouldNotify,
      });
    }

    return (
      this.state.deposits.find((deposit) => deposit.id === result.deposit.id) ??
      result.deposit
    );
  }

  /**
   * Marks that the UI has already notified for the deposit's current status,
   * so a later transition back into the same notable status does not re-notify.
   * Consumers call this after surfacing a `depositStatusChanged` with
   * `shouldNotify: true`.
   *
   * @param depositId - Proxy deposit/transaction id.
   */
  markDepositAsNotified(depositId: string): void {
    const existing = this.state.deposits.find(
      (deposit) => deposit.id === depositId,
    );
    if (!existing) {
      return;
    }
    const notified = markDepositNotified(existing);
    this.update((state) => {
      const idx = state.deposits.findIndex(
        (deposit) => deposit.id === depositId,
      );
      if (idx !== -1) {
        state.deposits[idx] = notified as Draft<MoneyAccountDeposit>;
      }
    });
  }

  /**
   * Removes a local deposit record by id. Lets consumers prune settled or stale
   * deposits so the persisted `deposits` array does not grow without bound.
   *
   * @param depositId - Proxy deposit/transaction id.
   */
  removeDeposit(depositId: string): void {
    this.update((state) => {
      state.deposits = state.deposits.filter(
        (deposit) => deposit.id !== depositId,
      );
    });
  }

  /**
   * Starts polling Money Account deposits for active autoramps at a fixed
   * interval. Emit-only: publishes `depositStatusChanged` on transitions and
   * takes no on-chain action (vault sweeping is owned by the backend).
   */
  startDepositPolling(): void {
    if (this.#depositPollingTimer) {
      return;
    }

    this.#depositPollingTimer = setInterval(() => {
      this.#pollPendingDeposits().catch(() => undefined);
    }, DEFAULT_POLLING_INTERVAL_MS);

    this.#pollPendingDeposits().catch(() => undefined);
  }

  /**
   * Stops deposit polling and clears the interval.
   */
  stopDepositPolling(): void {
    if (this.#depositPollingTimer) {
      clearInterval(this.#depositPollingTimer);
      this.#depositPollingTimer = null;
    }
  }

  async #pollPendingDeposits(): Promise<void> {
    if (this.#isPollingDeposits) {
      return;
    }
    this.#isPollingDeposits = true;
    try {
      const autoramps = this.#autorampsToPollForDeposits();
      const activeIds = new Set(autoramps.map((autoramp) => autoramp.id));

      // Drop backoff bookkeeping for autoramps that are no longer polled.
      for (const id of this.#depositPollingMeta.keys()) {
        if (!activeIds.has(id)) {
          this.#depositPollingMeta.delete(id);
        }
      }

      const now = Date.now();

      await Promise.allSettled(
        autoramps.map(async (autoramp) => {
          const meta = this.#depositPollingMeta.get(autoramp.id);

          // errorCount === 1 yields a backoff equal to the interval (no extra
          // wait); exponential backoff begins at the 2nd consecutive error.
          // Kept identical to the order poller (#pollPendingOrders) on purpose.
          if (meta && meta.errorCount > 0) {
            const backoffMs = Math.min(
              DEFAULT_POLLING_INTERVAL_MS * Math.pow(2, meta.errorCount - 1),
              5 * 60 * 1000,
            );

            if (now - meta.lastTimeFetched < backoffMs) {
              return;
            }
          }

          await this.#refreshAutorampDeposits(autoramp.id);
        }),
      );
    } finally {
      this.#isPollingDeposits = false;
    }
  }

  /**
   * Refreshes a single order via the V2 API and updates it in state.
   * Publishes orderStatusChanged if the status transitioned.
   *
   * @param order - The order to refresh (needs provider and providerOrderId).
   */
  async #refreshOrder(order: RampsOrder): Promise<void> {
    const providerCode = order.provider?.id ?? '';
    if (!providerCode || !order.providerOrderId || !order.walletAddress) {
      return;
    }

    const previousStatus = order.status;

    try {
      const updatedOrder = await this.getOrder(
        providerCode,
        order.providerOrderId,
        order.walletAddress,
      );

      const meta = this.#orderPollingMeta.get(order.providerOrderId) ?? {
        lastTimeFetched: 0,
        errorCount: 0,
      };

      if (updatedOrder.status === RampsOrderStatus.Unknown) {
        meta.errorCount = Math.min(meta.errorCount + 1, MAX_ERROR_COUNT);
      } else {
        meta.errorCount = 0;
      }

      meta.lastTimeFetched = Date.now();
      this.#orderPollingMeta.set(order.providerOrderId, meta);

      if (
        previousStatus !== updatedOrder.status &&
        previousStatus !== undefined
      ) {
        this.messenger.publish('RampsController:orderStatusChanged', {
          order: updatedOrder,
          previousStatus,
        });
      }

      if (TERMINAL_ORDER_STATUSES.has(updatedOrder.status)) {
        this.#orderPollingMeta.delete(order.providerOrderId);
      }
    } catch {
      const meta = this.#orderPollingMeta.get(order.providerOrderId) ?? {
        lastTimeFetched: 0,
        errorCount: 0,
      };
      meta.errorCount = Math.min(meta.errorCount + 1, MAX_ERROR_COUNT);
      meta.lastTimeFetched = Date.now();
      this.#orderPollingMeta.set(order.providerOrderId, meta);
    }
  }

  /**
   * Starts polling all pending V2 orders at a fixed interval.
   * Each poll cycle iterates orders with non-terminal statuses,
   * respects pollingSecondsMinimum and backoff from error count.
   */
  startOrderPolling(): void {
    if (this.#orderPollingTimer) {
      return;
    }

    this.#orderPollingTimer = setInterval(() => {
      this.#pollPendingOrders().catch(() => undefined);
    }, DEFAULT_POLLING_INTERVAL_MS);

    this.#pollPendingOrders().catch(() => undefined);
  }

  /**
   * Stops order polling and clears the interval.
   */
  stopOrderPolling(): void {
    if (this.#orderPollingTimer) {
      clearInterval(this.#orderPollingTimer);
      this.#orderPollingTimer = null;
    }
  }

  async #pollPendingOrders(): Promise<void> {
    if (this.#isPolling) {
      return;
    }
    this.#isPolling = true;
    try {
      const pendingOrders = this.state.orders.filter((order) =>
        PENDING_ORDER_STATUSES.has(order.status),
      );

      const now = Date.now();

      await Promise.allSettled(
        pendingOrders.map(async (order) => {
          const meta = this.#orderPollingMeta.get(order.providerOrderId);

          if (meta) {
            const backoffMs =
              meta.errorCount > 0
                ? Math.min(
                    DEFAULT_POLLING_INTERVAL_MS *
                      Math.pow(2, meta.errorCount - 1),
                    5 * 60 * 1000,
                  )
                : 0;

            const pollingMinMs = (order.pollingSecondsMinimum ?? 0) * 1000;
            const minWait = Math.max(backoffMs, pollingMinMs);

            if (now - meta.lastTimeFetched < minWait) {
              return;
            }
          }

          await this.#refreshOrder(order);
        }),
      );
    } finally {
      this.#isPolling = false;
    }
  }

  /**
   * Cleans up controller resources.
   * Should be called when the controller is no longer needed.
   */
  override destroy(): void {
    this.stopOrderPolling();
    this.stopDepositPolling();
    super.destroy();
  }

  /**
   * Fetches the widget data from a quote for redirect providers.
   * Makes a request to the buyURL endpoint via the RampsService to get the
   * actual provider widget URL and optional order ID for polling.
   *
   * @param quote - The quote to fetch the widget URL from.
   * @returns Promise resolving to the full BuyWidget (url, browser, orderId), or null if not available (missing buyURL or empty url in response).
   * @throws Rethrows errors from the RampsService (e.g. HttpError, network failures) so clients can react to fetch failures.
   */
  async getBuyWidgetData(quote: Quote): Promise<BuyWidget | null> {
    const buyUrl = quote.quote?.buyURL;
    if (!buyUrl) {
      return null;
    }

    const buyWidget = await this.messenger.call(
      'RampsService:getBuyWidgetUrl',
      buyUrl,
    );
    if (!buyWidget?.url) {
      return null;
    }
    return buyWidget;
  }

  /**
   * Registers an order ID for polling until the order is created or resolved.
   * Adds a minimal stub order to controller state; the existing order polling
   * will fetch the full order when the provider has created it.
   *
   * @param params - Object containing order identifiers and wallet info.
   * @param params.orderId - Full order ID (e.g. "/providers/paypal/orders/abc123") or order code.
   * @param params.providerCode - Canonical provider code (e.g. "paypal", "transak").
   * @param params.walletAddress - Wallet address for the order.
   * @param params.chainId - Chain ID for the order (decimal, hex, or CAIP-2). Must be non-empty.
   */
  addPrecreatedOrder(params: {
    orderId: string;
    providerCode: string;
    walletAddress: string;
    chainId: string;
  }): void {
    const { orderId, providerCode, walletAddress, chainId } = params;

    const orderCode = getInternalOrderCode(orderId);
    if (!orderCode?.trim()) {
      return;
    }
    if (!chainId.trim()) {
      return;
    }
    const stubOrder: RampsOrder = {
      providerOrderId: orderCode,
      provider: {
        id: providerCode,
        name: '',
        environmentType: '',
        description: '',
        hqAddress: '',
        links: [],
        logos: { light: '', dark: '', height: 0, width: 0 },
      },
      walletAddress,
      status: RampsOrderStatus.Precreated,
      orderType: 'buy',
      createdAt: Date.now(),
      isOnlyLink: false,
      success: false,
      cryptoAmount: 0,
      fiatAmount: 0,
      providerOrderLink: '',
      totalFeesFiat: 0,
      txHash: '',
      network: { chainId, name: '' },
      canBeUpdated: true,
      idHasExpired: false,
      excludeFromPurchases: false,
      timeDescriptionPending: '',
    };

    this.addOrder(stubOrder);
  }

  /**
   * Fetches an order from the unified V2 API endpoint.
   * Returns a normalized RampsOrder for all provider types (aggregator and native).
   *
   * @param providerCode - The provider code (e.g., "transak", "transak-native", "moonpay").
   * @param orderCode - The order identifier.
   * @param wallet - The wallet address associated with the order.
   * @returns The unified order data.
   */
  async getOrder(
    providerCode: string,
    orderCode: string,
    wallet: string,
  ): Promise<RampsOrder> {
    const order = await this.messenger.call(
      'RampsService:getOrder',
      providerCode,
      orderCode,
      wallet,
    );

    const healedWalletAddress = order.walletAddress || wallet;
    const internalOrderCode = getInternalOrderCode({
      id: order.id,
      providerOrderId: orderCode,
    });
    const healedOrder = {
      ...order,
      walletAddress: healedWalletAddress,
      providerOrderId: internalOrderCode,
    };

    this.update((state) => {
      const idx = state.orders.findIndex(
        (existing: RampsOrder) =>
          getInternalOrderCode(existing) === internalOrderCode,
      );
      if (idx === -1) {
        state.orders.push(healedOrder as Draft<RampsOrder>);
      } else {
        state.orders[idx] = {
          ...state.orders[idx],
          ...healedOrder,
        } as Draft<RampsOrder>;
      }
    });

    return healedOrder;
  }

  /**
   * Extracts an order from a provider callback URL.
   * Sends the callback URL to the V2 backend for provider-specific parsing,
   * then fetches the full order. This is the V2 equivalent of the aggregator
   * SDK's `getOrderFromCallback`.
   *
   * @param providerCode - The provider code (e.g., "transak", "moonpay").
   * @param callbackUrl - The full callback URL the provider redirected to.
   * @param wallet - The wallet address associated with the order.
   * @returns The unified order data.
   */
  async getOrderFromCallback(
    providerCode: string,
    callbackUrl: string,
    wallet: string,
  ): Promise<RampsOrder> {
    const order = await this.messenger.call(
      'RampsService:getOrderFromCallback',
      providerCode,
      callbackUrl,
      wallet,
    );

    return order;
  }

  // === TRANSAK METHODS ===
  //
  // Auth state is managed at two levels:
  // - TransakService stores the access token (needed for API calls)
  // - RampsController stores isAuthenticated (needed for UI state)
  // Both are kept in sync by the controller methods below.

  /**
   * Checks whether an error is a 401 HTTP error (expired/missing token) and,
   * if so, marks the Transak session as unauthenticated so the UI stays in
   * sync with the cleared token inside TransakService.
   *
   * @param error - The caught error to inspect.
   */
  #syncTransakAuthOnError(error: unknown): void {
    if (hasHttpStatus(error) && error.httpStatus === 401) {
      this.transakSetAuthenticated(false);
    }
  }

  #getNormalizedTransakError(
    error: unknown,
    options: { syncAuth?: boolean } = {},
  ): NormalizedRampsError {
    if (options.syncAuth) {
      this.#syncTransakAuthOnError(error);
    }

    return getNormalizedRampsError(error);
  }

  /**
   * Sets the Transak API key used for all Transak API requests.
   *
   * @param apiKey - The Transak API key.
   */
  transakSetApiKey(apiKey: string): void {
    this.messenger.call('TransakService:setApiKey', apiKey);
  }

  /**
   * Sets the Transak access token and marks the user as authenticated.
   *
   * @param token - The access token received from Transak auth.
   */
  transakSetAccessToken(token: TransakAccessToken): void {
    this.messenger.call('TransakService:setAccessToken', token);
    this.transakSetAuthenticated(true);
  }

  /**
   * Clears the Transak access token and marks the user as unauthenticated.
   */
  transakClearAccessToken(): void {
    this.messenger.call('TransakService:clearAccessToken');
    this.transakSetAuthenticated(false);
  }

  /**
   * Updates the Transak authentication flag in controller state.
   *
   * @param isAuthenticated - Whether the user is authenticated with Transak.
   */
  transakSetAuthenticated(isAuthenticated: boolean): void {
    this.update((state) => {
      state.nativeProviders.transak.isAuthenticated = isAuthenticated;
    });
  }

  /**
   * Resets all Transak state back to defaults (unauthenticated, no data).
   */
  transakResetState(): void {
    this.messenger.call('TransakService:clearAccessToken');
    this.update((state) => {
      state.nativeProviders.transak =
        getDefaultRampsControllerState().nativeProviders.transak;
    });
  }

  /**
   * Sends a one-time password to the user's email for Transak authentication.
   *
   * @param email - The user's email address.
   * @returns The OTP response containing a state token for verification.
   */
  async transakSendUserOtp(email: string): Promise<{
    isTncAccepted: boolean;
    stateToken: string;
    email: string;
    expiresIn: number;
  }> {
    try {
      return await this.messenger.call('TransakService:sendUserOtp', email);
    } catch (error) {
      throw this.#getNormalizedTransakError(error).normalizedError;
    }
  }

  /**
   * Verifies a one-time password and authenticates the user with Transak.
   * Updates the controller's authentication state on success.
   *
   * @param email - The user's email address.
   * @param verificationCode - The OTP code entered by the user.
   * @param stateToken - The state token from the sendUserOtp response.
   * @returns The access token for subsequent authenticated requests.
   */
  async transakVerifyUserOtp(
    email: string,
    verificationCode: string,
    stateToken: string,
  ): Promise<TransakAccessToken> {
    try {
      const token = await this.messenger.call(
        'TransakService:verifyUserOtp',
        email,
        verificationCode,
        stateToken,
      );
      this.transakSetAuthenticated(true);
      return token;
    } catch (error) {
      throw this.#getNormalizedTransakError(error).normalizedError;
    }
  }

  /**
   * Logs the user out of Transak. Clears authentication state and user details
   * regardless of whether the API call succeeds or fails.
   *
   * @returns A message indicating the logout result.
   */
  async transakLogout(): Promise<string> {
    try {
      return await this.messenger.call('TransakService:logout');
    } catch (error) {
      throw this.#getNormalizedTransakError(error).normalizedError;
    } finally {
      this.transakClearAccessToken();
      this.update((state) => {
        state.nativeProviders.transak.userDetails.data = null;
      });
    }
  }

  /**
   * Fetches the authenticated user's details from Transak.
   * Updates the userDetails resource state with loading/success/error states.
   *
   * @returns The user's profile and KYC details.
   */
  async transakGetUserDetails(): Promise<TransakUserDetails> {
    this.update((state) => {
      state.nativeProviders.transak.userDetails.isLoading = true;
      state.nativeProviders.transak.userDetails.error = null;
      delete state.nativeProviders.transak.userDetails.errorKey;
    });
    try {
      const details = await this.messenger.call(
        'TransakService:getUserDetails',
      );
      this.update((state) => {
        state.nativeProviders.transak.userDetails.data = details;
        state.nativeProviders.transak.userDetails.isLoading = false;
      });
      return details;
    } catch (error) {
      const { errorInfo, normalizedError } = this.#getNormalizedTransakError(
        error,
        {
          syncAuth: true,
        },
      );
      this.update((state) => {
        state.nativeProviders.transak.userDetails.isLoading = false;
        state.nativeProviders.transak.userDetails.error = errorInfo.message;
        state.nativeProviders.transak.userDetails.errorKey = errorInfo.errorKey;
      });
      throw normalizedError;
    }
  }

  /**
   * Fetches a buy quote from Transak for the given parameters.
   * Updates the buyQuote resource state with loading/success/error states.
   *
   * @param fiatCurrency - The fiat currency code (e.g., "USD").
   * @param cryptoCurrency - The cryptocurrency identifier.
   * @param network - The blockchain network identifier.
   * @param paymentMethod - The payment method identifier.
   * @param fiatAmount - The fiat amount as a string.
   * @returns The buy quote with pricing and fee details.
   */
  async transakGetBuyQuote(
    fiatCurrency: string,
    cryptoCurrency: string,
    network: string,
    paymentMethod: string,
    fiatAmount: string,
  ): Promise<TransakBuyQuote> {
    this.update((state) => {
      state.nativeProviders.transak.buyQuote.isLoading = true;
      state.nativeProviders.transak.buyQuote.error = null;
      delete state.nativeProviders.transak.buyQuote.errorKey;
    });
    try {
      const quote = await this.messenger.call(
        'TransakService:getBuyQuote',
        fiatCurrency,
        cryptoCurrency,
        network,
        paymentMethod,
        fiatAmount,
      );
      this.update((state) => {
        state.nativeProviders.transak.buyQuote.data = quote;
        state.nativeProviders.transak.buyQuote.isLoading = false;
      });
      return quote;
    } catch (error) {
      const { errorInfo, normalizedError } =
        this.#getNormalizedTransakError(error);
      this.update((state) => {
        state.nativeProviders.transak.buyQuote.isLoading = false;
        state.nativeProviders.transak.buyQuote.error = errorInfo.message;
        state.nativeProviders.transak.buyQuote.errorKey = errorInfo.errorKey;
      });
      throw normalizedError;
    }
  }

  /**
   * Fetches the KYC requirement for a given quote.
   * Updates the kycRequirement resource state with loading/success/error states.
   *
   * @param quoteId - The quote ID to check KYC requirements for.
   * @returns The KYC requirement status and whether the user can place an order.
   */
  async transakGetKycRequirement(
    quoteId: string,
  ): Promise<TransakKycRequirement> {
    this.update((state) => {
      state.nativeProviders.transak.kycRequirement.isLoading = true;
      state.nativeProviders.transak.kycRequirement.error = null;
      delete state.nativeProviders.transak.kycRequirement.errorKey;
    });
    try {
      const requirement = await this.messenger.call(
        'TransakService:getKycRequirement',
        quoteId,
      );
      this.update((state) => {
        state.nativeProviders.transak.kycRequirement.data = requirement;
        state.nativeProviders.transak.kycRequirement.isLoading = false;
      });
      return requirement;
    } catch (error) {
      const { errorInfo, normalizedError } = this.#getNormalizedTransakError(
        error,
        {
          syncAuth: true,
        },
      );
      this.update((state) => {
        state.nativeProviders.transak.kycRequirement.isLoading = false;
        state.nativeProviders.transak.kycRequirement.error = errorInfo.message;
        state.nativeProviders.transak.kycRequirement.errorKey =
          errorInfo.errorKey;
      });
      throw normalizedError;
    }
  }

  /**
   * Fetches additional KYC requirements (e.g., ID proof, address proof) for a quote.
   *
   * @param quoteId - The quote ID to check additional requirements for.
   * @returns The list of additional forms required.
   */
  async transakGetAdditionalRequirements(
    quoteId: string,
  ): Promise<TransakAdditionalRequirementsResponse> {
    try {
      return await this.messenger.call(
        'TransakService:getAdditionalRequirements',
        quoteId,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Creates a new order on Transak. If an existing order conflicts (HTTP 409),
   * active orders are cancelled and the creation is retried.
   *
   * @param quoteId - The quote ID to create an order from.
   * @param walletAddress - The destination wallet address.
   * @param paymentMethodId - The payment method to use.
   * @returns The created deposit order.
   */
  async transakCreateOrder(
    quoteId: string,
    walletAddress: string,
    paymentMethodId: string,
  ): Promise<TransakDepositOrder> {
    try {
      return await this.messenger.call(
        'TransakService:createOrder',
        quoteId,
        walletAddress,
        paymentMethodId,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Fetches an existing order from Transak by order ID.
   *
   * @param orderId - The order ID (deposit format or raw Transak format).
   * @param wallet - The wallet address associated with the order.
   * @param paymentDetails - Optional payment details to attach to the order.
   * @returns The deposit order details.
   */
  async transakGetOrder(
    orderId: string,
    wallet: string,
    paymentDetails?: TransakOrderPaymentMethod[],
  ): Promise<TransakDepositOrder> {
    try {
      return await this.messenger.call(
        'TransakService:getOrder',
        orderId,
        wallet,
        paymentDetails,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error).normalizedError;
    }
  }

  /**
   * Fetches the user's spending limits for a given currency and payment method.
   *
   * @param fiatCurrency - The fiat currency code.
   * @param paymentMethod - The payment method identifier.
   * @param kycType - The KYC level type.
   * @returns The user's limits, spending, and remaining amounts.
   */
  async transakGetUserLimits(
    fiatCurrency: string,
    paymentMethod: string,
    kycType: string,
  ): Promise<TransakUserLimits> {
    try {
      return await this.messenger.call(
        'TransakService:getUserLimits',
        fiatCurrency,
        paymentMethod,
        kycType,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Requests a one-time token (OTT) for the Transak payment widget.
   *
   * @returns The OTT response containing the token.
   */
  async transakRequestOtt(): Promise<TransakOttResponse> {
    try {
      return await this.messenger.call('TransakService:requestOtt');
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Generates a URL for the Transak payment widget with pre-filled parameters.
   *
   * @param ottToken - The one-time token for widget authentication.
   * @param quote - The buy quote to pre-fill in the widget.
   * @param walletAddress - The destination wallet address.
   * @param extraParams - Optional additional URL parameters.
   * @returns The fully constructed widget URL string.
   */
  transakGeneratePaymentWidgetUrl(
    ottToken: string,
    quote: TransakBuyQuote,
    walletAddress: string,
    extraParams?: Record<string, string>,
  ): string {
    return this.messenger.call(
      'TransakService:generatePaymentWidgetUrl',
      ottToken,
      quote,
      walletAddress,
      extraParams,
    );
  }

  /**
   * Creates a Transak payment widget URL via the ramps API proxy, which
   * injects the partner API key server-side. Replaces the OTT flow
   * ({@link transakRequestOtt} + {@link transakGeneratePaymentWidgetUrl}).
   *
   * @param quote - The buy quote to pre-fill in the widget.
   * @param walletAddress - The destination wallet address.
   * @param extraParams - Optional additional widget parameters (e.g. theming).
   * @returns The single-use widget URL.
   */
  async transakCreateWidgetUrl(
    quote: TransakBuyQuote,
    walletAddress: string,
    extraParams?: Record<string, string>,
  ): Promise<string> {
    try {
      return await this.messenger.call(
        'TransakService:createWidgetUrl',
        quote,
        walletAddress,
        extraParams,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Submits the user's purpose of usage form for KYC compliance.
   *
   * @param purpose - Array of purpose strings selected by the user.
   * @returns A promise that resolves when the form is submitted.
   */
  async transakSubmitPurposeOfUsageForm(purpose: string[]): Promise<void> {
    try {
      return await this.messenger.call(
        'TransakService:submitPurposeOfUsageForm',
        purpose,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Updates the user's personal or address details on Transak.
   *
   * @param data - The user data fields to update.
   * @returns The API response data.
   */
  async transakPatchUser(data: PatchUserRequestBody): Promise<unknown> {
    try {
      return await this.messenger.call('TransakService:patchUser', data);
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Submits the user's SSN for identity verification.
   *
   * @param ssn - The Social Security Number.
   * @param quoteId - The quote ID associated with the order requiring SSN.
   * @returns The API response data.
   */
  async transakSubmitSsnDetails(
    ssn: string,
    quoteId: string,
  ): Promise<unknown> {
    try {
      return await this.messenger.call(
        'TransakService:submitSsnDetails',
        ssn,
        quoteId,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Confirms payment for an order after the user has completed payment.
   *
   * @param orderId - The order ID to confirm payment for.
   * @param paymentMethodId - The payment method used.
   * @returns Whether the payment confirmation was successful.
   */
  async transakConfirmPayment(
    orderId: string,
    paymentMethodId: string,
  ): Promise<{ success: boolean }> {
    try {
      return await this.messenger.call(
        'TransakService:confirmPayment',
        orderId,
        paymentMethodId,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Translates generic ramps identifiers to Transak-specific identifiers.
   *
   * @param request - The translation request with optional identifiers to translate.
   * @returns The translated Transak-specific identifiers.
   */
  async transakGetTranslation(
    request: TransakTranslationRequest,
  ): Promise<TransakQuoteTranslation> {
    try {
      return await this.messenger.call(
        'TransakService:getTranslation',
        request,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error).normalizedError;
    }
  }

  /**
   * Checks the status of an ID proof submission for KYC.
   *
   * @param workFlowRunId - The workflow run ID to check status for.
   * @returns The current ID proof status.
   */
  async transakGetIdProofStatus(
    workFlowRunId: string,
  ): Promise<TransakIdProofStatus> {
    try {
      return await this.messenger.call(
        'TransakService:getIdProofStatus',
        workFlowRunId,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Cancels a specific Transak order.
   *
   * @param depositOrderId - The deposit order ID to cancel.
   * @returns A promise that resolves when the order is cancelled.
   */
  async transakCancelOrder(depositOrderId: string): Promise<void> {
    try {
      return await this.messenger.call(
        'TransakService:cancelOrder',
        depositOrderId,
      );
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Cancels all active Transak orders. Individual cancellation failures
   * are collected and returned rather than thrown.
   *
   * @returns An array of errors from any failed cancellations (empty if all succeeded).
   */
  async transakCancelAllActiveOrders(): Promise<Error[]> {
    try {
      return await this.messenger.call('TransakService:cancelAllActiveOrders');
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }

  /**
   * Fetches all active Transak orders for the authenticated user.
   *
   * @returns The list of active orders.
   */
  async transakGetActiveOrders(): Promise<TransakOrder[]> {
    try {
      return await this.messenger.call('TransakService:getActiveOrders');
    } catch (error) {
      throw this.#getNormalizedTransakError(error, { syncAuth: true })
        .normalizedError;
    }
  }
}
