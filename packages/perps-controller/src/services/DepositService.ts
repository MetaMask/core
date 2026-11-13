import { toHex } from '@metamask/controller-utils';
import { parseCaipAssetId } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { DEPOSIT_CONFIG } from '../constants/hyperLiquidConfig.js';
import type {
  AssetRoute,
  PerpsProvider,
  PerpsProviderType,
  PerpsPlatformDependencies,
  PerpsTransactionParams,
} from '../types/index.js';
import type { PerpsControllerMessengerBase } from '../types/messenger.js';
import { getSelectedEvmAccountFromMessenger } from '../utils/accountUtils.js';
import { generateDepositId } from '../utils/idUtils.js';
import { generateERC20TransferData } from '../utils/transferData.js';

// Temporary to avoid estimation failures due to insufficient balance
const DEPOSIT_GAS_LIMIT = toHex(DEPOSIT_CONFIG.EstimatedGasLimit);

/**
 * DepositService
 *
 * Handles deposit transaction preparation and validation.
 * Stateless service that prepares transaction data for TransactionController.
 * Controller handles TransactionController integration and promise lifecycle.
 *
 * Instance-based service with constructor injection of platform dependencies
 * and messenger for inter-controller communication.
 */
export class DepositService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  /**
   * Create a new DepositService instance
   *
   * @param deps - Platform dependencies for logging, metrics, etc.
   * @param messenger - Controller messenger for cross-controller communication.
   */
  constructor(
    deps: PerpsPlatformDependencies,
    messenger: PerpsControllerMessengerBase,
  ) {
    this.#deps = deps;
    this.#messenger = messenger;
  }

  /**
   * Prepare deposit transaction for confirmation
   * Extracts transaction construction logic from controller
   *
   * @param options - Configuration object
   * @param options.provider - Active provider instance
   * @returns Transaction data ready for TransactionController.addTransaction
   */
  async prepareTransaction(options: {
    provider: PerpsProvider;
    /**
     * Venue the deposit should settle on. When omitted, an aggregated
     * provider's routing default is used. A direct provider is its own venue.
     */
    providerId?: PerpsProviderType;
  }): Promise<{
    transaction: PerpsTransactionParams;
    assetChainId: Hex;
    currentDepositId: string;
    /** Venue whose route was selected; the deposit settles on that venue. */
    providerId?: PerpsProviderType;
  }> {
    const { provider } = options;

    this.#deps.debugLogger.log('DepositService: Preparing deposit transaction');

    // Generate deposit request ID for tracking
    const currentDepositId = generateDepositId();

    // Get deposit routes for the provider's own network (testnet or mainnet).
    // An aggregated provider lists every venue. The first entry is whichever
    // venue was registered first, which is not the routing default and not a
    // caller's chosen venue.
    const depositRoutes = provider.getDepositRoutes();
    const route = this.#selectDepositRoute(
      depositRoutes,
      provider,
      options.providerId,
    );
    if (!route) {
      // Fail CLOSED with a routable message instead of a TypeError, and
      // instead of funding a different venue that happens to have a route.
      // Some venues (Lighter today) advertise no deposit route at all.
      const venue = options.providerId ?? provider.getWriteProviderId?.();
      throw new Error(
        venue === undefined
          ? 'The active perps provider has no deposit route on this network'
          : `The ${venue} perps provider has no deposit route on this network`,
      );
    }
    const bridgeContractAddress = route.contractAddress;

    // Generate transfer data for ERC-20 token transfer (portable, no mobile imports)
    const transferData = generateERC20TransferData(
      bridgeContractAddress,
      '0x0',
    );

    // Get EVM account from selected account, falling back to the selected account group.
    const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);
    if (!evmAccount) {
      throw new Error(
        'No EVM-compatible account found in selected account group',
      );
    }
    const accountAddress = evmAccount.address as Hex;

    // Parse CAIP asset ID to extract chain ID and token address
    const parsedAsset = parseCaipAssetId(route.assetId);
    const assetChainId = toHex(parsedAsset.chainId.split(':')[1]);
    const tokenAddress = parsedAsset.assetReference as Hex;

    // Build transaction parameters for TransactionController
    const transaction: PerpsTransactionParams = {
      from: accountAddress,
      to: tokenAddress,
      value: '0x0',
      data: transferData,
      gas: DEPOSIT_GAS_LIMIT,
    };

    this.#deps.debugLogger.log('DepositService: Deposit transaction prepared', {
      depositId: currentDepositId,
      assetChainId,
      from: accountAddress,
      to: tokenAddress,
    });

    return {
      transaction,
      assetChainId,
      currentDepositId,
      providerId: route.providerId,
    };
  }

  /**
   * Pick the route the deposit will actually settle on.
   *
   * Untagged routes belong to a direct provider, so the first route is that
   * venue's own. Tagged routes are one entry per venue: the explicit venue
   * wins, otherwise the routing default. A venue with no route is a miss,
   * never a fallthrough to another venue's bridge.
   *
   * @param routes - Routes advertised by the provider.
   * @param provider - Provider that advertised them.
   * @param providerId - Explicit venue, when the caller named one.
   * @returns The route to fund, or undefined when that venue has none.
   */
  #selectDepositRoute(
    routes: AssetRoute[],
    provider: PerpsProvider,
    providerId?: PerpsProviderType,
  ): AssetRoute | undefined {
    if (routes.length === 0) {
      return undefined;
    }
    const venueTagged = routes.some((route) => route.providerId !== undefined);
    if (!venueTagged) {
      if (providerId !== undefined && providerId !== provider.protocolId) {
        return undefined;
      }
      return routes[0];
    }
    const targetId = providerId ?? provider.getWriteProviderId?.();
    if (targetId === undefined) {
      return undefined;
    }
    return routes.find((route) => route.providerId === targetId);
  }
}
