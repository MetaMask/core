/* eslint-disable no-restricted-syntax, id-denylist */
// TODO: Fix ESLint errors in this file - tracked for Phase 5 cleanup
import type {
  PerpsPlatformDependencies,
  PerpsControllerAccess,
} from '../types';

/**
 * RewardsIntegrationService
 *
 * Handles rewards-related operations and fee discount calculations.
 * Stateless service that coordinates with RewardsController and NetworkController.
 *
 * Instance-based service with constructor injection of platform dependencies.
 */
export class RewardsIntegrationService {
  private readonly deps: PerpsPlatformDependencies;

  /**
   * Create a new RewardsIntegrationService instance.
   *
   * @param deps - Platform dependencies for logging, metrics, etc.
   */
  constructor(deps: PerpsPlatformDependencies) {
    this.deps = deps;
  }

  /**
   * Calculate user fee discount from rewards.
   * Returns discount in basis points (e.g., 6500 = 65% discount).
   *
   * @param options - Options for fee discount calculation
   * @param options.controllers - Consolidated controller access interface
   * @returns Discount in basis points or undefined if unavailable
   */
  async calculateUserFeeDiscount(options: {
    controllers: PerpsControllerAccess;
  }): Promise<number | undefined> {
    const { controllers } = options;

    try {
      const evmAccount = controllers.accounts.getSelectedEvmAccount();

      if (!evmAccount) {
        this.deps.debugLogger.log(
          'RewardsIntegrationService: No EVM account found for fee discount',
        );
        return undefined;
      }

      // Get the chain ID using controllers.network
      const selectedNetworkClientId =
        controllers.network.getSelectedNetworkClientId();
      let chainId: string | undefined;

      try {
        chainId = controllers.network.getChainIdForNetwork(
          selectedNetworkClientId,
        );
      } catch {
        // Network client may not exist
        chainId = undefined;
      }

      if (!chainId) {
        this.deps.logger.error(
          new Error('Chain ID not found for fee discount calculation'),
          {
            context: {
              name: 'RewardsIntegrationService.calculateUserFeeDiscount',
              data: {
                selectedNetworkClientId,
              },
            },
          },
        );
        return undefined;
      }

      const caipAccountId = controllers.accounts.formatAccountToCaipId(
        evmAccount.address,
        chainId,
      );

      if (!caipAccountId) {
        this.deps.logger.error(
          new Error('Failed to format CAIP account ID for fee discount'),
          {
            context: {
              name: 'RewardsIntegrationService.calculateUserFeeDiscount',
              data: {
                address: evmAccount.address,
                chainId,
                selectedNetworkClientId,
              },
            },
          },
        );
        return undefined;
      }

      const discountBips = await controllers.rewards.getFeeDiscount(
        caipAccountId as `${string}:${string}:${string}`,
      );

      this.deps.debugLogger.log(
        'RewardsIntegrationService: Fee discount calculated',
        {
          address: evmAccount.address,
          caipAccountId,
          discountBips,
          discountPercentage: discountBips / 100,
        },
      );

      return discountBips;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.deps.logger.error(error, {
        context: {
          name: 'RewardsIntegrationService.calculateUserFeeDiscount',
          data: {},
        },
      });
      return undefined;
    }
  }
}
