import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';

import type { TransakServiceMethodActions } from './TransakService-method-action-types';

// === PUSHER / WEBSOCKET TYPES ===

export type ChannelLike = {
  bind(event: string, callback: (data: unknown) => void): void;
  unbindAll(): void;
};

export type PusherLike = {
  subscribe(channelName: string): ChannelLike;
  unsubscribe(channelName: string): void;
  disconnect(): void;
};

export type PusherFactory = (
  key: string,
  options: { cluster: string },
) => PusherLike;

const TRANSAK_PUSHER_KEY = '1d9ffac87de599c61283';
const TRANSAK_PUSHER_CLUSTER = 'ap2';

const TRANSAK_WS_ORDER_EVENTS = [
  'ORDER_CREATED',
  'ORDER_PAYMENT_VERIFYING',
  'ORDER_PROCESSING',
  'ORDER_COMPLETED',
  'ORDER_FAILED',
] as const;

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
      environment === TransakEnvironment.Staging
        ? 'transak-native-staging'
        : 'transak-native';
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
  'submitPurposeOfUsageForm',
  'patchUser',
  'submitSsnDetails',
  'confirmPayment',
  'getTranslation',
  'getIdProofStatus',
  'cancelOrder',
  'cancelAllActiveOrders',
  'getActiveOrders',
  'subscribeToOrder',
  'unsubscribeFromOrder',
  'disconnectWebSocket',
] as const;

export type TransakServiceActions = TransakServiceMethodActions;

type AllowedActions = never;

export type TransakServiceOrderUpdateEvent = {
  type: `${typeof serviceName}:orderUpdate`;
  payload: [{ transakOrderId: string; status: string; eventType: string }];
};

export type TransakServiceEvents = TransakServiceOrderUpdateEvent;

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
 * If no mapping exists, the input is returned as-is (it may already be
 * in the deposit format).
 */
const RAMPS_TO_DEPOSIT_PAYMENT_METHOD: Record<string, string> = {
  '/payments/debit-credit-card': 'credit_debit_card',
  '/payments/apple-pay': 'apple_pay',
  '/payments/google-pay': 'google_pay',
  '/payments/sepa-bank-transfer': 'sepa_bank_transfer',
  '/payments/wire-transfer': 'wire_transfer',
  '/payments/gbp-bank-transfer': 'gbp_bank_transfer',
};

function normalizePaymentMethodForTranslation(
  paymentMethod: string | undefined,
): string | undefined {
  if (!paymentMethod) {
    return undefined;
  }
  return RAMPS_TO_DEPOSIT_PAYMENT_METHOD[paymentMethod] ?? paymentMethod;
}

function getTransakApiBaseUrl(environment: TransakEnvironment): string {
  switch (environment) {
    case TransakEnvironment.Production:
      return 'https://api-gateway.transak.com';
    case TransakEnvironment.Staging:
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
    default:
      throw new Error(`Invalid Transak environment: ${String(environment)}`);
  }
}

function getRampsProviderPath(environment: TransakEnvironment): string {
  const providerId =
    environment === TransakEnvironment.Staging
      ? TransakApiProviders.TransakNativeStaging
      : TransakApiProviders.TransakNative;
  return `/providers/${providerId}`;
}

function getPaymentWidgetBaseUrl(environment: TransakEnvironment): string {
  switch (environment) {
    case TransakEnvironment.Production:
      return 'https://global.transak.com';
    case TransakEnvironment.Staging:
      return 'https://global-stg.transak.com';
    default:
      throw new Error(`Invalid Transak environment: ${String(environment)}`);
  }
}

// === TRANSAK API ERROR ===

const TRANSAK_ORDER_EXISTS_CODE = '4005';

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

// === SERVICE DEFINITION ===

export class TransakService {
  readonly name: typeof serviceName;

  readonly #messenger: TransakServiceMessenger;

  readonly #fetch: typeof fetch;

  readonly #policy: ServicePolicy;

  readonly #environment: TransakEnvironment;

  readonly #context: string;

  readonly #orderRetryDelayMs: number;

  readonly #createPusher: PusherFactory | null;

  #pusher: PusherLike | null = null;

  readonly #subscribedChannels: Map<string, ChannelLike> = new Map();

  #apiKey: string | null = null;

  #accessToken: TransakAccessToken | null = null;

  constructor({
    messenger,
    environment = TransakEnvironment.Staging,
    context,
    fetch: fetchFunction,
    apiKey,
    policyOptions = {},
    orderRetryDelayMs = 2000,
    createPusher,
  }: {
    messenger: TransakServiceMessenger;
    environment?: TransakEnvironment;
    context: string;
    fetch: typeof fetch;
    apiKey?: string;
    policyOptions?: CreateServicePolicyOptions;
    orderRetryDelayMs?: number;
    createPusher?: PusherFactory;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);
    this.#environment = environment;
    this.#context = context;
    this.#apiKey = apiKey ?? null;
    this.#orderRetryDelayMs = orderRetryDelayMs;
    this.#createPusher = createPusher ?? null;

    this.#messenger.registerMethodActionHandlers(
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

  async #transakGet<ResponseType>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ResponseType> {
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

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url.toString(), {
        method: 'GET',
        headers: this.#getHeaders(),
      });
      if (!fetchResponse.ok) {
        await this.#throwTransakApiError(fetchResponse, url);
      }
      return fetchResponse.json() as Promise<{ data: ResponseType }>;
    });

    return response.data;
  }

  async #transakPost<ResponseType>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<ResponseType> {
    const apiKey = this.#ensureApiKey();
    const baseUrl = getTransakApiBaseUrl(this.#environment);
    const url = new URL(path, baseUrl);

    const requestBody = {
      ...(body ?? {}),
      apiKey,
    };

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url.toString(), {
        method: 'POST',
        headers: this.#getHeaders(),
        body: JSON.stringify(requestBody),
      });
      if (!fetchResponse.ok) {
        await this.#throwTransakApiError(fetchResponse, url);
      }
      return fetchResponse.json() as Promise<{ data: ResponseType }>;
    });

    return response.data;
  }

  async #transakPatch<ResponseType>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<ResponseType> {
    const apiKey = this.#ensureApiKey();
    const baseUrl = getTransakApiBaseUrl(this.#environment);
    const url = new URL(path, baseUrl);
    url.searchParams.set('apiKey', apiKey);

    const response = await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url.toString(), {
        method: 'PATCH',
        headers: this.#getHeaders(),
        body: JSON.stringify(body),
      });
      if (!fetchResponse.ok) {
        await this.#throwTransakApiError(fetchResponse, url);
      }
      return fetchResponse.json() as Promise<{ data: ResponseType }>;
    });

    return response.data;
  }

  async #transakDelete(
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

    await this.#policy.execute(async () => {
      const fetchResponse = await this.#fetch(url.toString(), {
        method: 'DELETE',
        headers: this.#getHeaders(),
      });
      if (!fetchResponse.ok) {
        await this.#throwTransakApiError(fetchResponse, url);
      }
    });
  }

  async #ordersApiGet<ResponseType>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ResponseType> {
    const baseUrl = getRampsBaseUrl(this.#environment);
    const providerPath = getRampsProviderPath(this.#environment);
    const url = new URL(`${providerPath}${path}`, baseUrl);

    url.searchParams.set('action', 'deposit');
    url.searchParams.set('context', this.#context);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await this.#policy.execute(async () => {
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
      return fetchResponse.json() as Promise<ResponseType>;
    });

    return response;
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
    }>('/api/v2/auth/login', { email });
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
    }>('/api/v2/auth/verify', {
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
      const result = await this.#transakPost<string>('/api/v1/auth/logout');
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
    return this.#transakGet<TransakUserDetails>('/api/v2/user/');
  }

  async getBuyQuote(
    genericFiatCurrency: string,
    genericCryptoCurrency: string,
    genericNetwork: string,
    genericPaymentMethod: string,
    fiatAmount: string,
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
      isFeeExcludedFromFiat: 'true',
    };

    if (translation.paymentMethod) {
      params.paymentMethod = translation.paymentMethod;
    }

    return this.#transakGet<TransakBuyQuote>('/api/v2/lookup/quotes', params);
  }

  async getKycRequirement(quoteId: string): Promise<TransakKycRequirement> {
    this.#ensureAccessToken();
    const result = await this.#transakGet<TransakKycRequirement>(
      '/api/v2/kyc/requirement',
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
      '/api/v2/kyc/additional-requirements',
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
        '/api/v2/orders',
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
        error.errorCode === TRANSAK_ORDER_EXISTS_CODE
      ) {
        await this.cancelAllActiveOrders();
        await new Promise((resolve) =>
          setTimeout(resolve, this.#orderRetryDelayMs),
        );

        const retryOrder = await this.#transakPost<TransakOrder>(
          '/api/v2/orders',
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
      `/orders/${transakOrderId}`,
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
          `/api/v2/orders/${transakOrderId}`,
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
      '/api/v2/orders/user-limit',
      params,
    );
  }

  async requestOtt(): Promise<TransakOttResponse> {
    this.#ensureAccessToken();
    const result = await this.#transakPost<TransakOttResponse>(
      '/api/v2/auth/request-ott',
    );
    return result;
  }

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

  async submitPurposeOfUsageForm(purpose: string[]): Promise<void> {
    this.#ensureAccessToken();
    await this.#transakPost('/api/v2/kyc/purpose-of-usage', {
      purposeList: purpose,
    });
  }

  async patchUser(data: PatchUserRequestBody): Promise<unknown> {
    this.#ensureAccessToken();
    return this.#transakPatch(
      '/api/v2/kyc/user',
      data as Record<string, unknown>,
    );
  }

  async submitSsnDetails(ssn: string, quoteId: string): Promise<unknown> {
    this.#ensureAccessToken();
    return this.#transakPost('/api/v2/kyc/ssn', { ssn, quoteId });
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
      '/api/v2/orders/payment-confirmation',
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

    for (const [key, value] of Object.entries(normalizedRequest)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.#policy.execute(async () => {
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
      return fetchResponse.json() as Promise<TransakQuoteTranslation>;
    });

    return response;
  }

  async getIdProofStatus(workFlowRunId: string): Promise<TransakIdProofStatus> {
    this.#ensureAccessToken();
    return this.#transakGet<TransakIdProofStatus>(
      '/api/v2/kyc/id-proof-status',
      { workFlowRunId },
    );
  }

  async cancelOrder(depositOrderId: string): Promise<void> {
    this.#ensureAccessToken();
    const transakOrderId =
      TransakOrderIdTransformer.extractTransakOrderId(depositOrderId);
    await this.#transakDelete(`/api/v2/orders/${transakOrderId}`, {
      cancelReason: 'Creating new order',
    });
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
    return this.#transakGet<TransakOrder[]>('/api/v2/active-orders');
  }

  // === WEBSOCKET METHODS ===

  #ensurePusher(): PusherLike {
    if (!this.#pusher) {
      this.#pusher = this.#createPusher!(TRANSAK_PUSHER_KEY, {
        cluster: TRANSAK_PUSHER_CLUSTER,
      });
    }
    return this.#pusher;
  }

  subscribeToOrder(transakOrderId: string): void {
    if (this.#subscribedChannels.has(transakOrderId)) {
      return;
    }

    if (!this.#createPusher) {
      return;
    }

    const pusher = this.#ensurePusher();
    const channel = pusher.subscribe(transakOrderId);

    for (const event of TRANSAK_WS_ORDER_EVENTS) {
      channel.bind(event, (data: unknown) => {
        const orderData = data as { status?: string } | undefined;
        this.#messenger.publish('TransakService:orderUpdate', {
          transakOrderId,
          status: orderData?.status ?? '',
          eventType: event,
        });
      });
    }

    this.#subscribedChannels.set(transakOrderId, channel);
  }

  unsubscribeFromOrder(transakOrderId: string): void {
    const channel = this.#subscribedChannels.get(transakOrderId);
    if (!channel) {
      return;
    }
    channel.unbindAll();
    this.#pusher?.unsubscribe(transakOrderId);
    this.#subscribedChannels.delete(transakOrderId);
  }

  disconnectWebSocket(): void {
    for (const [orderId, channel] of this.#subscribedChannels) {
      channel.unbindAll();
      this.#pusher?.unsubscribe(orderId);
    }
    this.#subscribedChannels.clear();
    this.#pusher?.disconnect();
    this.#pusher = null;
  }
}
