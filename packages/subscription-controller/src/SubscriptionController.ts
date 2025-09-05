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
  GetCryptoApproveTransactionRequest,
  GetCryptoApproveTransactionResponse,
  ProductPrice,
  StartCryptoSubscriptionRequest,
  TokenPaymentInfo,
} from './types';
import {
  PaymentType,
  SubscriptionStatus,
  type ISubscriptionService,
  type PricingResponse,
  type ProductType,
  type StartSubscriptionRequest,
  type Subscription,
} from './types';

export type SubscriptionControllerState = {
  subscriptions: Subscription[];
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
  | SubscriptionControllerStartSubscriptionWithCryptoAction;

export type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

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
      persist: true,
      anonymous: false,
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
  }

  /**
   * Gets the pricing information from the subscription service.
   *
   * @returns The pricing information.
   */
  async getPricing(): Promise<PricingResponse> {
    return await this.#subscriptionService.getPricing();
  }

  async getSubscriptions() {
    const { subscriptions } =
      await this.#subscriptionService.getSubscriptions();

    this.update((state) => {
      state.subscriptions = subscriptions;
    });

    return subscriptions;
  }

  async cancelSubscription(request: { subscriptionId: string }) {
    this.#assertIsUserSubscribed({ subscriptionId: request.subscriptionId });

    await this.#subscriptionService.cancelSubscription({
      subscriptionId: request.subscriptionId,
    });

    this.update((state) => {
      state.subscriptions = state.subscriptions.map((subscription) =>
        subscription.id === request.subscriptionId
          ? { ...subscription, status: SubscriptionStatus.canceled }
          : subscription,
      );
    });
  }

  async startShieldSubscriptionWithCard(request: StartSubscriptionRequest) {
    this.#assertIsUserNotSubscribed({ products: request.products });

    return await this.#subscriptionService.startSubscriptionWithCard(request);
  }

  async startSubscriptionWithCrypto(request: StartCryptoSubscriptionRequest) {
    this.#assertIsUserNotSubscribed({ products: request.products });
    return await this.#subscriptionService.startSubscriptionWithCrypto(request);
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
    const pricing = await this.getPricing();
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
      (t) => t.type === PaymentType.byCrypto,
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

    const tokenApproveAmount = this.#getTokenApproveAmount(
      price,
      tokenPaymentInfo,
    );

    return {
      approveAmount: tokenApproveAmount.toString(),
      spenderAddress: chainPaymentInfo.paymentAddress,
      paymentTokenAddress: request.paymentTokenAddress,
      chainId: request.chainId,
    };
  }

  /**
   * Calculate total subscription price amount from price info
   * e.g: $8 per month * 12 months min billing cycles = $96
   *
   * @param price - The price info
   * @returns The price amount
   */
  #getSubscriptionPriceAmount(price: ProductPrice) {
    const amount =
      (BigInt(price.unitAmount) / BigInt(10) ** BigInt(price.unitDecimals)) *
      BigInt(price.minBillingCycles);
    return amount;
  }

  /**
   * Calculate token approve amount from price info
   *
   * @param price - The price info
   * @param tokenPaymentInfo - The token price info
   * @returns The token approve amount
   */
  #getTokenApproveAmount(
    price: ProductPrice,
    tokenPaymentInfo: TokenPaymentInfo,
  ) {
    const conversionRate =
      tokenPaymentInfo.conversionRate[
        price.currency as keyof typeof tokenPaymentInfo.conversionRate
      ];
    if (!conversionRate) {
      throw new Error('Conversion rate not found');
    }
    // conversion rate is a float string e.g: "1.0"
    // We need to handle float conversion rates with integer math for BigInt.
    // We'll scale the conversion rate to an integer by multiplying by 10^18 (or another large factor).
    // This allows us to avoid floating point math and keep precision.
    const CONVERSION_RATE_SCALE = 10n ** 18n;
    const conversionRateScaled = BigInt(
      Math.round(Number(conversionRate) * Number(CONVERSION_RATE_SCALE)),
    );

    const amount =
      (this.#getSubscriptionPriceAmount(price) *
        BigInt(10) ** BigInt(tokenPaymentInfo.decimals) *
        CONVERSION_RATE_SCALE) /
      conversionRateScaled;
    return amount;
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

  #assertIsUserSubscribed(request: { subscriptionId: string }) {
    if (
      !this.state.subscriptions.find(
        (subscription) => subscription.id === request.subscriptionId,
      )
    ) {
      throw new Error(SubscriptionControllerErrorMessage.UserNotSubscribed);
    }
  }
}
