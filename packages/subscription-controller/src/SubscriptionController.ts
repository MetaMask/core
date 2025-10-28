import {
  type StateMetadata,
  type ControllerStateChangeEvent,
  type ControllerGetStateAction,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Hex } from '@metamask/utils';

import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  controllerName,
  DEFAULT_POLLING_INTERVAL,
  SubscriptionControllerErrorMessage,
} from './constants';
import type {
  BillingPortalResponse,
  GetCryptoApproveTransactionRequest,
  GetCryptoApproveTransactionResponse,
  ProductPrice,
  SubscriptionEligibility,
  StartCryptoSubscriptionRequest,
  SubmitUserEventRequest,
  TokenPaymentInfo,
  UpdatePaymentMethodCardResponse,
  UpdatePaymentMethodOpts,
  CachedLastSelectedPaymentMethod,
  SubmitSponsorshipIntentsMethodParams,
} from './types';
import {
  PAYMENT_TYPES,
  RECURRING_INTERVALS,
  type ISubscriptionService,
  type PricingResponse,
  type ProductType,
  type StartSubscriptionRequest,
  type Subscription,
} from './types';

export type SubscriptionControllerState = {
  customerId?: string;
  trialedProducts: ProductType[];
  subscriptions: Subscription[];
  pricing?: PricingResponse;

  /**
   * The last selected payment method for the user.
   * This is used to display the last selected payment method in the UI.
   * This state is also meant to be used internally to track the last selected payment method for the user. (e.g. for crypto subscriptions)
   */
  lastSelectedPaymentMethod?: Record<
    ProductType,
    CachedLastSelectedPaymentMethod
  >;
};

// Messenger Actions
export type SubscriptionControllerGetSubscriptionsAction = {
  type: `${typeof controllerName}:getSubscriptions`;
  handler: SubscriptionController['getSubscriptions'];
};
export type SubscriptionControllerGetSubscriptionByProductAction = {
  type: `${typeof controllerName}:getSubscriptionByProduct`;
  handler: SubscriptionController['getSubscriptionByProduct'];
};
export type SubscriptionControllerCancelSubscriptionAction = {
  type: `${typeof controllerName}:cancelSubscription`;
  handler: SubscriptionController['cancelSubscription'];
};
export type SubscriptionControllerStartShieldSubscriptionWithCardAction = {
  type: `${typeof controllerName}:startShieldSubscriptionWithCard`;
  handler: SubscriptionController['startShieldSubscriptionWithCard'];
};
export type SubscriptionControllerGetPricingAction = {
  type: `${typeof controllerName}:getPricing`;
  handler: SubscriptionController['getPricing'];
};
export type SubscriptionControllerGetCryptoApproveTransactionParamsAction = {
  type: `${typeof controllerName}:getCryptoApproveTransactionParams`;
  handler: SubscriptionController['getCryptoApproveTransactionParams'];
};
export type SubscriptionControllerStartSubscriptionWithCryptoAction = {
  type: `${typeof controllerName}:startSubscriptionWithCrypto`;
  handler: SubscriptionController['startSubscriptionWithCrypto'];
};
export type SubscriptionControllerUpdatePaymentMethodAction = {
  type: `${typeof controllerName}:updatePaymentMethod`;
  handler: SubscriptionController['updatePaymentMethod'];
};
export type SubscriptionControllerGetBillingPortalUrlAction = {
  type: `${typeof controllerName}:getBillingPortalUrl`;
  handler: SubscriptionController['getBillingPortalUrl'];
};

export type SubscriptionControllerSubmitSponsorshipIntentsAction = {
  type: `${typeof controllerName}:submitSponsorshipIntents`;
  handler: SubscriptionController['submitSponsorshipIntents'];
};

export type SubscriptionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SubscriptionControllerState
>;
export type SubscriptionControllerActions =
  | SubscriptionControllerGetSubscriptionsAction
  | SubscriptionControllerGetSubscriptionByProductAction
  | SubscriptionControllerCancelSubscriptionAction
  | SubscriptionControllerStartShieldSubscriptionWithCardAction
  | SubscriptionControllerGetPricingAction
  | SubscriptionControllerGetStateAction
  | SubscriptionControllerGetCryptoApproveTransactionParamsAction
  | SubscriptionControllerStartSubscriptionWithCryptoAction
  | SubscriptionControllerUpdatePaymentMethodAction
  | SubscriptionControllerGetBillingPortalUrlAction
  | SubscriptionControllerSubmitSponsorshipIntentsAction;

export type AllowedActions =
  | AuthenticationController.AuthenticationControllerGetBearerToken
  | AuthenticationController.AuthenticationControllerPerformSignOut;

// Events
export type SubscriptionControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  SubscriptionControllerState
>;
export type SubscriptionControllerEvents =
  SubscriptionControllerStateChangeEvent;

export type AllowedEvents =
  AuthenticationController.AuthenticationControllerStateChangeEvent;

// Messenger
export type SubscriptionControllerMessenger = Messenger<
  typeof controllerName,
  SubscriptionControllerActions | AllowedActions,
  SubscriptionControllerEvents | AllowedEvents
>;

/**
 * Subscription Controller Options.
 */
export type SubscriptionControllerOptions = {
  messenger: SubscriptionControllerMessenger;

  /**
   * Initial state to set on this controller.
   */
  state?: Partial<SubscriptionControllerState>;

  /**
   * Subscription service to use for the subscription controller.
   */
  subscriptionService: ISubscriptionService;

  /**
   * Polling interval to use for the subscription controller.
   *
   * @default 5 minutes.
   */
  pollingInterval?: number;
};

/**
 * Get the default state for the Subscription Controller.
 *
 * @returns The default state for the Subscription Controller.
 */
export function getDefaultSubscriptionControllerState(): SubscriptionControllerState {
  return {
    subscriptions: [],
    trialedProducts: [],
  };
}

/**
 * Seedless Onboarding Controller State Metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const subscriptionControllerMetadata: StateMetadata<SubscriptionControllerState> =
  {
    subscriptions: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    customerId: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    trialedProducts: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: true,
    },
    pricing: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: true,
      usedInUi: true,
    },
    lastSelectedPaymentMethod: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
  };

export class SubscriptionController extends StaticIntervalPollingController()<
  typeof controllerName,
  SubscriptionControllerState,
  SubscriptionControllerMessenger
> {
  readonly #subscriptionService: ISubscriptionService;

  #shouldCallRefreshAuthToken: boolean = false;

  /**
   * Creates a new SubscriptionController instance.
   *
   * @param options - The options for the SubscriptionController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.subscriptionService - The subscription service for communicating with subscription server.
   * @param options.pollingInterval - The polling interval to use for the subscription controller.
   */
  constructor({
    messenger,
    state,
    subscriptionService,
    pollingInterval = DEFAULT_POLLING_INTERVAL,
  }: SubscriptionControllerOptions) {
    super({
      name: controllerName,
      metadata: subscriptionControllerMetadata,
      state: {
        ...getDefaultSubscriptionControllerState(),
        ...state,
      },
      messenger,
    });

    this.setIntervalLength(pollingInterval);
    this.#subscriptionService = subscriptionService;
    this.#registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      'SubscriptionController:getSubscriptions',
      this.getSubscriptions.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:getSubscriptionByProduct',
      this.getSubscriptionByProduct.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:cancelSubscription',
      this.cancelSubscription.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:startShieldSubscriptionWithCard',
      this.startShieldSubscriptionWithCard.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:getPricing',
      this.getPricing.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:getCryptoApproveTransactionParams',
      this.getCryptoApproveTransactionParams.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:startSubscriptionWithCrypto',
      this.startSubscriptionWithCrypto.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:updatePaymentMethod',
      this.updatePaymentMethod.bind(this),
    );

    this.messenger.registerActionHandler(
      'SubscriptionController:getBillingPortalUrl',
      this.getBillingPortalUrl.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:submitSponsorshipIntents`,
      this.submitSponsorshipIntents.bind(this),
    );
  }

  /**
   * Gets the pricing information from the subscription service.
   *
   * @returns The pricing information.
   */
  async getPricing(): Promise<PricingResponse> {
    const pricing = await this.#subscriptionService.getPricing();
    this.update((state) => {
      state.pricing = pricing;
    });
    return pricing;
  }

  async getSubscriptions() {
    const currentSubscriptions = this.state.subscriptions;
    const currentTrialedProducts = this.state.trialedProducts;
    const currentCustomerId = this.state.customerId;
    const {
      customerId: newCustomerId,
      subscriptions: newSubscriptions,
      trialedProducts: newTrialedProducts,
    } = await this.#subscriptionService.getSubscriptions();

    // check if the new subscriptions are different from the current subscriptions
    const areSubscriptionsEqual = this.#areSubscriptionsEqual(
      currentSubscriptions,
      newSubscriptions,
    );
    // check if the new trialed products are different from the current trialed products
    const areTrialedProductsEqual = this.#areTrialedProductsEqual(
      currentTrialedProducts,
      newTrialedProducts,
    );

    const areCustomerIdsEqual = currentCustomerId === newCustomerId;

    // only update the state if the subscriptions or trialed products are different
    // this prevents unnecessary state updates events, easier for the clients to handle
    if (
      !areSubscriptionsEqual ||
      !areTrialedProductsEqual ||
      !areCustomerIdsEqual
    ) {
      this.update((state) => {
        state.subscriptions = newSubscriptions;
        state.customerId = newCustomerId;
        state.trialedProducts = newTrialedProducts;
      });
      this.#shouldCallRefreshAuthToken = true;
    }

    return newSubscriptions;
  }

  /**
   * Get the subscription by product.
   *
   * @param product - The product type.
   * @returns The subscription.
   */
  getSubscriptionByProduct(product: ProductType): Subscription | undefined {
    return this.state.subscriptions.find((subscription) =>
      subscription.products.some((p) => p.name === product),
    );
  }

  /**
   * Get the subscriptions eligibilities.
   *
   * @returns The subscriptions eligibilities.
   */
  async getSubscriptionsEligibilities(): Promise<SubscriptionEligibility[]> {
    return await this.#subscriptionService.getSubscriptionsEligibilities();
  }

  async cancelSubscription(request: { subscriptionId: string }) {
    this.#assertIsUserSubscribed({ subscriptionId: request.subscriptionId });

    const cancelledSubscription =
      await this.#subscriptionService.cancelSubscription({
        subscriptionId: request.subscriptionId,
      });

    this.update((state) => {
      state.subscriptions = state.subscriptions.map((subscription) =>
        subscription.id === request.subscriptionId
          ? { ...subscription, ...cancelledSubscription }
          : subscription,
      );
    });

    this.triggerAccessTokenRefresh();
  }

  async unCancelSubscription(request: { subscriptionId: string }) {
    this.#assertIsUserSubscribed({ subscriptionId: request.subscriptionId });

    const uncancelledSubscription =
      await this.#subscriptionService.unCancelSubscription({
        subscriptionId: request.subscriptionId,
      });

    this.update((state) => {
      state.subscriptions = state.subscriptions.map((subscription) =>
        subscription.id === request.subscriptionId
          ? { ...subscription, ...uncancelledSubscription }
          : subscription,
      );
    });

    this.triggerAccessTokenRefresh();
  }

  async startShieldSubscriptionWithCard(request: StartSubscriptionRequest) {
    this.#assertIsUserNotSubscribed({ products: request.products });

    const response =
      await this.#subscriptionService.startSubscriptionWithCard(request);

    this.triggerAccessTokenRefresh();

    return response;
  }

  async startSubscriptionWithCrypto(request: StartCryptoSubscriptionRequest) {
    this.#assertIsUserNotSubscribed({ products: request.products });
    const response =
      await this.#subscriptionService.startSubscriptionWithCrypto(request);
    this.triggerAccessTokenRefresh();
    return response;
  }

  /**
   * Get transaction params to create crypto approve transaction for subscription payment
   *
   * @param request - The request object
   * @param request.chainId - The chain ID
   * @param request.tokenAddress - The address of the token
   * @param request.productType - The product type
   * @param request.interval - The interval
   * @returns The crypto approve transaction params
   */
  getCryptoApproveTransactionParams(
    request: GetCryptoApproveTransactionRequest,
  ): GetCryptoApproveTransactionResponse {
    const { pricing } = this.state;
    if (!pricing) {
      throw new Error('Subscription pricing not found');
    }
    const product = pricing.products.find(
      (p) => p.name === request.productType,
    );
    if (!product) {
      throw new Error('Product price not found');
    }

    const price = product.prices.find((p) => p.interval === request.interval);
    if (!price) {
      throw new Error('Price not found');
    }

    const chainsPaymentInfo = pricing.paymentMethods.find(
      (t) => t.type === PAYMENT_TYPES.byCrypto,
    );
    if (!chainsPaymentInfo) {
      throw new Error('Chains payment info not found');
    }
    const chainPaymentInfo = chainsPaymentInfo.chains?.find(
      (t) => t.chainId === request.chainId,
    );
    if (!chainPaymentInfo) {
      throw new Error('Invalid chain id');
    }
    const tokenPaymentInfo = chainPaymentInfo.tokens.find(
      (t) => t.address === request.paymentTokenAddress,
    );
    if (!tokenPaymentInfo) {
      throw new Error('Invalid token address');
    }

    const tokenApproveAmount = this.getTokenApproveAmount(
      price,
      tokenPaymentInfo,
    );

    return {
      approveAmount: tokenApproveAmount,
      paymentAddress: chainPaymentInfo.paymentAddress,
      paymentTokenAddress: request.paymentTokenAddress,
      chainId: request.chainId,
    };
  }

  async updatePaymentMethod(
    opts: UpdatePaymentMethodOpts,
  ): Promise<UpdatePaymentMethodCardResponse | Subscription[]> {
    if (opts.paymentType === PAYMENT_TYPES.byCard) {
      const { paymentType, ...cardRequest } = opts;
      return await this.#subscriptionService.updatePaymentMethodCard(
        cardRequest,
      );
    } else if (opts.paymentType === PAYMENT_TYPES.byCrypto) {
      const { paymentType, ...cryptoRequest } = opts;
      await this.#subscriptionService.updatePaymentMethodCrypto(cryptoRequest);
      return await this.getSubscriptions();
    }
    throw new Error('Invalid payment type');
  }

  /**
   * Cache the last selected payment method for a specific product.
   *
   * @param product - The product to cache the payment method for.
   * @param paymentMethod - The payment method to cache.
   * @param paymentMethod.type - The type of the payment method.
   * @param paymentMethod.paymentTokenAddress - The payment token address.
   * @param paymentMethod.plan - The plan of the payment method.
   * @param paymentMethod.product - The product of the payment method.
   */
  cacheLastSelectedPaymentMethod(
    product: ProductType,
    paymentMethod: CachedLastSelectedPaymentMethod,
  ) {
    if (
      paymentMethod.type === PAYMENT_TYPES.byCrypto &&
      !paymentMethod.paymentTokenAddress
    ) {
      throw new Error(
        SubscriptionControllerErrorMessage.PaymentTokenAddressRequiredForCrypto,
      );
    }

    this.update((state) => {
      state.lastSelectedPaymentMethod = {
        ...state.lastSelectedPaymentMethod,
        [product]: paymentMethod,
      };
    });
  }

  /**
   * Submit sponsorship intents to the Subscription Service backend.
   *
   * This is intended to be used together with the crypto subscription flow.
   * When the user has enabled the smart transaction feature, we will sponsor the gas fees for the subscription approval transaction.
   *
   * @param request - Request object containing the address and products.
   * @example {
   *   address: '0x1234567890123456789012345678901234567890',
   *   products: [ProductType.Shield],
   *   recurringInterval: RecurringInterval.Month,
   *   billingCycles: 1,
   * }
   */
  async submitSponsorshipIntents(
    request: SubmitSponsorshipIntentsMethodParams,
  ) {
    this.#assertIsUserNotSubscribed({ products: request.products });

    // verify if the user has trailed the provided products before
    const hasTrailedBefore = this.state.trialedProducts.some((product) =>
      request.products.includes(product),
    );
    // if the user has not trailed the provided products before, submit the sponsorship intents
    if (hasTrailedBefore) {
      return;
    }

    const selectedPaymentMethod =
      this.state.lastSelectedPaymentMethod?.[request.products[0]];
    this.#assertIsPaymentMethodCrypto(selectedPaymentMethod);

    const recurringInterval = selectedPaymentMethod.plan;
    const billingCycles =
      recurringInterval === RECURRING_INTERVALS.year ? 1 : 12;
    const paymentTokenSymbol = this.#queryPaymentTokenSymbol(
      request.chainId,
      selectedPaymentMethod.paymentTokenAddress,
    );

    await this.#subscriptionService.submitSponsorshipIntents({
      ...request,
      paymentTokenSymbol,
      billingCycles,
      recurringInterval,
    });
  }

  /**
   * Submit a user event from the UI. (e.g. shield modal viewed)
   *
   * @param request - Request object containing the event to submit.
   * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed }
   */
  async submitUserEvent(request: SubmitUserEventRequest) {
    await this.#subscriptionService.submitUserEvent(request);
  }

  async _executePoll(): Promise<void> {
    await this.getSubscriptions();
    if (this.#shouldCallRefreshAuthToken) {
      this.triggerAccessTokenRefresh();
      this.#shouldCallRefreshAuthToken = false;
    }
  }

  /**
   * Calculate total subscription price amount from price info
   * e.g: $8 per month * 12 months min billing cycles = $96
   *
   * @param price - The price info
   * @returns The price amount
   */
  #getSubscriptionPriceAmount(price: ProductPrice) {
    // no need to use BigInt since max unitDecimals are always 2 for price
    const amount =
      (price.unitAmount / 10 ** price.unitDecimals) * price.minBillingCycles;
    return amount;
  }

  /**
   * Calculate token approve amount from price info
   *
   * @param price - The price info
   * @param tokenPaymentInfo - The token price info
   * @returns The token approve amount
   */
  getTokenApproveAmount(
    price: ProductPrice,
    tokenPaymentInfo: TokenPaymentInfo,
  ): string {
    const conversionRate =
      tokenPaymentInfo.conversionRate[
        price.currency as keyof typeof tokenPaymentInfo.conversionRate
      ];
    if (!conversionRate) {
      throw new Error('Conversion rate not found');
    }
    // conversion rate is a float string e.g: "1.0"
    // We need to handle float conversion rates with integer math for BigInt.
    // We'll scale the conversion rate to an integer by multiplying by 10^4.
    // conversionRate is in usd decimal. In most currencies, we only care about 2 decimals (cents)
    // So, scale must be max of 10 ** 4 (most exchanges trade with max 4 decimals of usd)
    // This allows us to avoid floating point math and keep precision.
    const SCALE = 10n ** 4n;
    const conversionRateScaled =
      BigInt(Math.round(Number(conversionRate) * Number(SCALE))) / SCALE;
    // price of the product
    const priceAmount = this.#getSubscriptionPriceAmount(price);
    const priceAmountScaled =
      BigInt(Math.round(priceAmount * Number(SCALE))) / SCALE;

    const tokenDecimal = BigInt(10) ** BigInt(tokenPaymentInfo.decimals);

    const tokenAmount =
      (priceAmountScaled * tokenDecimal) / conversionRateScaled;
    return tokenAmount.toString();
  }

  /**
   * Triggers an access token refresh.
   */
  triggerAccessTokenRefresh() {
    // We perform a sign out to clear the access token from the authentication
    // controller. Next time the access token is requested, a new access token
    // will be fetched.
    this.messenger.call('AuthenticationController:performSignOut');
  }

  #assertIsUserNotSubscribed({ products }: { products: ProductType[] }) {
    const subscription = this.state.subscriptions.find((sub) =>
      sub.products.some((p) => products.includes(p.name)),
    );

    if (
      subscription &&
      ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
    ) {
      throw new Error(SubscriptionControllerErrorMessage.UserAlreadySubscribed);
    }
  }

  #assertIsUserSubscribed(request: { subscriptionId: string }) {
    if (
      !this.state.subscriptions.find(
        (subscription) => subscription.id === request.subscriptionId,
      )
    ) {
      throw new Error(SubscriptionControllerErrorMessage.UserNotSubscribed);
    }
  }

  /**
   * Asserts that the value is a valid crypto payment method.
   *
   * @param value - The value to assert.
   * @throws an error if the value is not a valid crypto payment method.
   */
  #assertIsPaymentMethodCrypto(
    value: CachedLastSelectedPaymentMethod | undefined,
  ): asserts value is Required<CachedLastSelectedPaymentMethod> {
    if (
      !value ||
      value.type !== PAYMENT_TYPES.byCrypto ||
      !value.paymentTokenAddress
    ) {
      throw new Error(
        SubscriptionControllerErrorMessage.PaymentMethodNotCrypto,
      );
    }
  }

  /**
   * Queries the payment token symbol from the pricing.
   *
   * @param chainId - The chain id.
   * @param paymentTokenAddress - The payment token address.
   * @returns The payment token symbol.
   */
  #queryPaymentTokenSymbol(chainId: Hex, paymentTokenAddress: Hex): string {
    const cryptoPaymentMethod = this.state.pricing?.paymentMethods.find(
      (t) => t.type === PAYMENT_TYPES.byCrypto,
    );
    if (!cryptoPaymentMethod) {
      throw new Error(
        SubscriptionControllerErrorMessage.PaymentMethodNotCrypto,
      );
    }
    const tokenPaymentInfo = cryptoPaymentMethod.chains
      ?.find((t) => t.chainId === chainId)
      ?.tokens.find((t) => t.address === paymentTokenAddress);
    if (!tokenPaymentInfo) {
      throw new Error(
        SubscriptionControllerErrorMessage.PaymentTokenAddressNotFound,
      );
    }
    return tokenPaymentInfo.symbol;
  }

  /**
   * Gets the billing portal URL.
   *
   * @returns The billing portal URL
   */
  async getBillingPortalUrl(): Promise<BillingPortalResponse> {
    return await this.#subscriptionService.getBillingPortalUrl();
  }

  /**
   * Determines whether two trialed products arrays are equal by comparing all products in the arrays.
   *
   * @param oldTrialedProducts - The first trialed products array to compare.
   * @param newTrialedProducts - The second trialed products array to compare.
   * @returns True if the trialed products arrays are equal, false otherwise.
   */
  #areTrialedProductsEqual(
    oldTrialedProducts: ProductType[],
    newTrialedProducts: ProductType[],
  ): boolean {
    return (
      oldTrialedProducts.length === newTrialedProducts?.length &&
      oldTrialedProducts.every((product) =>
        newTrialedProducts?.includes(product),
      )
    );
  }

  /**
   * Determines whether two subscription arrays are equal by comparing all properties
   * of each subscription in the arrays.
   *
   * @param oldSubs - The first subscription array to compare.
   * @param newSubs - The second subscription array to compare.
   * @returns True if the subscription arrays are equal, false otherwise.
   */
  #areSubscriptionsEqual(
    oldSubs: Subscription[],
    newSubs: Subscription[],
  ): boolean {
    // Check if arrays have different lengths
    if (oldSubs.length !== newSubs.length) {
      return false;
    }

    // Sort both arrays by id to ensure consistent comparison
    const sortedOldSubs = [...oldSubs].sort((a, b) => a.id.localeCompare(b.id));
    const sortedNewSubs = [...newSubs].sort((a, b) => a.id.localeCompare(b.id));

    // Check if all subscriptions are equal
    return sortedOldSubs.every((oldSub, index) => {
      const newSub = sortedNewSubs[index];
      return (
        this.#stringifySubscription(oldSub) ===
        this.#stringifySubscription(newSub)
      );
    });
  }

  #stringifySubscription(subscription: Subscription): string {
    const subsWithSortedProducts = {
      ...subscription,
      // order the products by name
      products: [...subscription.products].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };

    return JSON.stringify(subsWithSortedProducts);
  }
}
