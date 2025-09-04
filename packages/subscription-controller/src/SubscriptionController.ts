import { BigNumber as EthersBigNumber } from '@ethersproject/bignumber';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { AccountsControllerGetSelectedMultichainAccountAction } from '@metamask/accounts-controller';
import {
  BaseController,
  type StateMetadata,
  type ControllerStateChangeEvent,
  type ControllerGetStateAction,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { GetGasFeeState } from '@metamask/gas-fee-controller';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import {
  TransactionType,
  type TransactionController,
  type TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';
import type {
  ChainPaymentInfo,
  CreateCryptoApproveTransactionRequest,
  CreateCryptoApproveTransactionResponse,
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
import { generateActionId, getTxGasEstimates } from './utils';

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
export type SubscriptionControllerCreateCryptoApproveTransactionAction = {
  type: `${typeof controllerName}:createCryptoApproveTransaction`;
  handler: SubscriptionController['createCryptoApproveTransaction'];
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
  | SubscriptionControllerCreateCryptoApproveTransactionAction
  | SubscriptionControllerStartSubscriptionWithCryptoAction;

export type AllowedActions =
  | AuthenticationController.AuthenticationControllerGetBearerToken
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | AccountsControllerGetSelectedMultichainAccountAction
  | GetGasFeeState;

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

  addTransactionFn: typeof TransactionController.prototype.addTransaction;

  estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;
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

  readonly #addTransactionFn: typeof TransactionController.prototype.addTransaction;

  readonly #estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;

  /**
   * Creates a new SubscriptionController instance.
   *
   * @param options - The options for the SubscriptionController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.subscriptionService - The subscription service for communicating with subscription server.
   * @param options.addTransactionFn - The function to add a transaction.
   * @param options.estimateGasFeeFn - The function to estimate gas fee.
   */
  constructor({
    messenger,
    state,
    subscriptionService,
    addTransactionFn,
    estimateGasFeeFn,
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
    this.#addTransactionFn = addTransactionFn;
    this.#estimateGasFeeFn = estimateGasFeeFn;
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
      'SubscriptionController:createCryptoApproveTransaction',
      this.createCryptoApproveTransaction.bind(this),
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
   * Create a crypto approve transaction for subscription payment
   * Return undefined if allowance amount is already allowed.
   *
   * @param request - The request object
   * @param request.chainId - The chain ID
   * @param request.tokenAddress - The address of the token
   * @param request.productType - The product type
   * @param request.interval - The interval
   * @returns The transaction raw or already allowed flag
   */
  async createCryptoApproveTransaction(
    request: CreateCryptoApproveTransactionRequest,
  ): Promise<CreateCryptoApproveTransactionResponse> {
    const pricing = await this.#subscriptionService.getPricing();
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
      (t) => t.address === request.tokenAddress,
    );
    if (!tokenPaymentInfo) {
      throw new Error('Invalid token address');
    }

    const networkClientId = this.messagingSystem.call(
      'NetworkController:findNetworkClientIdByChainId',
      request.chainId as Hex,
    );

    const provider = this.#getSelectedNetworkClient()?.provider;
    if (!provider) {
      throw new Error('No provider found');
    }

    const tokenApproveAmount = this.#getTokenApproveAmount(
      price,
      tokenPaymentInfo,
    );
    // no need to create transaction if already allowed enough amount
    const allowance = await this.#getCryptoAllowance({
      tokenAddress: request.tokenAddress,
      chainPaymentInfo,
      chainId: request.chainId,
      provider,
    });
    if (allowance.gte(tokenApproveAmount)) {
      return {
        transactionResult: undefined,
      };
    }

    const spender = chainPaymentInfo.paymentAddress;

    const ethersProvider = new Web3Provider(provider);
    const { address: walletAddress } =
      this.#getMultichainSelectedAccount() ?? {};
    if (!walletAddress) {
      throw new Error('No wallet address found');
    }

    const token = new Contract(request.tokenAddress, abiERC20, ethersProvider);
    // Build call data only
    const txData = token.interface.encodeFunctionData('approve', [
      spender,
      tokenApproveAmount,
    ]);
    const transactionParams = {
      to: request.tokenAddress,
      data: txData,
      from: walletAddress,
      value: '0',
    };

    const actionId = generateActionId().toString();
    const requestOptions = {
      actionId,
      networkClientId,
      requireApproval: true,
      type: TransactionType.tokenMethodApprove,
      origin: 'metamask',
    };

    const transactionParamsWithMaxGas: TransactionParams = {
      ...transactionParams,
      ...(await this.#calculateGasFees(
        transactionParams,
        networkClientId,
        request.chainId as Hex,
      )),
    };

    const result = await this.#addTransactionFn(
      transactionParamsWithMaxGas,
      requestOptions,
    );

    return {
      transactionResult: result,
    };
  }

  readonly #calculateGasFees = async (
    transactionParams: TransactionParams,
    networkClientId: string,
    chainId: Hex,
  ) => {
    const { gasFeeEstimates } = this.messagingSystem.call(
      'GasFeeController:getState',
    );
    const { estimates: txGasFeeEstimates } = await this.#estimateGasFeeFn({
      transactionParams,
      chainId,
      networkClientId,
    });
    const { maxFeePerGas, maxPriorityFeePerGas } = getTxGasEstimates({
      networkGasFeeEstimates: gasFeeEstimates,
      txGasFeeEstimates,
    });
    const maxGasLimit = toHex(transactionParams.gas ?? 0);

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gas: maxGasLimit,
    };
  };

  /**
   * Get the allowance of the crypto token for payment address
   *
   * @param request - The request object
   * @param request.tokenAddress - The address of the token
   * @param request.chainPaymentInfo - The chain payment info
   * @param request.chainId - The chain ID
   * @param request.provider - The network client provider
   * @returns The allowance of the crypto token
   */
  async #getCryptoAllowance(request: {
    tokenAddress: string;
    chainPaymentInfo: ChainPaymentInfo;
    chainId: string;
    provider: AutoManagedNetworkClient<CustomNetworkClientConfiguration>['provider'];
  }) {
    const { provider } = request;

    const ethersProvider = new Web3Provider(provider);
    const { address: walletAddress } =
      this.#getMultichainSelectedAccount() ?? {};
    const contract = new Contract(
      request.tokenAddress,
      abiERC20,
      ethersProvider,
    );
    const allowance: BigNumber = await contract.allowance(
      walletAddress,
      request.chainPaymentInfo.paymentAddress,
    );
    return allowance;
  }

  #getMultichainSelectedAccount() {
    return this.messagingSystem.call(
      'AccountsController:getSelectedMultichainAccount',
    );
  }

  /**
   * Calculate total subscription price amount from price info
   * e.g: $8 per month * 12 months min billing cycles = $96
   *
   * @param price - The price info
   * @returns The price amount
   */
  #getSubscriptionPriceAmount(price: ProductPrice) {
    const amount = EthersBigNumber.from(price.unitAmount)
      .div(EthersBigNumber.from(10).pow(price.unitDecimals))
      .mul(price.minBillingCycles);
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
    // ether.js bignumber does not support float string, only handle integer string
    // we need to convert it to integer string or use bignumber.js
    const conversionRateBigNumber = BigNumber.from(Number(conversionRate));

    const amount = this.#getSubscriptionPriceAmount(price)
      .mul(EthersBigNumber.from(10).pow(tokenPaymentInfo.decimals))
      .div(conversionRateBigNumber);
    return amount;
  }

  #getSelectedNetworkClientId() {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    return selectedNetworkClientId;
  }

  #getSelectedNetworkClient() {
    const selectedNetworkClientId = this.#getSelectedNetworkClientId();
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return networkClient;
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
