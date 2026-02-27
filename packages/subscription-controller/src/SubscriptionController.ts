import type {
  StateMetadata,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { CaipAccountId, Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  controllerName,
  DEFAULT_POLLING_INTERVAL,
  SubscriptionControllerErrorMessage,
} from './constants';
import { PAYMENT_TYPES, PRODUCT_TYPES, SUBSCRIPTION_STATUSES } from './types';
import type {
  AssignCohortRequest,
  BillingPortalResponse,
  GetCryptoApproveTransactionRequest,
  GetCryptoApproveTransactionResponse,
  GetSubscriptionsEligibilitiesRequest,
  ProductPrice,
  SubscriptionEligibility,
  StartCryptoSubscriptionRequest,
  SubmitUserEventRequest,
  TokenPaymentInfo,
  UpdatePaymentMethodCardResponse,
  UpdatePaymentMethodOpts,
  CachedLastSelectedPaymentMethod,
  SubmitSponsorshipIntentsMethodParams,
  RecurringInterval,
  SubscriptionStatus,
  LinkRewardsRequest,
  StartCryptoSubscriptionResponse,
  StartSubscriptionResponse,
  CancelSubscriptionRequest,
} from './types';
import type {
  ISubscriptionService,
  PricingResponse,
  ProductType,
  StartSubscriptionRequest,
  Subscription,
} from './types';

export type SubscriptionControllerState = {
  customerId?: string;
  trialedProducts: ProductType[];
  subscriptions: Subscription[];
  pricing?: PricingResponse;
  /** The last subscription that user has subscribed to if any. */
  lastSubscription?: Subscription;
  /** The reward account ID if user has linked rewards to the subscription. */
  rewardAccountId?: CaipAccountId;
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

export type SubscriptionControllerCacheLastSelectedPaymentMethodAction = {
  type: `${typeof controllerName}:cacheLastSelectedPaymentMethod`;
  handler: SubscriptionController['cacheLastSelectedPaymentMethod'];
};

export type SubscriptionControllerClearLastSelectedPaymentMethodAction = {
  type: `${typeof controllerName}:clearLastSelectedPaymentMethod`;
  handler: SubscriptionController['clearLastSelectedPaymentMethod'];
};

export type SubscriptionControllerLinkRewardsAction = {
  type: `${typeof controllerName}:linkRewards`;
  handler: SubscriptionController['linkRewards'];
};

export type SubscriptionControllerSubmitShieldSubscriptionCryptoApprovalAction =
  {
    type: `${typeof controllerName}:submitShieldSubscriptionCryptoApproval`;
    handler: SubscriptionController['submitShieldSubscriptionCryptoApproval'];
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
  | SubscriptionControllerSubmitSponsorshipIntentsAction
  | SubscriptionControllerSubmitShieldSubscriptionCryptoApprovalAction
  | SubscriptionControllerLinkRewardsAction
  | SubscriptionControllerCacheLastSelectedPaymentMethodAction
  | SubscriptionControllerClearLastSelectedPaymentMethodAction;

export type AllowedActions =
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction
  | AuthenticationController.AuthenticationControllerPerformSignOutAction;

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
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    lastSubscription: {
      includeInStateLogs: false,
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
    rewardAccountId: {
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

    this.messenger.registerActionHandler(
      `${controllerName}:submitShieldSubscriptionCryptoApproval`,
      this.submitShieldSubscriptionCryptoApproval.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:linkRewards`,
      this.linkRewards.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:cacheLastSelectedPaymentMethod`,
      this.cacheLastSelectedPaymentMethod.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:clearLastSelectedPaymentMethod`,
      this.clearLastSelectedPaymentMethod.bind(this),
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

  async getSubscriptions(): Promise<Subscription[]> {
    const currentSubscriptions = this.state.subscriptions;
    const currentTrialedProducts = this.state.trialedProducts;
    const currentCustomerId = this.state.customerId;
    const currentLastSubscription = this.state.lastSubscription;
    const currentRewardAccountId = this.state.rewardAccountId;

    const {
      customerId: newCustomerId,
      subscriptions: newSubscriptions,
      trialedProducts: newTrialedProducts,
      lastSubscription: newLastSubscription,
      rewardAccountId: newRewardAccountId,
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
    // check if the new last subscription is different from the current last subscription
    const isLastSubscriptionEqual = this.#isSubscriptionEqual(
      currentLastSubscription,
      newLastSubscription,
    );

    const areCustomerIdsEqual = currentCustomerId === newCustomerId;
    const areRewardAccountIdsEqual =
      currentRewardAccountId === newRewardAccountId;
    // only update the state if the subscriptions or trialed products are different
    // this prevents unnecessary state updates events, easier for the clients to handle
    if (
      !areSubscriptionsEqual ||
      !isLastSubscriptionEqual ||
      !areTrialedProductsEqual ||
      !areCustomerIdsEqual ||
      !areRewardAccountIdsEqual
    ) {
      this.update((state) => {
        state.subscriptions = newSubscriptions;
        state.customerId = newCustomerId;
        state.trialedProducts = newTrialedProducts;
        state.lastSubscription = newLastSubscription;
        state.rewardAccountId = newRewardAccountId;
      });
      // trigger access token refresh to ensure the user has the latest access token if subscription state change
      this.triggerAccessTokenRefresh();
    }

    return newSubscriptions;
  }

  /**
   * Get the subscription by product.
   *
   * @param productType - The product type.
   * @returns The subscription.
   */
  getSubscriptionByProduct(productType: ProductType): Subscription | undefined {
    return this.state.subscriptions.find((subscription) =>
      subscription.products.some((product) => product.name === productType),
    );
  }

  /**
   * Get the subscriptions eligibilities.
   *
   * @param request - Optional request object containing user balance to check cohort eligibility.
   * @returns The subscriptions eligibilities.
   */
  async getSubscriptionsEligibilities(
    request?: GetSubscriptionsEligibilitiesRequest,
  ): Promise<SubscriptionEligibility[]> {
    return await this.#subscriptionService.getSubscriptionsEligibilities(
      request,
    );
  }

  async cancelSubscription(request: CancelSubscriptionRequest): Promise<void> {
    this.#assertIsUserSubscribed({ subscriptionId: request.subscriptionId });

    const cancelledSubscription =
      await this.#subscriptionService.cancelSubscription(request);

    this.update((state) => {
      state.subscriptions = state.subscriptions.map((subscription) =>
        subscription.id === request.subscriptionId
          ? { ...subscription, ...cancelledSubscription }
          : subscription,
      );
    });

    this.triggerAccessTokenRefresh();
  }

  async unCancelSubscription(request: {
    subscriptionId: string;
  }): Promise<void> {
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

  async startShieldSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse> {
    this.#assertIsUserNotSubscribed({ products: request.products });

    const response =
      await this.#subscriptionService.startSubscriptionWithCard(request);
    // note: no need to trigger access token refresh after startSubscriptionWithCard request because this only return stripe checkout session url, subscription not created yet

    return response;
  }

  async startSubscriptionWithCrypto(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse> {
    this.#assertIsUserNotSubscribed({ products: request.products });
    const response =
      await this.#subscriptionService.startSubscriptionWithCrypto(request);

    return response;
  }

  /**
   * Handles shield subscription crypto approval transactions.
   *
   * @param txMeta - The transaction metadata.
   * @param isSponsored - Whether the transaction is sponsored.
   * @param rewardAccountId - The account ID of the reward subscription to link to the shield subscription.
   * @returns void
   */
  async submitShieldSubscriptionCryptoApproval(
    txMeta: TransactionMeta,
    isSponsored?: boolean,
    rewardAccountId?: CaipAccountId,
  ): Promise<void> {
    if (txMeta.type !== TransactionType.shieldSubscriptionApprove) {
      return;
    }

    const { chainId, rawTx } = txMeta;
    if (!chainId || !rawTx) {
      throw new Error('Chain ID or raw transaction not found');
    }

    const { pricing, trialedProducts, lastSelectedPaymentMethod } = this.state;
    if (!pricing) {
      throw new Error('Subscription pricing not found');
    }
    if (!lastSelectedPaymentMethod) {
      throw new Error('Last selected payment method not found');
    }
    const lastSelectedPaymentMethodShield =
      lastSelectedPaymentMethod[PRODUCT_TYPES.SHIELD];
    this.#assertIsPaymentMethodCrypto(lastSelectedPaymentMethodShield);

    const productPrice = this.#getProductPriceByProductAndPlan(
      PRODUCT_TYPES.SHIELD,
      lastSelectedPaymentMethodShield.plan,
    );
    const isTrialed = trialedProducts?.includes(PRODUCT_TYPES.SHIELD);
    // get the latest subscriptions state to check if the user has an active shield subscription
    await this.getSubscriptions();
    const currentSubscription = this.state.subscriptions.find((subscription) =>
      subscription.products.some(
        (product) => product.name === PRODUCT_TYPES.SHIELD,
      ),
    );

    this.#assertValidSubscriptionStateForCryptoApproval({
      productType: PRODUCT_TYPES.SHIELD,
    });
    // if shield subscription exists, this transaction is for changing payment method
    const isChangePaymentMethod = Boolean(currentSubscription);

    if (isChangePaymentMethod) {
      await this.updatePaymentMethod({
        paymentType: PAYMENT_TYPES.byCrypto,
        subscriptionId: (currentSubscription as Subscription).id,
        chainId,
        payerAddress: txMeta.txParams.from as Hex,
        tokenSymbol: lastSelectedPaymentMethodShield.paymentTokenSymbol,
        rawTransaction: rawTx as Hex,
        recurringInterval: productPrice.interval,
        billingCycles: productPrice.minBillingCycles,
      });
    } else {
      const params = {
        products: [PRODUCT_TYPES.SHIELD],
        isTrialRequested: !isTrialed,
        recurringInterval: productPrice.interval,
        billingCycles: productPrice.minBillingCycles,
        chainId,
        payerAddress: txMeta.txParams.from as Hex,
        tokenSymbol: lastSelectedPaymentMethodShield.paymentTokenSymbol,
        rawTransaction: rawTx as Hex,
        isSponsored,
        useTestClock: lastSelectedPaymentMethodShield.useTestClock,
        rewardAccountId,
      };
      await this.startSubscriptionWithCrypto(params);
    }

    // update the subscriptions state after subscription created in server
    await this.getSubscriptions();
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
      (productInfo) => productInfo.name === request.productType,
    );
    if (!product) {
      throw new Error('Product price not found');
    }

    const price = product.prices.find(
      (productPrice) => productPrice.interval === request.interval,
    );
    if (!price) {
      throw new Error('Price not found');
    }

    const chainsPaymentInfo = pricing.paymentMethods.find(
      (paymentMethod) => paymentMethod.type === PAYMENT_TYPES.byCrypto,
    );
    if (!chainsPaymentInfo) {
      throw new Error('Chains payment info not found');
    }
    const chainPaymentInfo = chainsPaymentInfo.chains?.find(
      (chain) => chain.chainId === request.chainId,
    );
    if (!chainPaymentInfo) {
      throw new Error('Invalid chain id');
    }
    const tokenPaymentInfo = chainPaymentInfo.tokens.find(
      (token) => token.address === request.paymentTokenAddress,
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
   * Gets the billing portal URL.
   *
   * @returns The billing portal URL
   */
  async getBillingPortalUrl(): Promise<BillingPortalResponse> {
    return await this.#subscriptionService.getBillingPortalUrl();
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
  ): void {
    if (
      paymentMethod.type === PAYMENT_TYPES.byCrypto &&
      (!paymentMethod.paymentTokenAddress || !paymentMethod.paymentTokenSymbol)
    ) {
      throw new Error(
        SubscriptionControllerErrorMessage.PaymentTokenAddressAndSymbolRequiredForCrypto,
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
   * Clear the last selected payment method for a specific product.
   *
   * @param product - The product to clear the payment method for.
   */
  clearLastSelectedPaymentMethod(product: ProductType): void {
    this.update((state) => {
      if (state.lastSelectedPaymentMethod) {
        const { [product]: _, ...rest } = state.lastSelectedPaymentMethod;
        state.lastSelectedPaymentMethod =
          rest as typeof state.lastSelectedPaymentMethod;
      }
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
   * @returns resolves to true if the sponsorship is supported and intents were submitted successfully, false otherwise
   */
  async submitSponsorshipIntents(
    request: SubmitSponsorshipIntentsMethodParams,
  ): Promise<boolean> {
    if (request.products.length === 0) {
      throw new Error(
        SubscriptionControllerErrorMessage.SubscriptionProductsEmpty,
      );
    }

    this.#assertIsUserNotSubscribed({ products: request.products });

    const selectedPaymentMethod =
      this.state.lastSelectedPaymentMethod?.[request.products[0]];
    this.#assertIsPaymentMethodCrypto(selectedPaymentMethod);

    const isEligibleForTrialedSponsorship =
      this.#getIsEligibleForTrialedSponsorship(
        request.chainId,
        request.products,
      );
    if (!isEligibleForTrialedSponsorship) {
      return false;
    }

    const { paymentTokenSymbol, plan } = selectedPaymentMethod;
    const productPrice = this.#getProductPriceByProductAndPlan(
      // we only support one product at a time for now
      request.products[0],
      plan,
    );
    const billingCycles = productPrice.minBillingCycles;

    await this.#subscriptionService.submitSponsorshipIntents({
      ...request,
      paymentTokenSymbol,
      billingCycles,
      recurringInterval: plan,
    });
    return true;
  }

  /**
   * Submit a user event from the UI. (e.g. shield modal viewed)
   *
   * @param request - Request object containing the event to submit.
   * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed, cohort: 'post_tx' }
   */
  async submitUserEvent(request: SubmitUserEventRequest): Promise<void> {
    await this.#subscriptionService.submitUserEvent(request);
  }

  /**
   * Assign user to a cohort.
   *
   * @param request - Request object containing the cohort to assign the user to.
   * @example { cohort: 'post_tx' }
   */
  async assignUserToCohort(request: AssignCohortRequest): Promise<void> {
    await this.#subscriptionService.assignUserToCohort(request);
  }

  /**
   * Link rewards to a subscription.
   *
   * @param request - Request object containing the reward subscription ID.
   * @param request.subscriptionId - The ID of the subscription to link rewards to.
   * @param request.rewardAccountId - The account ID of the reward subscription to link to the subscription.
   * @example { subscriptionId: '1234567890', rewardAccountId: 'eip155:1:0x1234567890123456789012345678901234567890' }
   * @returns Resolves when the rewards are linked successfully.
   */
  async linkRewards(
    request: LinkRewardsRequest & { subscriptionId: string },
  ): Promise<void> {
    // assert that the user is subscribed to the subscription
    this.#assertIsUserSubscribed({ subscriptionId: request.subscriptionId });

    // link rewards to the subscription
    const response = await this.#subscriptionService.linkRewards({
      rewardAccountId: request.rewardAccountId,
    });
    if (!response.success) {
      throw new Error(SubscriptionControllerErrorMessage.LinkRewardsFailed);
    }
  }

  async _executePoll(): Promise<void> {
    await this.getSubscriptions();
  }

  /**
   * Calculate total subscription price amount (approval amount) from price info
   * e.g: $8 per month * 12 months min billing cycles = $96
   *
   * @param price - The price info
   * @returns The price amount
   */
  #getSubscriptionPriceAmount(price: ProductPrice): string {
    // no need to use BigInt since max unitDecimals are always 2 for price
    const amount = new BigNumber(price.unitAmount)
      .div(10 ** price.unitDecimals)
      .multipliedBy(price.minBillingCycles)
      .toString();
    return amount;
  }

  /**
   * Calculate minimum subscription balance amount from price info
   *
   * @param price - The price info
   * @returns The balance amount
   */
  #getSubscriptionBalanceAmount(price: ProductPrice): string {
    // no need to use BigInt since max unitDecimals are always 2 for price
    const amount = new BigNumber(price.unitAmount)
      .div(10 ** price.unitDecimals)
      .multipliedBy(price.minBillingCyclesForBalance)
      .toString();
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
    // price of the product
    const priceAmount = new BigNumber(this.#getSubscriptionPriceAmount(price));

    const tokenDecimal = new BigNumber(10).pow(tokenPaymentInfo.decimals);
    const tokenAmount = priceAmount
      .multipliedBy(tokenDecimal)
      .div(conversionRate);
    return tokenAmount.toFixed(0);
  }

  /**
   * Calculate token minimum balance amount from price info
   *
   * @param price - The price info
   * @param tokenPaymentInfo - The token price info
   * @returns The token balance amount
   */
  getTokenMinimumBalanceAmount(
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
    const balanceAmount = new BigNumber(
      this.#getSubscriptionBalanceAmount(price),
    );

    const tokenDecimal = new BigNumber(10).pow(tokenPaymentInfo.decimals);
    const tokenAmount = balanceAmount
      .multipliedBy(tokenDecimal)
      .div(conversionRate);
    return tokenAmount.toFixed(0);
  }

  /**
   * Clears the subscription state and resets to default values.
   */
  clearState(): void {
    const defaultState = getDefaultSubscriptionControllerState();
    this.update(() => {
      return defaultState;
    });
  }

  /**
   * Triggers an access token refresh.
   */
  triggerAccessTokenRefresh(): void {
    // We perform a sign out to clear the access token from the authentication
    // controller. Next time the access token is requested, a new access token
    // will be fetched.
    this.messenger.call('AuthenticationController:performSignOut');
  }

  #getProductPriceByProductAndPlan(
    productType: ProductType,
    plan: RecurringInterval,
  ): ProductPrice {
    const { pricing } = this.state;
    const productPricing = pricing?.products.find(
      (product) => product.name === productType,
    );
    const productPrice = productPricing?.prices.find(
      (price) => price.interval === plan,
    );
    if (!productPrice) {
      throw new Error(SubscriptionControllerErrorMessage.ProductPriceNotFound);
    }
    return productPrice;
  }

  #assertValidSubscriptionStateForCryptoApproval({
    productType,
  }: {
    productType: ProductType;
  }): void {
    const subscription = this.state.subscriptions.find((sub) =>
      sub.products.some((product) => product.name === productType),
    );

    const isValid =
      !subscription ||
      (
        [
          SUBSCRIPTION_STATUSES.pastDue,
          SUBSCRIPTION_STATUSES.unpaid,
          SUBSCRIPTION_STATUSES.paused,
          SUBSCRIPTION_STATUSES.provisional,
          SUBSCRIPTION_STATUSES.active,
          SUBSCRIPTION_STATUSES.trialing,
        ] as SubscriptionStatus[]
      ).includes(subscription.status);
    if (!isValid) {
      throw new Error(
        SubscriptionControllerErrorMessage.SubscriptionNotValidForCryptoApproval,
      );
    }
  }

  #assertIsUserNotSubscribed({ products }: { products: ProductType[] }): void {
    const subscription = this.state.subscriptions.find((sub) =>
      sub.products.some((product) => products.includes(product.name)),
    );

    if (
      subscription &&
      ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
    ) {
      throw new Error(SubscriptionControllerErrorMessage.UserAlreadySubscribed);
    }
  }

  #assertIsUserSubscribed(request: { subscriptionId: string }): void {
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
      value?.type !== PAYMENT_TYPES.byCrypto ||
      !value.paymentTokenAddress ||
      !value.paymentTokenSymbol
    ) {
      throw new Error(
        SubscriptionControllerErrorMessage.PaymentMethodNotCrypto,
      );
    }
  }

  /**
   * Determines if the user is eligible for trialed sponsorship for the given chain and products.
   * The user is eligible if the chain supports sponsorship and the user has not trialed the provided products before.
   *
   * @param chainId - The chain ID
   * @param products - The products to check eligibility for
   * @returns True if the user is eligible for trialed sponsorship, false otherwise
   */
  #getIsEligibleForTrialedSponsorship(
    chainId: Hex,
    products: ProductType[],
  ): boolean {
    const isSponsorshipSupported = this.#getChainSupportsSponsorship(chainId);

    // verify if the user has trialed the provided products before
    const hasTrialedBefore = this.state.trialedProducts.some((product) =>
      products.includes(product),
    );

    return isSponsorshipSupported && !hasTrialedBefore;
  }

  #getChainSupportsSponsorship(chainId: Hex): boolean {
    const cryptoPaymentInfo = this.state.pricing?.paymentMethods.find(
      (paymentMethod) => paymentMethod.type === PAYMENT_TYPES.byCrypto,
    );

    const isSponsorshipSupported = cryptoPaymentInfo?.chains?.find(
      (chain) => chain.chainId === chainId,
    )?.isSponsorshipSupported;
    return Boolean(isSponsorshipSupported);
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
      return this.#isSubscriptionEqual(oldSub, newSub);
    });
  }

  #isSubscriptionEqual(oldSub?: Subscription, newSub?: Subscription): boolean {
    // not equal if one is undefined and the other is defined
    if (!oldSub || !newSub) {
      if (!oldSub && !newSub) {
        return true;
      }
      return false;
    }

    return (
      this.#stringifySubscription(oldSub) ===
      this.#stringifySubscription(newSub)
    );
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
