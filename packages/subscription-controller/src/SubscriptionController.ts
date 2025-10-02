import {
  BaseController,
  type StateMetadata,
  type ControllerStateChangeEvent,
  type ControllerGetStateAction,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import {
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';
import type {
  BillingPortalResponse,
  GetCryptoApproveTransactionRequest,
  GetCryptoApproveTransactionResponse,
  ProductPrice,
  StartCryptoSubscriptionRequest,
  TokenPaymentInfo,
  UpdatePaymentMethodCardResponse,
  UpdatePaymentMethodOpts,
} from './types';
import {
  PAYMENT_TYPES,
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
};

// Messenger Actions
export type SubscriptionControllerGetSubscriptionsAction = {
  type: `${typeof controllerName}:getSubscriptions`;
  handler: SubscriptionController['getSubscriptions'];
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

export type SubscriptionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SubscriptionControllerState
>;
export type SubscriptionControllerActions =
  | SubscriptionControllerGetSubscriptionsAction
  | SubscriptionControllerCancelSubscriptionAction
  | SubscriptionControllerStartShieldSubscriptionWithCardAction
  | SubscriptionControllerGetPricingAction
  | SubscriptionControllerGetStateAction
  | SubscriptionControllerGetCryptoApproveTransactionParamsAction
  | SubscriptionControllerStartSubscriptionWithCryptoAction
  | SubscriptionControllerUpdatePaymentMethodAction
  | SubscriptionControllerGetBillingPortalUrlAction;

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
export type SubscriptionControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  SubscriptionControllerActions | AllowedActions,
  SubscriptionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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
      anonymous: false,
      usedInUi: true,
    },
    customerId: {
      includeInStateLogs: true,
      persist: true,
      anonymous: false,
      usedInUi: true,
    },
    trialedProducts: {
      includeInStateLogs: true,
      persist: true,
      anonymous: true,
      usedInUi: true,
    },
    pricing: {
      includeInStateLogs: true,
      persist: true,
      anonymous: true,
      usedInUi: true,
    },
  };

export class SubscriptionController extends BaseController<
  typeof controllerName,
  SubscriptionControllerState,
  SubscriptionControllerMessenger
> {
  readonly #subscriptionService: ISubscriptionService;

  /**
   * Creates a new SubscriptionController instance.
   *
   * @param options - The options for the SubscriptionController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.subscriptionService - The subscription service for communicating with subscription server.
   */
  constructor({
    messenger,
    state,
    subscriptionService,
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

    this.#subscriptionService = subscriptionService;
    this.#registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      'SubscriptionController:getSubscriptions',
      this.getSubscriptions.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:cancelSubscription',
      this.cancelSubscription.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:startShieldSubscriptionWithCard',
      this.startShieldSubscriptionWithCard.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:getPricing',
      this.getPricing.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:getCryptoApproveTransactionParams',
      this.getCryptoApproveTransactionParams.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:startSubscriptionWithCrypto',
      this.startSubscriptionWithCrypto.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:updatePaymentMethod',
      this.updatePaymentMethod.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:getBillingPortalUrl',
      this.getBillingPortalUrl.bind(this),
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
    const { subscriptions, customerId, trialedProducts } =
      await this.#subscriptionService.getSubscriptions();

    this.update((state) => {
      state.subscriptions = subscriptions;
      state.customerId = customerId;
      state.trialedProducts = trialedProducts;
    });

    return subscriptions;
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
  async getCryptoApproveTransactionParams(
    request: GetCryptoApproveTransactionRequest,
  ): Promise<GetCryptoApproveTransactionResponse> {
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

  #assertIsUserNotSubscribed({ products }: { products: ProductType[] }) {
    if (
      this.state.subscriptions.find((subscription) =>
        subscription.products.some((p) => products.includes(p.name)),
      )
    ) {
      throw new Error(SubscriptionControllerErrorMessage.UserAlreadySubscribed);
    }
  }

  /**
   * Triggers an access token refresh.
   */
  triggerAccessTokenRefresh() {
    // We perform a sign out to clear the access token from the authentication
    // controller. Next time the access token is requested, a new access token
    // will be fetched.
    this.messagingSystem.call('AuthenticationController:performSignOut');
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
   * Gets the billing portal URL.
   *
   * @returns The billing portal URL
   */
  async getBillingPortalUrl(): Promise<BillingPortalResponse> {
    return await this.#subscriptionService.getBillingPortalUrl();
  }
}
