import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import {
  OnRampSdk,
  Environment,
  Context,
  RegionsService,
  OrdersService,
  Payment,
  CryptoCurrency,
  FiatCurrency,
  Provider,
  Limits,
  AllQuotesResponse,
  AllSellQuotesResponse,
  Order,
} from '@consensys/on-ramp-sdk';
import {
  NativeRampsSdk,
  Context as NativeContext,
  SdkEnvironment as NativeSdkEnvironment,
  type DepositRegion,
  type DepositCryptoCurrency,
  type DepositPaymentMethod,
  type NativeTransakAccessToken,
  type NativeTransakUserDetails,
  type BuyQuote,
  type IdProofStatus,
  type KycRequirement,
  type AdditionalRequirementsResponse,
  type PatchUserRequestBody,
  type Reservation,
  type DepositOrder,
  type OrderPaymentMethod,
  type UserLimits,
  type OttResponse,
  type GeolocationResponse,
  type NativeRampsSdkConfig,
  type TransakOrder,
  NativeQuoteTranslation,
  TranslationRequest,
} from '@consensys/native-ramps-sdk';

const controllerName = 'RampsController';

/**
 * Country support information
 */
export interface CountrySupport {
  buy: boolean;
  sell: boolean;
}

/**
 * State information for countries
 */
export interface State {
  id: string;
  name: string;
  emoji?: string;
  unsupported?: boolean; // deprecated - use support field instead
  support?: CountrySupport;
  recommended?: boolean;
  detected?: boolean;
  stateId?: string;
}

/**
 * Country information
 */
export interface Country {
  id: string;
  name: string;
  emoji: string;
  currencies: string[];
  unsupported?: boolean; // deprecated - use support field instead
  hidden?: boolean;
  states?: State[];
  support?: CountrySupport;
  recommended?: boolean;
  enableSell?: boolean;
  detected?: boolean;
}

/**
 * Ramps controller state
 */
export type RampsControllerState = Record<string, string>;

export type RampsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RampsControllerState
>;

export type RampsControllerGetCountriesAction = {
  type: `${typeof controllerName}:getCountries`;
  handler: RampsController['getCountries'];
};

export type RampsControllerGetSellCountriesAction = {
  type: `${typeof controllerName}:getSellCountries`;
  handler: RampsController['getSellCountries'];
};

export type RampsControllerGetPaymentMethodsAction = {
  type: `${typeof controllerName}:getPaymentMethods`;
  handler: RampsController['getPaymentMethods'];
};

export type RampsControllerGetPaymentMethodsForCryptoAction = {
  type: `${typeof controllerName}:getPaymentMethodsForCrypto`;
  handler: RampsController['getPaymentMethodsForCrypto'];
};

export type RampsControllerGetSellPaymentMethodsAction = {
  type: `${typeof controllerName}:getSellPaymentMethods`;
  handler: RampsController['getSellPaymentMethods'];
};

export type RampsControllerGetSellPaymentMethodsForCryptoAction = {
  type: `${typeof controllerName}:getSellPaymentMethodsForCrypto`;
  handler: RampsController['getSellPaymentMethodsForCrypto'];
};

export type RampsControllerGetCryptoCurrenciesAction = {
  type: `${typeof controllerName}:getCryptoCurrencies`;
  handler: RampsController['getCryptoCurrencies'];
};

export type RampsControllerGetSellCryptoCurrenciesAction = {
  type: `${typeof controllerName}:getSellCryptoCurrencies`;
  handler: RampsController['getSellCryptoCurrencies'];
};

export type RampsControllerGetCryptoCurrencyAction = {
  type: `${typeof controllerName}:getCryptoCurrency`;
  handler: RampsController['getCryptoCurrency'];
};

export type RampsControllerGetFiatCurrenciesAction = {
  type: `${typeof controllerName}:getFiatCurrencies`;
  handler: RampsController['getFiatCurrencies'];
};

export type RampsControllerGetSellFiatCurrenciesAction = {
  type: `${typeof controllerName}:getSellFiatCurrencies`;
  handler: RampsController['getSellFiatCurrencies'];
};

export type RampsControllerGetFiatCurrencyAction = {
  type: `${typeof controllerName}:getFiatCurrency`;
  handler: RampsController['getFiatCurrency'];
};

export type RampsControllerGetAllFiatCurrenciesAction = {
  type: `${typeof controllerName}:getAllFiatCurrencies`;
  handler: RampsController['getAllFiatCurrencies'];
};

export type RampsControllerGetAllCryptoCurrenciesAction = {
  type: `${typeof controllerName}:getAllCryptoCurrencies`;
  handler: RampsController['getAllCryptoCurrencies'];
};

export type RampsControllerGetNetworkDetailsAction = {
  type: `${typeof controllerName}:getNetworkDetails`;
  handler: RampsController['getNetworkDetails'];
};

export type RampsControllerGetLimitsAction = {
  type: `${typeof controllerName}:getLimits`;
  handler: RampsController['getLimits'];
};

export type RampsControllerGetSellLimitsAction = {
  type: `${typeof controllerName}:getSellLimits`;
  handler: RampsController['getSellLimits'];
};

export type RampsControllerGetQuotesAction = {
  type: `${typeof controllerName}:getQuotes`;
  handler: RampsController['getQuotes'];
};

export type RampsControllerGetSellQuotesAction = {
  type: `${typeof controllerName}:getSellQuotes`;
  handler: RampsController['getSellQuotes'];
};

export type RampsControllerGetOrderIdFromCallbackAction = {
  type: `${typeof controllerName}:getOrderIdFromCallback`;
  handler: RampsController['getOrderIdFromCallback'];
};

export type RampsControllerGetOrderFromCallbackAction = {
  type: `${typeof controllerName}:getOrderFromCallback`;
  handler: RampsController['getOrderFromCallback'];
};

export type RampsControllerGetSellOrderFromCallbackAction = {
  type: `${typeof controllerName}:getSellOrderFromCallback`;
  handler: RampsController['getSellOrderFromCallback'];
};

export type RampsControllerGetOrderAction = {
  type: `${typeof controllerName}:getOrder`;
  handler: RampsController['getOrder'];
};

export type RampsControllerGetSellOrderAction = {
  type: `${typeof controllerName}:getSellOrder`;
  handler: RampsController['getSellOrder'];
};

export type RampsControllerSubmitApplePayOrderAction = {
  type: `${typeof controllerName}:submitApplePayOrder`;
  handler: RampsController['submitApplePayOrder'];
};

export type RampsControllerGetProviderAction = {
  type: `${typeof controllerName}:getProvider`;
  handler: RampsController['getProvider'];
};

export type RampsControllerGetRecurringOrdersAction = {
  type: `${typeof controllerName}:getRecurringOrders`;
  handler: RampsController['getRecurringOrders'];
};

export type RampsControllerAddRedirectionListenerAction = {
  type: `${typeof controllerName}:addRedirectionListener`;
  handler: RampsController['addRedirectionListener'];
};

// Deposit (NativeRampsSdk) action types
export type RampsControllerDepositSetAccessTokenAction = {
  type: `${typeof controllerName}:depositSetAccessToken`;
  handler: RampsController['depositSetAccessToken'];
};
export type RampsControllerDepositGetAccessTokenAction = {
  type: `${typeof controllerName}:depositGetAccessToken`;
  handler: RampsController['depositGetAccessToken'];
};
export type RampsControllerDepositClearAccessTokenAction = {
  type: `${typeof controllerName}:depositClearAccessToken`;
  handler: RampsController['depositClearAccessToken'];
};
export type RampsControllerDepositGetVersionAction = {
  type: `${typeof controllerName}:depositGetVersion`;
  handler: RampsController['depositGetVersion'];
};
export type RampsControllerDepositGetContextAction = {
  type: `${typeof controllerName}:depositGetContext`;
  handler: RampsController['depositGetContext'];
};
export type RampsControllerDepositSendUserOtpAction = {
  type: `${typeof controllerName}:depositSendUserOtp`;
  handler: RampsController['depositSendUserOtp'];
};
export type RampsControllerDepositVerifyUserOtpAction = {
  type: `${typeof controllerName}:depositVerifyUserOtp`;
  handler: RampsController['depositVerifyUserOtp'];
};
export type RampsControllerDepositGetUserDetailsAction = {
  type: `${typeof controllerName}:depositGetUserDetails`;
  handler: RampsController['depositGetUserDetails'];
};
export type RampsControllerDepositGetBuyQuoteAction = {
  type: `${typeof controllerName}:depositGetBuyQuote`;
  handler: RampsController['depositGetBuyQuote'];
};
export type RampsControllerDepositGetIdProofStatusAction = {
  type: `${typeof controllerName}:depositGetIdProofStatus`;
  handler: RampsController['depositGetIdProofStatus'];
};
export type RampsControllerDepositGetKycRequirementAction = {
  type: `${typeof controllerName}:depositGetKycRequirement`;
  handler: RampsController['depositGetKycRequirement'];
};
export type RampsControllerDepositGetAdditionalRequirementsAction = {
  type: `${typeof controllerName}:depositGetAdditionalRequirements`;
  handler: RampsController['depositGetAdditionalRequirements'];
};
export type RampsControllerDepositPatchUserAction = {
  type: `${typeof controllerName}:depositPatchUser`;
  handler: RampsController['depositPatchUser'];
};
export type RampsControllerDepositSubmitPurposeOfUsageFormAction = {
  type: `${typeof controllerName}:depositSubmitPurposeOfUsageForm`;
  handler: RampsController['depositSubmitPurposeOfUsageForm'];
};
export type RampsControllerDepositSubmitSsnDetailsAction = {
  type: `${typeof controllerName}:depositSubmitSsnDetails`;
  handler: RampsController['depositSubmitSsnDetails'];
};
export type RampsControllerDepositCancelOrderAction = {
  type: `${typeof controllerName}:depositCancelOrder`;
  handler: RampsController['depositCancelOrder'];
};
export type RampsControllerDepositCancelAllActiveOrdersAction = {
  type: `${typeof controllerName}:depositCancelAllActiveOrders`;
  handler: RampsController['depositCancelAllActiveOrders'];
};
export type RampsControllerDepositCreateOrderAction = {
  type: `${typeof controllerName}:depositCreateOrder`;
  handler: RampsController['depositCreateOrder'];
};
export type RampsControllerDepositConfirmPaymentAction = {
  type: `${typeof controllerName}:depositConfirmPayment`;
  handler: RampsController['depositConfirmPayment'];
};
export type RampsControllerDepositGetOrderAction = {
  type: `${typeof controllerName}:depositGetOrder`;
  handler: RampsController['depositGetOrder'];
};
export type RampsControllerDepositGetUserLimitsAction = {
  type: `${typeof controllerName}:depositGetUserLimits`;
  handler: RampsController['depositGetUserLimits'];
};
export type RampsControllerDepositRequestOttAction = {
  type: `${typeof controllerName}:depositRequestOtt`;
  handler: RampsController['depositRequestOtt'];
};
export type RampsControllerDepositGetGeolocationAction = {
  type: `${typeof controllerName}:depositGetGeolocation`;
  handler: RampsController['depositGetGeolocation'];
};
export type RampsControllerDepositGeneratePaymentWidgetUrlAction = {
  type: `${typeof controllerName}:depositGeneratePaymentWidgetUrl`;
  handler: RampsController['depositGeneratePaymentWidgetUrl'];
};
export type RampsControllerDepositGetActiveOrdersAction = {
  type: `${typeof controllerName}:depositGetActiveOrders`;
  handler: RampsController['depositGetActiveOrders'];
};
export type RampsControllerDepositGetOrdersHistoryAction = {
  type: `${typeof controllerName}:depositGetOrdersHistory`;
  handler: RampsController['depositGetOrdersHistory'];
};
export type RampsControllerDepositLogoutAction = {
  type: `${typeof controllerName}:depositLogout`;
  handler: RampsController['depositLogout'];
};
export type RampsControllerDepositGetCountriesAction = {
  type: `${typeof controllerName}:depositGetCountries`;
  handler: RampsController['depositGetCountries'];
};
export type RampsControllerDepositGetCryptoCurrenciesAction = {
  type: `${typeof controllerName}:depositGetCryptoCurrencies`;
  handler: RampsController['depositGetCryptoCurrencies'];
};
export type RampsControllerDepositGetPaymentMethodsAction = {
  type: `${typeof controllerName}:depositGetPaymentMethods`;
  handler: RampsController['depositGetPaymentMethods'];
};
export type RampsControllerDepositGetTransalationAction = {
  type: `${typeof controllerName}:depositGetTransalation`;
  handler: RampsController['depositGetTransalation'];
};

export type RampsControllerActions =
  | RampsControllerGetStateAction
  | RampsControllerGetCountriesAction
  | RampsControllerGetSellCountriesAction
  | RampsControllerGetPaymentMethodsAction
  | RampsControllerGetPaymentMethodsForCryptoAction
  | RampsControllerGetSellPaymentMethodsAction
  | RampsControllerGetSellPaymentMethodsForCryptoAction
  | RampsControllerGetCryptoCurrenciesAction
  | RampsControllerGetSellCryptoCurrenciesAction
  | RampsControllerGetCryptoCurrencyAction
  | RampsControllerGetFiatCurrenciesAction
  | RampsControllerGetSellFiatCurrenciesAction
  | RampsControllerGetFiatCurrencyAction
  | RampsControllerGetAllFiatCurrenciesAction
  | RampsControllerGetAllCryptoCurrenciesAction
  | RampsControllerGetNetworkDetailsAction
  | RampsControllerGetLimitsAction
  | RampsControllerGetSellLimitsAction
  | RampsControllerGetQuotesAction
  | RampsControllerGetSellQuotesAction
  | RampsControllerGetOrderIdFromCallbackAction
  | RampsControllerGetOrderFromCallbackAction
  | RampsControllerGetSellOrderFromCallbackAction
  | RampsControllerGetOrderAction
  | RampsControllerGetSellOrderAction
  | RampsControllerSubmitApplePayOrderAction
  | RampsControllerGetProviderAction
  | RampsControllerGetRecurringOrdersAction
  | RampsControllerAddRedirectionListenerAction
  // Deposit actions
  | RampsControllerDepositSetAccessTokenAction
  | RampsControllerDepositGetAccessTokenAction
  | RampsControllerDepositClearAccessTokenAction
  | RampsControllerDepositGetVersionAction
  | RampsControllerDepositGetContextAction
  | RampsControllerDepositSendUserOtpAction
  | RampsControllerDepositVerifyUserOtpAction
  | RampsControllerDepositGetUserDetailsAction
  | RampsControllerDepositGetBuyQuoteAction
  | RampsControllerDepositGetIdProofStatusAction
  | RampsControllerDepositGetKycRequirementAction
  | RampsControllerDepositGetAdditionalRequirementsAction
  | RampsControllerDepositPatchUserAction
  | RampsControllerDepositSubmitPurposeOfUsageFormAction
  | RampsControllerDepositSubmitSsnDetailsAction
  | RampsControllerDepositCancelOrderAction
  | RampsControllerDepositCancelAllActiveOrdersAction
  | RampsControllerDepositCreateOrderAction
  | RampsControllerDepositConfirmPaymentAction
  | RampsControllerDepositGetOrderAction
  | RampsControllerDepositGetUserLimitsAction
  | RampsControllerDepositRequestOttAction
  | RampsControllerDepositGetGeolocationAction
  | RampsControllerDepositGeneratePaymentWidgetUrlAction
  | RampsControllerDepositGetActiveOrdersAction
  | RampsControllerDepositGetOrdersHistoryAction
  | RampsControllerDepositLogoutAction
  | RampsControllerDepositGetCountriesAction
  | RampsControllerDepositGetCryptoCurrenciesAction
  | RampsControllerDepositGetPaymentMethodsAction
  | RampsControllerDepositGetTransalationAction;

export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

export type RampsControllerEvents = RampsControllerStateChangeEvent;

export type RampsControllerMessenger = Messenger<
  typeof controllerName,
  RampsControllerActions,
  RampsControllerEvents
>;

const rampsControllerMetadata = {
  metamaskEnvironment: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  context: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
};

const defaultState: RampsControllerState = {
  metamaskEnvironment: 'staging',
  context: Context.Browser,
};

export function getSdkEnvironment(metamaskEnvironment: string) {
  switch (metamaskEnvironment) {
    case 'production':
    case 'beta':
    case 'rc':
      return Environment.Production;

    case 'dev':
    case 'exp':
    case 'test':
    case 'e2e':
    default:
      return Environment.Staging;
  }
}

function getNativeSdkEnvironment(metamaskEnvironment: string) {
  switch (metamaskEnvironment) {
    case 'production':
    case 'beta':
    case 'rc':
      return NativeSdkEnvironment.Production;

    case 'dev':
    case 'exp':
    case 'test':
    case 'e2e':
    default:
      return NativeSdkEnvironment.Staging;
  }
}

/**
 * Controller that manages on-ramp and off-ramp operations.
 * The ramps controller is responsible for handling cryptocurrency purchase and sale operations.
 *
 */
export class RampsController extends BaseController<
  typeof controllerName,
  RampsControllerState,
  RampsControllerMessenger
> {
  readonly #sdk: OnRampSdk;
  readonly #nativeSdk: NativeRampsSdk;

  /**
   * Constructor for RampsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: RampsControllerMessenger;
    state?: Partial<RampsControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: rampsControllerMetadata,
      state: { ...defaultState, ...state } as RampsControllerState,
    });

    // Initialize the OnRampSDK
    const environment = state?.metamaskEnvironment ?? Environment.Staging;
    const context = state?.context ?? Context.Browser;
    this.#sdk = OnRampSdk.create(getSdkEnvironment(environment), context as Context);

    // Initialize the Native Ramps SDK
    const nativeEnv = getNativeSdkEnvironment(environment);
    // Map the shared context string into the native SDK enum
    const nativeContext = (context as unknown as string) as keyof typeof NativeContext;
    const nativeConfig: NativeRampsSdkConfig = {
      context: NativeContext[nativeContext] ?? NativeContext.Browser,
    };
    this.#nativeSdk = new NativeRampsSdk(nativeConfig, nativeEnv);

    this.#registerMessageHandlers();
  }

  /**
   * Helper method to get the cached regions service
   */
  async #getRegionsService(): Promise<RegionsService> {
    return this.#sdk.regions();
  }

  // Native Ramps SDK wrappers (prefixed with "deposit")

  depositSetAccessToken(accessToken: NativeTransakAccessToken | null): void {
    if (accessToken) {
      this.#nativeSdk.setAccessToken(accessToken);
    } else {
      this.#nativeSdk.clearAccessToken();
    }
  }

  depositGetAccessToken(): NativeTransakAccessToken | null {
    return this.#nativeSdk.getAccessToken();
  }

  depositClearAccessToken(): void {
    this.#nativeSdk.clearAccessToken();
  }

  depositGetVersion(): string {
    return this.#nativeSdk.getVersion();
  }

  depositGetContext(): NativeContext {
    return this.#nativeSdk.getContext();
  }

  async depositSendUserOtp(email: string): Promise<{ isTncAccepted: boolean; stateToken: string; email: string; expiresIn: number }>{
    return this.#nativeSdk.sendUserOtp(email);
  }

  async depositVerifyUserOtp(
    email: string,
    verificationCode: string,
    stateToken: string,
  ): Promise<NativeTransakAccessToken> {
    return this.#nativeSdk.verifyUserOtp(email, verificationCode, stateToken);
  }

  async depositGetUserDetails(): Promise<NativeTransakUserDetails> {
    return this.#nativeSdk.getUserDetails();
  }

  async depositGetBuyQuote(
    genericFiatCurrency: string,
    genericCryptoCurrency: string,
    genericNetwork: string,
    genericPaymentMethod: string,
    fiatAmount: string,
  ): Promise<BuyQuote> {
    return this.#nativeSdk.getBuyQuote(
      genericFiatCurrency,
      genericCryptoCurrency,
      genericNetwork,
      genericPaymentMethod,
      fiatAmount,
    );
  }

  async depositGetIdProofStatus(workFlowRunId: string): Promise<IdProofStatus> {
    return this.#nativeSdk.getIdProofStatus(workFlowRunId);
  }

  async depositGetKycRequirement(quoteId: string): Promise<KycRequirement> {
    return this.#nativeSdk.getKycRequirement(quoteId);
  }

  async depositGetAdditionalRequirements(quoteId: string): Promise<AdditionalRequirementsResponse> {
    return this.#nativeSdk.getAdditionalRequirements(quoteId);
  }

  async depositPatchUser(data: PatchUserRequestBody): Promise<any> {
    return this.#nativeSdk.patchUser(data);
  }

  async depositSubmitPurposeOfUsageForm(purpose: string[]): Promise<void> {
    return this.#nativeSdk.submitPurposeOfUsageForm(purpose);
  }

  async depositSubmitSsnDetails(params: { ssn: string; quoteId: string }): Promise<any> {
    return this.#nativeSdk.submitSsnDetails(params);
  }

  async depositCancelOrder(depositOrderId: string): Promise<void> {
    return this.#nativeSdk.cancelOrder(depositOrderId);
  }

  async depositCancelAllActiveOrders(): Promise<void> {
    return this.#nativeSdk.cancelAllActiveOrders();
  }

  async depositCreateOrder(
    quote: BuyQuote,
    walletAddress: string,
    paymentMethodId: string,
  ): Promise<DepositOrder> {
    return this.#nativeSdk.createOrder(quote, walletAddress, paymentMethodId);
  }

  async depositConfirmPayment(orderId: string, paymentMethodId: string): Promise<{ success: boolean }>{
    return this.#nativeSdk.confirmPayment(orderId, paymentMethodId);
  }

  async depositGetOrder(
    orderId: string,
    wallet: string,
    paymentDetails?: OrderPaymentMethod[],
    abortController?: AbortController,
  ): Promise<DepositOrder> {
    return this.#nativeSdk.getOrder(orderId, wallet, paymentDetails, abortController);
  }

  async depositGetUserLimits(
    fiatCurrency: string,
    paymentMethod: string,
    kycType: string,
  ): Promise<UserLimits> {
    return this.#nativeSdk.getUserLimits(fiatCurrency, paymentMethod, kycType);
  }

  async depositRequestOtt(): Promise<OttResponse> {
    return this.#nativeSdk.requestOtt();
  }

  async depositGetGeolocation(): Promise<GeolocationResponse> {
    return this.#nativeSdk.getGeolocation();
  }

  depositGeneratePaymentWidgetUrl(
    ottToken: string,
    quote: BuyQuote,
    walletAddress: string,
    extraParams?: Record<string, string>,
  ): string {
    return this.#nativeSdk.generatePaymentWidgetUrl(ottToken, quote, walletAddress, extraParams);
  }

  async depositGetActiveOrders(): Promise<TransakOrder[]> {
    return this.#nativeSdk.getActiveOrders();
  }

  async depositGetOrdersHistory(limit?: number, skip?: number): Promise<TransakOrder[]> {
    return this.#nativeSdk.getOrdersHistory(limit, skip);
  }

  async depositLogout(): Promise<string> {
    return this.#nativeSdk.logout();
  }

  async depositGetCountries(abortController?: AbortController): Promise<DepositRegion[]> {
    return this.#nativeSdk.getCountries(abortController);
  }

  async depositGetCryptoCurrencies(
    regionId: string,
    abortController?: AbortController,
  ): Promise<DepositCryptoCurrency[]> {
    return this.#nativeSdk.getCryptoCurrencies(regionId, abortController);
  }

  async depositGetPaymentMethods(
    regionId: string,
    cryptoCurrencyId: string,
    fiatCurrencyId: string,
    abortController?: AbortController,
  ): Promise<DepositPaymentMethod[]> {
    return this.#nativeSdk.getPaymentMethods(
      regionId,
      cryptoCurrencyId,
      fiatCurrencyId,
      abortController,
    );
  }

  async depositGetTransalation(
    translationRequest: TranslationRequest,
    abortController?: AbortController,
  ): Promise<NativeQuoteTranslation> {
    return this.#nativeSdk.getTransalation(translationRequest, abortController);
  }

  /**
   * Helper method to get the cached orders service
   */
  async #getOrdersService(): Promise<OrdersService> {
    return this.#sdk.orders();
  }

  /**
   * Get list of countries available for ramps.
   *
   * @returns A promise that resolves to an array of countries
   */
  async getCountries(): Promise<Country[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getCountries();
  }

  /**
   * Get list of countries available for sell operations.
   *
   * @returns A promise that resolves to an array of countries
   */
  async getSellCountries(): Promise<Country[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellCountries();
  }

  /**
   * Get payment methods for a region.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getPaymentMethods(
    regionId: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getPaymentMethods(regionId, abortController);
  }

  /**
   * Get payment methods for crypto transactions.
   *
   * @param regionId - The region ID
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getPaymentMethodsForCrypto(
    regionId: string,
    crypto: string,
    fiat: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getPaymentMethodsForCrypto(
      regionId,
      crypto,
      fiat,
      abortController,
    );
  }

  /**
   * Get sell payment methods for a region.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getSellPaymentMethods(
    regionId: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellPaymentMethods(regionId, abortController);
  }

  /**
   * Get sell payment methods for crypto.
   *
   * @param regionId - The region ID
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of payment methods
   */
  async getSellPaymentMethodsForCrypto(
    regionId: string,
    crypto: string,
    fiat: string,
    abortController?: AbortController,
  ): Promise<Payment[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellPaymentMethodsForCrypto(
      regionId,
      crypto,
      fiat,
      abortController,
    );
  }

  /**
   * Get crypto currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param fiatCurrencyId - Optional fiat currency ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of crypto currencies
   */
  async getCryptoCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    fiatCurrencyId?: string,
    abortController?: AbortController,
  ): Promise<CryptoCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getCryptoCurrencies(
      regionId,
      paymentMethodIds,
      fiatCurrencyId,
      abortController,
    );
  }

  /**
   * Get sell crypto currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param fiatCurrencyId - Optional fiat currency ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of crypto currencies
   */
  async getSellCryptoCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    fiatCurrencyId?: string,
    abortController?: AbortController,
  ): Promise<CryptoCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellCryptoCurrencies(
      regionId,
      paymentMethodIds,
      fiatCurrencyId,
      abortController,
    );
  }

  /**
   * Get a specific crypto currency.
   *
   * @param regionId - The region ID
   * @param cryptoId - The crypto currency ID
   * @returns A promise that resolves to a crypto currency
   */
  async getCryptoCurrency(
    regionId: string,
    cryptoId: string,
  ): Promise<CryptoCurrency> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getCryptoCurrency(regionId, cryptoId);
  }

  /**
   * Get fiat currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of fiat currencies
   */
  async getFiatCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    abortController?: AbortController,
  ): Promise<FiatCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getFiatCurrencies(
      regionId,
      paymentMethodIds,
      abortController,
    );
  }

  /**
   * Get sell fiat currencies.
   *
   * @param regionId - The region ID
   * @param paymentMethodIds - Array of payment method IDs
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of fiat currencies
   */
  async getSellFiatCurrencies(
    regionId: string,
    paymentMethodIds: string[],
    abortController?: AbortController,
  ): Promise<FiatCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellFiatCurrencies(
      regionId,
      paymentMethodIds,
      abortController,
    );
  }

  /**
   * Get a specific fiat currency.
   *
   * @param regionId - The region ID
   * @param fiatId - The fiat currency ID
   * @returns A promise that resolves to a fiat currency
   */
  async getFiatCurrency(regionId: string, fiatId: string): Promise<FiatCurrency> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getFiatCurrency(regionId, fiatId);
  }

  /**
   * Get all fiat currencies.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of fiat currencies
   */
  async getAllFiatCurrencies(
    regionId: string,
    abortController?: AbortController,
  ): Promise<FiatCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getAllFiatCurrencies(regionId, abortController);
  }

  /**
   * Get all crypto currencies.
   *
   * @param regionId - The region ID
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to an array of crypto currencies
   */
  async getAllCryptoCurrencies(
    regionId: string,
    abortController?: AbortController,
  ): Promise<CryptoCurrency[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getAllCryptoCurrencies(regionId, abortController);
  }

  /**
   * Get network details.
   *
   * @returns A promise that resolves to an array of network details
   */
  async getNetworkDetails(): Promise<any[]> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getNetworkDetails();
  }

  /**
   * Get limits.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to limits
   */
  async getLimits(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
    abortController?: AbortController,
  ): Promise<Limits> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getLimits(
      regionId,
      paymentMethods,
      crypto,
      fiat,
      abortController,
    );
  }

  /**
   * Get sell limits.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @returns A promise that resolves to limits
   */
  async getSellLimits(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
  ): Promise<Limits> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellLimits(regionId, paymentMethods, crypto, fiat);
  }

  /**
   * Get quotes.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param amount - The amount
   * @param receiver - Optional receiver address
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to quotes
   */
  async getQuotes(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
    amount: number | string,
    receiver?: string,
    abortController?: AbortController,
  ): Promise<AllQuotesResponse> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getQuotes(
      regionId,
      paymentMethods,
      crypto,
      fiat,
      amount,
      receiver,
      abortController,
    );
  }

  /**
   * Get sell quotes.
   *
   * @param regionId - The region ID
   * @param paymentMethods - Array of payment method IDs
   * @param crypto - The crypto currency code
   * @param fiat - The fiat currency code
   * @param amount - The amount
   * @param receiver - Optional receiver address
   * @param abortController - Optional abort controller
   * @returns A promise that resolves to sell quotes
   */
  async getSellQuotes(
    regionId: string,
    paymentMethods: string[],
    crypto: string,
    fiat: string,
    amount: number | string,
    receiver?: string,
    abortController?: AbortController,
  ): Promise<AllSellQuotesResponse> {
    const regionsService = await this.#getRegionsService();
    return regionsService.getSellQuotes(
      regionId,
      paymentMethods,
      crypto,
      fiat,
      amount,
      receiver,
      abortController,
    );
  }

  // OrdersService wrapper methods

  /**
   * Get order ID from callback URL.
   *
   * @param providerId - The provider ID
   * @param redirectUrl - The redirect URL
   * @returns A promise that resolves to the order ID
   */
  async getOrderIdFromCallback(
    providerId: string,
    redirectUrl: string,
  ): Promise<string> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getOrderIdFromCallback(providerId, redirectUrl);
  }

  /**
   * Get order from callback URL.
   *
   * @param providerId - The provider ID
   * @param redirectUrl - The redirect URL
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the order
   */
  async getOrderFromCallback(
    providerId: string,
    redirectUrl: string,
    walletAddress: string,
  ): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getOrderFromCallback(
      providerId,
      redirectUrl,
      walletAddress,
    );
  }

  /**
   * Get sell order from callback URL.
   *
   * @param providerId - The provider ID
   * @param redirectUrl - The redirect URL
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the sell order
   */
  async getSellOrderFromCallback(
    providerId: string,
    redirectUrl: string,
    walletAddress: string,
  ): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getSellOrderFromCallback(
      providerId,
      redirectUrl,
      walletAddress,
    );
  }

  /**
   * Get order by ID.
   *
   * @param orderId - The order ID
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the order
   */
  async getOrder(orderId: string, walletAddress: string): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getOrder(orderId, walletAddress);
  }

  /**
   * Get sell order by ID.
   *
   * @param orderId - The order ID
   * @param walletAddress - The wallet address
   * @returns A promise that resolves to the sell order
   */
  async getSellOrder(orderId: string, walletAddress: string): Promise<Order> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getSellOrder(orderId, walletAddress);
  }

  /**
   * Submit Apple Pay order.
   *
   * @param dest - The destination address
   * @param providerId - The provider ID
   * @param payload - The Apple Pay payload
   * @returns A promise that resolves to the Apple Pay purchase result
   */
  async submitApplePayOrder(
    dest: string,
    providerId: string,
    payload: any,
  ): Promise<any> {
    const ordersService = await this.#getOrdersService();
    return ordersService.submitApplePayOrder(dest, providerId, payload);
  }

  /**
   * Get provider by ID.
   *
   * @param providerId - The provider ID
   * @returns A promise that resolves to the provider
   */
  async getProvider(providerId: string): Promise<Provider> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getProvider(providerId);
  }

  /**
   * Get recurring orders.
   *
   * @param orderId - The order ID
   * @param walletAddress - The wallet address
   * @param start - The start date
   * @param end - The end date
   * @returns A promise that resolves to the recurring orders
   */
  async getRecurringOrders(
    orderId: string,
    walletAddress: string,
    start: Date,
    end: Date,
  ): Promise<any> {
    const ordersService = await this.#getOrdersService();
    return ordersService.getRecurringOrders(orderId, walletAddress, start, end);
  }

  /**
   * Add redirection listener.
   *
   * @param callback - The callback function
   */
  addRedirectionListener(
    callback: (orderId: string) => void | Promise<void>,
  ): void {
    // Note: This method doesn't need async since it's synchronous
    this.#getOrdersService().then((ordersService) => {
      ordersService.addRedirectionListener(callback);
    });
  }

  /**
   * Registers message handlers for the RampsController.
   */
  #registerMessageHandlers() {
    // RegionsService methods
    this.messenger.registerActionHandler(
      `${controllerName}:getCountries`,
      this.getCountries.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellCountries`,
      this.getSellCountries.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getPaymentMethods`,
      this.getPaymentMethods.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getPaymentMethodsForCrypto`,
      this.getPaymentMethodsForCrypto.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellPaymentMethods`,
      this.getSellPaymentMethods.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellPaymentMethodsForCrypto`,
      this.getSellPaymentMethodsForCrypto.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getCryptoCurrencies`,
      this.getCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellCryptoCurrencies`,
      this.getSellCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getCryptoCurrency`,
      this.getCryptoCurrency.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getFiatCurrencies`,
      this.getFiatCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellFiatCurrencies`,
      this.getSellFiatCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getFiatCurrency`,
      this.getFiatCurrency.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getAllFiatCurrencies`,
      this.getAllFiatCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getAllCryptoCurrencies`,
      this.getAllCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getNetworkDetails`,
      this.getNetworkDetails.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getLimits`,
      this.getLimits.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellLimits`,
      this.getSellLimits.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getQuotes`,
      this.getQuotes.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellQuotes`,
      this.getSellQuotes.bind(this),
    );

    // OrdersService methods
    this.messenger.registerActionHandler(
      `${controllerName}:getOrderIdFromCallback`,
      this.getOrderIdFromCallback.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getOrderFromCallback`,
      this.getOrderFromCallback.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellOrderFromCallback`,
      this.getSellOrderFromCallback.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getOrder`,
      this.getOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getSellOrder`,
      this.getSellOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:submitApplePayOrder`,
      this.submitApplePayOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getProvider`,
      this.getProvider.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:getRecurringOrders`,
      this.getRecurringOrders.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:addRedirectionListener`,
      this.addRedirectionListener.bind(this),
    );

    // NativeRampsSdk (Deposit) methods
    this.messenger.registerActionHandler(
      `${controllerName}:depositSetAccessToken`,
      this.depositSetAccessToken.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetAccessToken`,
      this.depositGetAccessToken.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositClearAccessToken`,
      this.depositClearAccessToken.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetVersion`,
      this.depositGetVersion.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetContext`,
      this.depositGetContext.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositSendUserOtp`,
      this.depositSendUserOtp.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositVerifyUserOtp`,
      this.depositVerifyUserOtp.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetUserDetails`,
      this.depositGetUserDetails.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetBuyQuote`,
      this.depositGetBuyQuote.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetIdProofStatus`,
      this.depositGetIdProofStatus.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetKycRequirement`,
      this.depositGetKycRequirement.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetAdditionalRequirements`,
      this.depositGetAdditionalRequirements.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositPatchUser`,
      this.depositPatchUser.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositSubmitPurposeOfUsageForm`,
      this.depositSubmitPurposeOfUsageForm.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositSubmitSsnDetails`,
      this.depositSubmitSsnDetails.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositCancelOrder`,
      this.depositCancelOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositCancelAllActiveOrders`,
      this.depositCancelAllActiveOrders.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositCreateOrder`,
      this.depositCreateOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositConfirmPayment`,
      this.depositConfirmPayment.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetOrder`,
      this.depositGetOrder.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetUserLimits`,
      this.depositGetUserLimits.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositRequestOtt`,
      this.depositRequestOtt.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetGeolocation`,
      this.depositGetGeolocation.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGeneratePaymentWidgetUrl`,
      this.depositGeneratePaymentWidgetUrl.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetActiveOrders`,
      this.depositGetActiveOrders.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetOrdersHistory`,
      this.depositGetOrdersHistory.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositLogout`,
      this.depositLogout.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetCountries`,
      this.depositGetCountries.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetCryptoCurrencies`,
      this.depositGetCryptoCurrencies.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetPaymentMethods`,
      this.depositGetPaymentMethods.bind(this),
    );
    this.messenger.registerActionHandler(
      `${controllerName}:depositGetTransalation`,
      this.depositGetTransalation.bind(this),
    );
  }
}

export default RampsController;

