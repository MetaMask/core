import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import {
  any,
  array,
  boolean,
  number,
  optional,
  record,
  string,
  type as looseObject,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

import packageJson from '../package.json';
import type { RampsClientIdentity } from './client-identity.js';
import { addRampsClientIdentityParams } from './client-identity.js';
import { RAMPS_SDK_VERSION } from './RampsService.js';
import { TRANSAK_ERROR_CODES } from './transakErrorCodes.js';
import type { TransakServiceMethodActions } from './TransakService-method-action-types.js';

// === TYPES ===

export type TransakAccessToken = {
  accessToken: string;
  ttl: number;
  created: Date;
};

export type TransakUserDetails = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  status: string;
  dob: string;
  kyc: TransakUserDetailsKycDetails;
  address: TransakUserDetailsAddress;
  createdAt: string;
};

export type TransakUserDetailsAddress = {
  addressLine1: string;
  addressLine2: string;
  state: string;
  city: string;
  postCode: string;
  country: string;
  countryCode: string;
};

export type TransakUserDetailsKycDetails = {
  status: string;
  type: string;
  attempts: TransakUserDetailsKycAttempt[];
  highestApprovedKYCType: string | null;
  kycMarkedBy: string | null;
  kycResult: string | null;
  rejectionDetails: TransakUserDetailsKycAttemptRejectionDetails | null;
  userId: string;
  workFlowRunId: string;
};

export type TransakUserDetailsKycAttempt = {
  artifacts: { key: string; value: string }[];
  metadata: {
    transaction: {
      kycVendorId: string;
      scanReference: string;
      workflowId: string;
    };
  };
  rejectionDetails: TransakUserDetailsKycAttemptRejectionDetails;
  result: string;
  sessionId: string;
};

export type TransakUserDetailsKycAttemptRejectionDetails = {
  archetype: string;
  reason: string;
  reasonCode: string;
};

export type TransakBuyQuote = {
  quoteId: string;
  conversionPrice: number;
  marketConversionPrice: number;
  slippage: number;
  fiatCurrency: string;
  cryptoCurrency: string;
  paymentMethod: string;
  fiatAmount: number;
  cryptoAmount: number;
  isBuyOrSell: string;
  network: string;
  feeDecimal: number;
  totalFee: number;
  feeBreakdown: { [prop: string]: string | number | boolean | null }[];
  nonce: number;
  cryptoLiquidityProvider: string;
  notes: { [prop: string]: string | number | boolean | null }[];
  requestedAssetId: string;
  requestedChainId: string;
};

export type TransakKycRequirement = {
  status:
    | 'NOT_SUBMITTED'
    | 'APPROVED'
    | 'ADDITIONAL_FORMS_REQUIRED'
    | 'SUBMITTED';
  kycType: string;
  isAllowedToPlaceOrder: boolean;
};

export type TransakAdditionalRequirement = {
  type: string;
  metadata?: {
    options: string[];
    documentProofOptions: string[];
    expiresAt: string;
    kycUrl: string;
    workFlowRunId: string;
  };
};

export type TransakAdditionalRequirementsResponse = {
  formsRequired: TransakAdditionalRequirement[];
};

export type TransakOttResponse = {
  ott: string;
};

export type TransakOrderPaymentMethod = {
  fiatCurrency: string;
  paymentMethod: string;
  fields: { name: string; id: string; value: string }[];
};

export type TransakDepositNetwork = {
  name: string;
  chainId: string;
};

export type TransakDepositCryptoCurrency = {
  assetId: string;
  name: string;
  chainId: string;
  decimals: number;
  iconUrl: string;
  symbol: string;
};

export type TransakDepositPaymentMethod = {
  id: string;
  name: string;
  shortName?: string;
  duration: string;
  icon: string;
  iconColor?: { light: string; dark: string };
  isManualBankTransfer?: boolean;
};

export type TransakDepositRegion = {
  isoCode: string;
  flag: string;
  name: string;
  phone: { prefix: string; placeholder: string; template: string };
  currency: string;
  supported: boolean;
  recommended?: boolean;
  geolocated?: boolean;
};

export type TransakDepositOrder = {
  id: string;
  provider: string;
  cryptoAmount: number | string;
  fiatAmount: number;
  cryptoCurrency: TransakDepositCryptoCurrency;
  fiatCurrency: string;
  providerOrderId: string;
  providerOrderLink: string;
  createdAt: number;
  paymentMethod: TransakDepositPaymentMethod;
  totalFeesFiat: number;
  txHash: string;
  walletAddress: string;
  status: string;
  network: TransakDepositNetwork;
  timeDescriptionPending: string;
  fiatAmountInUsd: number;
  feesInUsd: number;
  region: TransakDepositRegion;
  orderType: 'DEPOSIT';
  exchangeRate?: number;
  statusDescription?: string;
  paymentDetails: TransakOrderPaymentMethod[];
  partnerFees?: number;
  networkFees?: number;
};

export type TransakOrder = {
  orderId: string;
  partnerUserId: string;
  status: string;
  isBuyOrSell: string;
  fiatCurrency: string;
  cryptoCurrency: string;
  network: string;
  walletAddress: string;
  quoteId: string;
  fiatAmount: number;
  fiatAmountInUsd: number;
  amountPaid: number;
  cryptoAmount: number;
  conversionPrice: number;
  totalFeeInFiat: number;
  paymentDetails: TransakOrderPaymentMethod[];
  txHash: string;
  transationLink: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

export type TransakQuoteTranslation = {
  region: string;
  paymentMethod: string | undefined;
  cryptoCurrency: string;
  network: string;
  fiatCurrency: string;
};

export type TransakTranslationRequest = {
  regionId?: string;
  cryptoCurrencyId?: string;
  chainId?: string;
  fiatCurrencyId?: string;
  paymentMethod?: string;
};

export type TransakUserLimits = {
  limits: { '1': number; '30': number; '365': number };
  spent: { '1': number; '30': number; '365': number };
  remaining: { '1': number; '30': number; '365': number };
  exceeded: { '1': boolean; '30': boolean; '365': boolean };
  shortage: Record<string, number>;
};

export type PatchUserRequestBody = Partial<{
  personalDetails: Partial<{
    firstName: string;
    lastName: string;
    mobileNumber: string;
    dob: string;
  }>;
  addressDetails: Partial<{
    addressLine1: string;
    addressLine2: string;
    state: string;
    city: string;
    postCode: string;
    countryCode: string;
  }>;
}>;

export type TransakIdProofStatus = {
  status: 'NOT_SUBMITTED' | 'SUBMITTED';
  kycType: string;
  randomLogIdentifier: string;
};

// === ENVIRONMENT ===

export enum TransakEnvironment {
  Production = 'production',
  Staging = 'staging',
  Development = 'development',
}

enum TransakApiProviders {
  TransakNative = 'transak-native',
  TransakNativeStaging = 'transak-native-staging',
}

// === ORDER ID UTILITIES ===

export class TransakOrderIdTransformer {
  static depositOrderIdToTransakOrderId(depositOrderId: string): string {
    const parts = depositOrderId.split('/');
    return parts[parts.length - 1];
  }

  static transakOrderIdToDepositOrderId(
    transakOrderId: string,
    environment: TransakEnvironment,
  ): string {
    const provider =
      environment === TransakEnvironment.Production
        ? 'transak-native'
        : 'transak-native-staging';
    return `/providers/${provider}/orders/${transakOrderId}`;
  }

  static isDepositOrderId(orderId: string): boolean {
    return orderId.startsWith('/providers/');
  }

  static extractTransakOrderId(orderId: string): string {
    return this.isDepositOrderId(orderId)
      ? this.depositOrderIdToTransakOrderId(orderId)
      : orderId;
  }
}

// === MESSENGER ===

const serviceName = 'TransakService';

const MESSENGER_EXPOSED_METHODS = [
  'setApiKey',
  'setAccessToken',
  'clearAccessToken',
  'sendUserOtp',
  'verifyUserOtp',
  'logout',
  'getUserDetails',
  'getBuyQuote',
  'getKycRequirement',
  'getAdditionalRequirements',
  'createOrder',
  'getOrder',
  'getUserLimits',
  'requestOtt',
  'generatePaymentWidgetUrl',
  'createWidgetUrl',
  'submitPurposeOfUsageForm',
  'patchUser',
  'submitSsnDetails',
  'confirmPayment',
  'getTranslation',
  'getIdProofStatus',
  'cancelOrder',
  'cancelAllActiveOrders',
  'getActiveOrders',
] as const;

/**
 * Invalidates cached queries held by {@link TransakService}.
 */
export type TransakServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

export type TransakServiceActions =
  | TransakServiceMethodActions
  | TransakServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link TransakService} calls.
 */
type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

/**
 * Published whenever a query or mutation in the service cache changes.
 */
export type TransakServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published for a single query or mutation whenever it changes in the service
 * cache.
 */
export type TransakServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type TransakServiceEvents =
  | TransakServiceCacheUpdatedEvent
  | TransakServiceGranularCacheUpdatedEvent;

type AllowedEvents = never;

export type TransakServiceMessenger = Messenger<
  typeof serviceName,
  TransakServiceActions | AllowedActions,
  TransakServiceEvents | AllowedEvents
>;

// === HELPER FUNCTIONS ===

/**
 * Maps ramps API payment method IDs (e.g., "/payments/debit-credit-card")
 * to the deposit-format IDs expected by the translation endpoint
 * (e.g., "credit_debit_card").
 *
 * The translation endpoint only understands the deposit-format IDs.
 * Canonical IDs may arrive either with the "/payments/" prefix
 * (e.g., "/payments/apple-pay") or without it (e.g., "apple-pay"), so both
 * forms are accepted. If no mapping exists, the input is returned as-is (it
 * may already be in the deposit format).
 */
const RAMPS_TO_DEPOSIT_PAYMENT_METHOD: Record<string, string> = {
  '/payments/debit-credit-card': 'credit_debit_card',
  '/payments/apple-pay': 'apple_pay',
  '/payments/google-pay': 'google_pay',
  '/payments/sepa-bank-transfer': 'sepa_bank_transfer',
  '/payments/wire-transfer': 'wire_transfer',
  '/payments/gbp-bank-transfer': 'gbp_bank_transfer',
};

const PAYMENTS_PREFIX = '/payments/';

function normalizePaymentMethodForTranslation(
  paymentMethod: string | undefined,
): string | undefined {
  if (!paymentMethod) {
    return undefined;
  }
  const prefixed = paymentMethod.startsWith(PAYMENTS_PREFIX)
    ? paymentMethod
    : `${PAYMENTS_PREFIX}${paymentMethod}`;
  return (
    RAMPS_TO_DEPOSIT_PAYMENT_METHOD[paymentMethod] ??
    RAMPS_TO_DEPOSIT_PAYMENT_METHOD[prefixed] ??
    paymentMethod
  );
}

function getTransakApiBaseUrl(environment: TransakEnvironment): string {
  switch (environment) {
    case TransakEnvironment.Production:
      return 'https://api-gateway.transak.com';
    // Transak has no dev environment; development uses their staging gateway.
    case TransakEnvironment.Staging:
    case TransakEnvironment.Development:
      return 'https://api-gateway-stg.transak.com';
    default:
      throw new Error(`Invalid Transak environment: ${String(environment)}`);
  }
}

function getRampsBaseUrl(environment: TransakEnvironment): string {
  switch (environment) {
    case TransakEnvironment.Production:
      return 'https://on-ramp.api.cx.metamask.io';
    case TransakEnvironment.Staging:
      return 'https://on-ramp.uat-api.cx.metamask.io';
    case TransakEnvironment.Development:
      return 'https://on-ramp.dev-api.cx.metamask.io';
    default:
      throw new Error(`Invalid Transak environment: ${String(environment)}`);
  }
}

function getRampsProviderPath(environment: TransakEnvironment): string {
  // The dev ramps API registers the same `transak-native-staging` provider
  // id as UAT; only production uses `transak-native`.
  const providerId =
    environment === TransakEnvironment.Production
      ? TransakApiProviders.TransakNative
      : TransakApiProviders.TransakNativeStaging;
  return `/providers/${providerId}`;
}

function getPaymentWidgetBaseUrl(environment: TransakEnvironment): string {
  switch (environment) {
    case TransakEnvironment.Production:
      return 'https://global.transak.com';
    // Transak has no dev environment; development uses their staging widget.
    case TransakEnvironment.Staging:
    case TransakEnvironment.Development:
      return 'https://global-stg.transak.com';
    default:
      throw new Error(`Invalid Transak environment: ${String(environment)}`);
  }
}

/**
 * Transak requires `referrerDomain` in `widgetParams` alongside the partner
 * API key (which the ramps API proxy injects server-side). Identifies the
 * MetaMask client to Transak. Default when the client does not pass a
 * `referrerDomain` constructor option (e.g. the mobile app passes its
 * package name / bundle id).
 */
const TRANSAK_REFERRER_DOMAIN = 'metamask.io';

// === TRANSAK API ERROR ===

export class TransakApiError extends HttpError {
  readonly errorCode: string | undefined;

  readonly apiMessage: string | undefined;

  constructor(
    status: number,
    message: string,
    errorCode?: string,
    apiMessage?: string,
  ) {
    super(status, message);
    this.errorCode = errorCode;
    this.apiMessage = apiMessage;
  }
}

// === RESPONSE STRUCTS ===

/**
 * The structs below are intentionally lenient: they check the fields the
 * service and its callers depend on, and ignore any extra fields the APIs
 * return.
 */

const TransakPaymentDetailsStruct = array(
  looseObject({
    fiatCurrency: string(),
    paymentMethod: string(),
    fields: array(
      looseObject({ name: string(), id: string(), value: string() }),
    ),
  }),
);

const SendUserOtpResponseStruct = looseObject({
  isTncAccepted: boolean(),
  stateToken: string(),
  email: string(),
  expiresIn: number(),
});

const VerifyUserOtpResponseStruct = looseObject({
  accessToken: string(),
  ttl: number(),
  created: string(),
});

const UserDetailsStruct = looseObject({
  id: string(),
  firstName: string(),
  lastName: string(),
  email: string(),
  mobileNumber: string(),
  status: string(),
  dob: string(),
  kyc: looseObject({
    status: string(),
    type: string(),
    userId: string(),
    workFlowRunId: string(),
  }),
  address: looseObject({
    addressLine1: string(),
    addressLine2: string(),
    state: string(),
    city: string(),
    postCode: string(),
    country: string(),
    countryCode: string(),
  }),
  createdAt: string(),
});

const BuyQuoteStruct = looseObject({
  quoteId: string(),
  conversionPrice: number(),
  marketConversionPrice: number(),
  slippage: number(),
  fiatCurrency: string(),
  cryptoCurrency: string(),
  paymentMethod: string(),
  fiatAmount: number(),
  cryptoAmount: number(),
  isBuyOrSell: string(),
  network: string(),
  feeDecimal: number(),
  totalFee: number(),
  feeBreakdown: array(record(string(), any())),
  nonce: number(),
  cryptoLiquidityProvider: string(),
  notes: array(record(string(), any())),
});

const KycRequirementStruct = looseObject({
  status: string(),
  kycType: string(),
  isAllowedToPlaceOrder: boolean(),
});

const AdditionalRequirementsStruct = looseObject({
  formsRequired: array(
    looseObject({ type: string(), metadata: optional(any()) }),
  ),
});

const TransakOrderStruct = looseObject({
  orderId: string(),
  walletAddress: string(),
  paymentDetails: optional(TransakPaymentDetailsStruct),
});

const ActiveOrdersStruct = array(
  looseObject({ orderId: string(), status: string() }),
);

const DepositOrderStruct = looseObject({
  providerOrderId: string(),
  status: string(),
});

const UserLimitsStruct = looseObject({
  limits: looseObject({ '1': number(), '30': number(), '365': number() }),
  spent: looseObject({ '1': number(), '30': number(), '365': number() }),
  remaining: looseObject({ '1': number(), '30': number(), '365': number() }),
  exceeded: looseObject({ '1': boolean(), '30': boolean(), '365': boolean() }),
  shortage: record(string(), number()),
});

const OttStruct = looseObject({ ott: string() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TranslationStruct: Struct<any> = looseObject({
  region: optional(string()),
  paymentMethod: optional(string()),
  cryptoCurrency: string(),
  network: string(),
  fiatCurrency: string(),
});

const IdProofStatusStruct = looseObject({
  status: string(),
  kycType: string(),
  randomLogIdentifier: optional(string()),
});

const PaymentConfirmationStruct = looseObject({ success: boolean() });

const WidgetUrlResponseStruct = looseObject({ widgetUrl: string() });

/**
 * Wraps a struct in the `{ data }` envelope the Transak API gateway uses.
 *
 * @param dataStruct - The struct for the `data` property.
 * @returns The envelope struct.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function envelope(dataStruct: Struct<any>): Struct<any> {
  return looseObject({ data: dataStruct });
}

// === SERVICE DEFINITION ===

export class TransakService extends BaseDataService<
  typeof serviceName,
  TransakServiceMessenger
> {
  readonly #fetch: typeof fetch;

  readonly #environment: TransakEnvironment;

  readonly #context: string;

  readonly #orderRetryDelayMs: number;

  #apiKey: string | null = null;

  #accessToken: TransakAccessToken | null = null;

  /**
   * Optional ramps API base URL override for local development (mirrors
   * `RampsService`'s `baseUrlOverride`). Applies to the requests this service
   * sends to the ramps API (orders, widget-url proxy), not to direct Transak
   * API calls.
   */
  readonly #rampsApiBaseUrlOverride?: string;

  /**
   * Identifies the client to Transak in `widgetParams` (e.g. the mobile app's
   * package name / bundle id). Defaults to `metamask.io`.
   */
  readonly #referrerDomain: string;

  readonly #clientIdentity: RampsClientIdentity;

  constructor({
    messenger,
    environment = TransakEnvironment.Staging,
    context,
    fetch: fetchFunction,
    apiKey,
    policyOptions,
    orderRetryDelayMs = 2000,
    rampsApiBaseUrlOverride,
    referrerDomain = TRANSAK_REFERRER_DOMAIN,
    clientProduct,
    clientVersion,
  }: {
    messenger: TransakServiceMessenger;
    environment?: TransakEnvironment;
    context: string;
    fetch: typeof fetch;
    apiKey?: string;
    policyOptions?: CreateServicePolicyOptions;
    orderRetryDelayMs?: number;
    rampsApiBaseUrlOverride?: string;
    referrerDomain?: string;
    clientProduct?: string;
    clientVersion?: string;
  }) {
    super({ name: serviceName, messenger, policyOptions });
    this.#fetch = fetchFunction;
    this.#environment = environment;
    this.#context = context;
    this.#apiKey = apiKey ?? null;
    this.#orderRetryDelayMs = orderRetryDelayMs;
    this.#rampsApiBaseUrlOverride = rampsApiBaseUrlOverride;
    this.#referrerDomain = referrerDomain;
    this.#clientIdentity = {
      clientProduct,
      clientVersion,
    };

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  setApiKey(apiKey: string): void {
    this.#apiKey = apiKey;
  }

  getApiKey(): string | null {
    return this.#apiKey;
  }

  #ensureApiKey(): string {
    if (!this.#apiKey) {
      throw new Error('Transak API key is required but not set.');
    }
    return this.#apiKey;
  }

  setAccessToken(token: TransakAccessToken): void {
    this.#accessToken = token;
  }

  getAccessToken(): TransakAccessToken | null {
    return this.#accessToken;
  }

  clearAccessToken(): void {
    this.#accessToken = null;
  }

  #ensureAccessToken(): void {
    if (!this.#accessToken?.accessToken) {
      throw new HttpError(
        401,
        'Authentication required. Please log in to continue.',
      );
    }

    const createdTime = new Date(this.#accessToken.created).getTime();
    const tokenAgeMs = Date.now() - createdTime;
    if (tokenAgeMs > this.#accessToken.ttl * 1000) {
      this.clearAccessToken();
      throw new HttpError(
        401,
        'Authentication token has expired. Please log in again.',
      );
    }
  }

  #getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.#accessToken?.accessToken) {
      headers.authorization = this.#accessToken.accessToken;
    }
    return headers;
  }

  async #throwTransakApiError(
    fetchResponse: Response,
    url: URL,
  ): Promise<never> {
    let errorBody = '';
    let errorCode: string | undefined;
    let apiMessage: string | undefined;
    try {
      errorBody = await fetchResponse.text();
      const parsed = JSON.parse(errorBody) as {
        error?: {
          code?: string;
          errorCode?: string | number;
          message?: string;
        };
      };
      errorCode =
        parsed?.error?.code ??
        (parsed?.error?.errorCode !== null &&
        parsed?.error?.errorCode !== undefined
          ? String(parsed.error.errorCode)
          : undefined);
      apiMessage =
        typeof parsed?.error?.message === 'string'
          ? parsed.error.message
          : undefined;
    } catch {
      // ignore body read/parse failures
    }
    throw new TransakApiError(
      fetchResponse.status,
      `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'${errorBody ? `: ${errorBody}` : ''}`,
      errorCode,
      apiMessage,
    );
  }

  /**
   * Identifies the current login session without exposing the access token,
   * so reads made under different sessions never share a request.
   *
   * @returns The access token creation time in milliseconds, or `null` when
   * logged out.
   */
  #getSessionId(): number | null {
    return this.#accessToken
      ? new Date(this.#accessToken.created).getTime()
      : null;
  }

  async #transakGet<Data>(
    queryName: string,
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataStruct: Struct<any>,
    params?: Record<string, string>,
  ): Promise<Data> {
    const baseUrl = getTransakApiBaseUrl(this.#environment);
    const url = new URL(path, baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    const apiKey = this.#ensureApiKey();
    url.searchParams.set('apiKey', apiKey);

    const response = (await this.fetchQuery({
      // The API key is deliberately left out of the key, as keys appear in the
      // names of published `cacheUpdated` events.
      queryKey: [
        `${this.name}:${queryName}`,
        params ?? {},
        this.#getSessionId(),
      ],
      staleTime: 0,
      gcTime: 0,
      responseStruct: envelope(dataStruct),
      queryFn: async () => {
        const fetchResponse = await this.#fetch(url.toString(), {
          method: 'GET',
          headers: this.#getHeaders(),
        });
        if (!fetchResponse.ok) {
          await this.#throwTransakApiError(fetchResponse, url);
        }
        return (await fetchResponse.json()) as Json;
      },
    })) as { data: Data };

    return response.data;
  }

  /**
   * Sends a request that changes server side data. Mutations are never
   * retried, and the mutation key holds only the method name, as keys appear
   * in the names of published `cacheUpdated` events.
   *
   * @param options - The options.
   * @param options.mutationName - The name of the public method.
   * @param options.url - The request URL.
   * @param options.init - The request method, headers and body.
   * @param options.responseStruct - The struct for the response body. When
   * omitted, the response body is ignored.
   * @returns The validated response body, or `null` if it was ignored.
   */
  async #sendMutation({
    mutationName,
    url,
    init,
    responseStruct,
  }: {
    mutationName: string;
    url: URL;
    init: RequestInit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responseStruct?: Struct<any>;
  }): Promise<unknown> {
    return (await this.executeMutation({
      mutationKey: [`${this.name}:${mutationName}`],
      gcTime: 0,
      responseStruct,
      mutationFn: async () => {
        const fetchResponse = await this.#fetch(url.toString(), init);
        if (!fetchResponse.ok) {
          await this.#throwTransakApiError(fetchResponse, url);
        }
        return responseStruct ? ((await fetchResponse.json()) as Json) : null;
      },
    })) as unknown;
  }

  async #transakPost<Data>(
    mutationName: string,
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataStruct: Struct<any>,
    body?: Record<string, unknown>,
  ): Promise<Data> {
    const apiKey = this.#ensureApiKey();
    const baseUrl = getTransakApiBaseUrl(this.#environment);
    const url = new URL(path, baseUrl);

    const response = (await this.#sendMutation({
      mutationName,
      url,
      init: {
        method: 'POST',
        headers: this.#getHeaders(),
        body: JSON.stringify({ ...(body ?? {}), apiKey }),
      },
      responseStruct: envelope(dataStruct),
    })) as { data: Data };

    return response.data;
  }

  async #transakPatch<Data>(
    mutationName: string,
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataStruct: Struct<any>,
    body: Record<string, unknown>,
  ): Promise<Data> {
    const apiKey = this.#ensureApiKey();
    const baseUrl = getTransakApiBaseUrl(this.#environment);
    const url = new URL(path, baseUrl);
    url.searchParams.set('apiKey', apiKey);

    const response = (await this.#sendMutation({
      mutationName,
      url,
      init: {
        method: 'PATCH',
        headers: this.#getHeaders(),
        body: JSON.stringify(body),
      },
      responseStruct: envelope(dataStruct),
    })) as { data: Data };

    return response.data;
  }

  async #transakDelete(
    mutationName: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<void> {
    const apiKey = this.#ensureApiKey();
    const baseUrl = getTransakApiBaseUrl(this.#environment);
    const url = new URL(path, baseUrl);
    url.searchParams.set('apiKey', apiKey);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    await this.#sendMutation({
      mutationName,
      url,
      init: { method: 'DELETE', headers: this.#getHeaders() },
    });
  }

  /**
   * Gets the ramps API base URL, respecting the local-development override
   * when set (same semantics as `RampsService`'s `baseUrlOverride`).
   *
   * @returns The ramps API base URL to use.
   */
  #getRampsApiBaseUrl(): string {
    return this.#rampsApiBaseUrlOverride ?? getRampsBaseUrl(this.#environment);
  }

  /**
   * Adds the common request parameters to a ramps API proxy URL, mirroring
   * `RampsService`'s `#addCommonParams`.
   *
   * @param url - The URL to add parameters to.
   */
  #addRampsCommonParams(url: URL): void {
    url.searchParams.set('action', 'deposit');
    url.searchParams.set('sdk', RAMPS_SDK_VERSION);
    url.searchParams.set('controller', packageJson.version);
    url.searchParams.set('context', this.#context);
    // In the query string (not headers) so CDN-cached responses vary per
    // client product / version.
    addRampsClientIdentityParams(url, this.#clientIdentity);
  }

  async #ordersApiGet<Data>(
    queryName: string,
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataStruct: Struct<any>,
    params?: Record<string, string>,
  ): Promise<Data> {
    const baseUrl = this.#getRampsApiBaseUrl();
    const providerPath = getRampsProviderPath(this.#environment);
    const url = new URL(`${providerPath}${path}`, baseUrl);

    url.searchParams.set('action', 'deposit');
    url.searchParams.set('context', this.#context);
    // In the query string (not headers) so CDN-cached responses vary per
    // client product / version.
    addRampsClientIdentityParams(url, this.#clientIdentity);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    return (await this.fetchQuery({
      queryKey: [`${this.name}:${queryName}`, path, params ?? {}],
      staleTime: 0,
      gcTime: 0,
      responseStruct: dataStruct,
      queryFn: async () => {
        const fetchResponse = await this.#fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!fetchResponse.ok) {
          throw new HttpError(
            fetchResponse.status,
            `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
          );
        }
        return (await fetchResponse.json()) as Json;
      },
    })) as Data;
  }

  // === PUBLIC API METHODS ===

  async sendUserOtp(email: string): Promise<{
    isTncAccepted: boolean;
    stateToken: string;
    email: string;
    expiresIn: number;
  }> {
    const result = await this.#transakPost<{
      isTncAccepted: boolean;
      stateToken: string;
      email: string;
      expiresIn: number;
    }>('sendUserOtp', '/api/v2/auth/login', SendUserOtpResponseStruct, {
      email,
    });
    return result;
  }

  async verifyUserOtp(
    email: string,
    verificationCode: string,
    stateToken: string,
  ): Promise<TransakAccessToken> {
    const responseData = await this.#transakPost<{
      accessToken: string;
      ttl: number;
      created: string;
    }>('verifyUserOtp', '/api/v2/auth/verify', VerifyUserOtpResponseStruct, {
      email,
      otp: verificationCode,
      stateToken,
    });

    const accessToken: TransakAccessToken = {
      accessToken: responseData.accessToken,
      ttl: responseData.ttl,
      created: new Date(responseData.created),
    };

    this.setAccessToken(accessToken);
    return accessToken;
  }

  async logout(): Promise<string> {
    this.#ensureAccessToken();
    try {
      const result = await this.#transakPost<string>(
        'logout',
        '/api/v1/auth/logout',
        string(),
      );
      this.clearAccessToken();
      return result;
    } catch (error) {
      if (error instanceof HttpError && error.httpStatus === 401) {
        this.clearAccessToken();
        return 'user was already logged out';
      }
      throw error;
    }
  }

  async getUserDetails(): Promise<TransakUserDetails> {
    this.#ensureAccessToken();
    return this.#transakGet<TransakUserDetails>(
      'getUserDetails',
      '/api/v2/user/',
      UserDetailsStruct,
    );
  }

  async getBuyQuote(
    genericFiatCurrency: string,
    genericCryptoCurrency: string,
    genericNetwork: string,
    genericPaymentMethod: string,
    fiatAmount: string,
    isFeeExcludedFromFiat = true,
  ): Promise<TransakBuyQuote> {
    const normalizedPaymentMethod = normalizePaymentMethodForTranslation(
      genericPaymentMethod || undefined,
    );
    const translationRequest = {
      cryptoCurrencyId: genericCryptoCurrency,
      chainId: genericNetwork,
      fiatCurrencyId: genericFiatCurrency,
      paymentMethod: normalizedPaymentMethod,
    };

    const translation = await this.getTranslation(translationRequest);

    const params: Record<string, string> = {
      fiatCurrency: translation.fiatCurrency,
      cryptoCurrency: translation.cryptoCurrency,
      isBuyOrSell: 'BUY',
      network: translation.network,
      fiatAmount,
    };

    if (isFeeExcludedFromFiat) {
      params.isFeeExcludedFromFiat = 'true';
    }

    if (translation.paymentMethod) {
      params.paymentMethod = translation.paymentMethod;
    }

    const quote = await this.#transakGet<
      Omit<TransakBuyQuote, 'requestedAssetId' | 'requestedChainId'>
    >('getBuyQuote', '/api/v2/lookup/quotes', BuyQuoteStruct, params);

    return {
      ...quote,
      requestedAssetId: genericCryptoCurrency,
      requestedChainId: genericNetwork,
    };
  }

  async getKycRequirement(quoteId: string): Promise<TransakKycRequirement> {
    this.#ensureAccessToken();
    const result = await this.#transakGet<TransakKycRequirement>(
      'getKycRequirement',
      '/api/v2/kyc/requirement',
      KycRequirementStruct,
      {
        'metadata[quoteId]': quoteId,
      },
    );
    return result;
  }

  async getAdditionalRequirements(
    quoteId: string,
  ): Promise<TransakAdditionalRequirementsResponse> {
    this.#ensureAccessToken();
    return this.#transakGet<TransakAdditionalRequirementsResponse>(
      'getAdditionalRequirements',
      '/api/v2/kyc/additional-requirements',
      AdditionalRequirementsStruct,
      { 'metadata[quoteId]': quoteId },
    );
  }

  async createOrder(
    quoteId: string,
    walletAddress: string,
    paymentMethodId: string,
  ): Promise<TransakDepositOrder> {
    this.#ensureAccessToken();

    const normalizedPaymentMethod =
      normalizePaymentMethodForTranslation(paymentMethodId);
    const translation = await this.getTranslation({
      paymentMethod: normalizedPaymentMethod,
    });

    const paymentInstrumentId =
      translation.paymentMethod ?? normalizedPaymentMethod;

    try {
      const transakOrder = await this.#transakPost<TransakOrder>(
        'createOrder',
        '/api/v2/orders',
        TransakOrderStruct,
        {
          quoteId,
          walletAddress,
          paymentInstrumentId,
        },
      );

      const depositOrderId =
        TransakOrderIdTransformer.transakOrderIdToDepositOrderId(
          transakOrder.orderId,
          this.#environment,
        );

      return this.getOrder(
        depositOrderId,
        transakOrder.walletAddress,
        transakOrder.paymentDetails,
      );
    } catch (error) {
      if (
        error instanceof TransakApiError &&
        error.httpStatus === 409 &&
        error.errorCode === TRANSAK_ERROR_CODES.ORDER_EXISTS
      ) {
        await this.cancelAllActiveOrders();
        await new Promise((resolve) =>
          setTimeout(resolve, this.#orderRetryDelayMs),
        );

        const retryOrder = await this.#transakPost<TransakOrder>(
          'createOrder',
          '/api/v2/orders',
          TransakOrderStruct,
          {
            quoteId,
            walletAddress,
            paymentInstrumentId,
          },
        );

        const retryDepositOrderId =
          TransakOrderIdTransformer.transakOrderIdToDepositOrderId(
            retryOrder.orderId,
            this.#environment,
          );

        return this.getOrder(
          retryDepositOrderId,
          retryOrder.walletAddress,
          retryOrder.paymentDetails,
        );
      }
      throw error;
    }
  }

  async getOrder(
    orderId: string,
    wallet: string,
    paymentDetails?: TransakOrderPaymentMethod[],
  ): Promise<TransakDepositOrder> {
    let depositOrderId: string;
    if (TransakOrderIdTransformer.isDepositOrderId(orderId)) {
      depositOrderId = orderId;
    } else {
      depositOrderId = TransakOrderIdTransformer.transakOrderIdToDepositOrderId(
        orderId,
        this.#environment,
      );
    }

    const transakOrderId =
      TransakOrderIdTransformer.extractTransakOrderId(depositOrderId);

    const order = await this.#ordersApiGet<TransakDepositOrder>(
      'getOrder',
      `/orders/${transakOrderId}`,
      DepositOrderStruct,
      { wallet },
    );

    const orderWithId = {
      ...order,
      id: depositOrderId,
      orderType: 'DEPOSIT' as const,
    };

    if (paymentDetails && paymentDetails.length > 0) {
      return { ...orderWithId, paymentDetails };
    }

    if (this.#accessToken?.accessToken) {
      try {
        const transakOrder = await this.#transakGet<TransakOrder>(
          'getOrderPaymentDetails',
          `/api/v2/orders/${transakOrderId}`,
          TransakOrderStruct,
        );
        return { ...orderWithId, paymentDetails: transakOrder.paymentDetails };
      } catch {
        return orderWithId;
      }
    }

    return orderWithId;
  }

  async getUserLimits(
    fiatCurrency: string,
    paymentMethod: string,
    kycType: string,
  ): Promise<TransakUserLimits> {
    this.#ensureAccessToken();

    const translation = await this.getTranslation({
      paymentMethod: normalizePaymentMethodForTranslation(paymentMethod),
    });

    const params: Record<string, string> = {
      isBuyOrSell: 'BUY',
      kycType,
      fiatCurrency,
    };

    if (translation.paymentMethod) {
      params.paymentCategory = translation.paymentMethod;
    }

    return this.#transakGet<TransakUserLimits>(
      'getUserLimits',
      '/api/v2/orders/user-limit',
      UserLimitsStruct,
      params,
    );
  }

  /**
   * @deprecated Use {@link createWidgetUrl} instead. The OTT flow requires the
   * partner API key on the client and Transak is deprecating `request-ott`.
   * @returns The one-time token response.
   */
  async requestOtt(): Promise<TransakOttResponse> {
    this.#ensureAccessToken();
    const result = await this.#transakPost<TransakOttResponse>(
      'requestOtt',
      '/api/v2/auth/request-ott',
      OttStruct,
    );
    return result;
  }

  /**
   * @deprecated Use {@link createWidgetUrl} instead. This builds the widget
   * URL client-side and embeds the partner API key in it.
   * @param ottToken - The one-time token for widget authentication.
   * @param quote - The buy quote to pre-fill in the widget.
   * @param walletAddress - The destination wallet address.
   * @param extraParams - Optional additional URL parameters.
   * @returns The fully constructed widget URL string.
   */
  generatePaymentWidgetUrl(
    ottToken: string,
    quote: TransakBuyQuote,
    walletAddress: string,
    extraParams?: Record<string, string>,
  ): string {
    const apiKey = this.#ensureApiKey();
    const widgetBaseUrl = getPaymentWidgetBaseUrl(this.#environment);

    const defaultParams: Record<string, string> = {
      apiKey,
      ott: ottToken,
      fiatCurrency: quote.fiatCurrency,
      cryptoCurrencyCode: quote.cryptoCurrency,
      productsAvailed: 'BUY',
      fiatAmount: quote.fiatAmount.toString(),
      network: quote.network,
      hideExchangeScreen: 'true',
      walletAddress,
      disableWalletAddressForm: 'true',
      paymentMethod: quote.paymentMethod,
      redirectURL:
        'https://on-ramp-content.api.cx.metamask.io/regions/fake-callback',
      hideMenu: 'true',
    };

    const params = new URLSearchParams({
      ...defaultParams,
      ...extraParams,
    });

    const widgetUrl = new URL(widgetBaseUrl);
    widgetUrl.search = params.toString();
    return widgetUrl.toString();
  }

  /**
   * Creates a Transak payment widget URL through the ramps API proxy
   * (`POST {rampsBaseUrl}/providers/{providerId}/widget-url`). The proxy
   * injects the partner API key and derives the user IP server-side, so
   * neither leaves the backend. Replaces the OTT flow ({@link requestOtt} +
   * {@link generatePaymentWidgetUrl}).
   *
   * Requires both a Transak access token (user must be logged in to Transak)
   * and a MetaMask bearer token from `AuthenticationController`.
   *
   * @param quote - The buy quote to pre-fill in the widget.
   * @param walletAddress - The destination wallet address.
   * @param extraParams - Optional additional widget parameters (e.g. theming).
   * Keys must be on the proxy's allowlist or the request is rejected.
   * @returns The single-use widget URL (expires after 5 minutes).
   */
  async createWidgetUrl(
    quote: TransakBuyQuote,
    walletAddress: string,
    extraParams?: Record<string, string>,
  ): Promise<string> {
    this.#ensureAccessToken();
    const bearerToken = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );

    const baseUrl = this.#getRampsApiBaseUrl();
    const providerPath = getRampsProviderPath(this.#environment);
    const url = new URL(`${providerPath}/widget-url`, baseUrl);

    this.#addRampsCommonParams(url);

    const widgetParams: Record<string, string | number> = {
      referrerDomain: this.#referrerDomain,
      fiatCurrency: quote.fiatCurrency,
      cryptoCurrencyCode: quote.cryptoCurrency,
      fiatAmount: quote.fiatAmount,
      network: quote.network,
      paymentMethod: quote.paymentMethod,
      walletAddress,
      hideExchangeScreen: 'true',
      disableWalletAddressEdit: 'true',
      hideMenu: 'true',
      redirectURL:
        'https://on-ramp-content.api.cx.metamask.io/regions/fake-callback',
      ...extraParams,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    };
    if (this.#accessToken?.accessToken) {
      headers['x-transak-access-token'] = this.#accessToken.accessToken;
    }

    const response = (await this.#sendMutation({
      mutationName: 'createWidgetUrl',
      url,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify({ widgetParams }),
      },
      responseStruct: WidgetUrlResponseStruct,
    })) as { widgetUrl: string };

    return response.widgetUrl;
  }

  async submitPurposeOfUsageForm(purpose: string[]): Promise<void> {
    this.#ensureAccessToken();
    await this.#transakPost(
      'submitPurposeOfUsageForm',
      '/api/v2/kyc/purpose-of-usage',
      any(),
      { purposeList: purpose },
    );
  }

  async patchUser(data: PatchUserRequestBody): Promise<unknown> {
    this.#ensureAccessToken();
    return this.#transakPatch('patchUser', '/api/v2/kyc/user', any(), data);
  }

  async submitSsnDetails(ssn: string, quoteId: string): Promise<unknown> {
    this.#ensureAccessToken();
    return this.#transakPost('submitSsnDetails', '/api/v2/kyc/ssn', any(), {
      ssn,
      quoteId,
    });
  }

  async confirmPayment(
    orderId: string,
    paymentMethodId: string,
  ): Promise<{ success: boolean }> {
    this.#ensureAccessToken();

    const normalizedPaymentMethod =
      normalizePaymentMethodForTranslation(paymentMethodId);
    const translation = await this.getTranslation({
      paymentMethod: normalizedPaymentMethod,
    });

    const transakOrderId =
      TransakOrderIdTransformer.extractTransakOrderId(orderId);

    return this.#transakPost<{ success: boolean }>(
      'confirmPayment',
      '/api/v2/orders/payment-confirmation',
      PaymentConfirmationStruct,
      {
        orderId: transakOrderId,
        paymentMethod: translation.paymentMethod ?? normalizedPaymentMethod,
      },
    );
  }

  async getTranslation(
    translationRequest: TransakTranslationRequest,
  ): Promise<TransakQuoteTranslation> {
    const baseUrl = getRampsBaseUrl(this.#environment);
    const providerPath = getRampsProviderPath(this.#environment);
    const url = new URL(`${providerPath}/native/translate`, baseUrl);

    url.searchParams.set('action', 'deposit');
    url.searchParams.set('context', this.#context);

    const normalizedRequest = {
      ...translationRequest,
      paymentMethod: normalizePaymentMethodForTranslation(
        translationRequest.paymentMethod,
      ),
    };

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(normalizedRequest)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
        params[key] = value;
      }
    }

    return (await this.fetchQuery({
      queryKey: [`${this.name}:getTranslation`, params],
      staleTime: 0,
      gcTime: 0,
      responseStruct: TranslationStruct,
      queryFn: async () => {
        const fetchResponse = await this.#fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!fetchResponse.ok) {
          throw new HttpError(
            fetchResponse.status,
            `Fetching '${url.toString()}' failed with status '${fetchResponse.status}'`,
          );
        }
        return (await fetchResponse.json()) as Json;
      },
    })) as TransakQuoteTranslation;
  }

  async getIdProofStatus(workFlowRunId: string): Promise<TransakIdProofStatus> {
    this.#ensureAccessToken();
    return this.#transakGet<TransakIdProofStatus>(
      'getIdProofStatus',
      '/api/v2/kyc/id-proof-status',
      IdProofStatusStruct,
      { workFlowRunId },
    );
  }

  async cancelOrder(depositOrderId: string): Promise<void> {
    this.#ensureAccessToken();
    const transakOrderId =
      TransakOrderIdTransformer.extractTransakOrderId(depositOrderId);
    await this.#transakDelete(
      'cancelOrder',
      `/api/v2/orders/${transakOrderId}`,
      {
        cancelReason: 'Creating new order',
      },
    );
  }

  async cancelAllActiveOrders(): Promise<Error[]> {
    this.#ensureAccessToken();
    const activeOrders = await this.getActiveOrders();
    const errors: Error[] = [];

    await Promise.all(
      activeOrders.map(async (order) => {
        try {
          const depositOrderId =
            TransakOrderIdTransformer.transakOrderIdToDepositOrderId(
              order.orderId,
              this.#environment,
            );
          await this.cancelOrder(depositOrderId);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }),
    );

    return errors;
  }

  async getActiveOrders(): Promise<TransakOrder[]> {
    this.#ensureAccessToken();
    return this.#transakGet<TransakOrder[]>(
      'getActiveOrders',
      '/api/v2/active-orders',
      ActiveOrdersStruct,
    );
  }
}
