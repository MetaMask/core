import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetNetworkConfigurationByChainIdAction,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { Duration, inMilliseconds } from '@metamask/utils';

import {
  ACCOUNTANT_ABI,
  ACCOUNTANT_CONTRACT_ADDRESS,
  MUSD_CONTRACT_ADDRESS,
  MUSD_DECIMALS,
  MUSDHFVD_CONTRACT_ADDRESS,
  VAULT_CHAIN_ID,
  VEDA_NETWORK,
  VEDA_PERFORMANCE_API_BASE_URL,
} from './constants';
import type { MoneyAccountBalanceServiceMethodActions } from './money-account-balance-service-method-action-types';
import type {
  ExchangeRateResponse,
  MusdBalanceResponse,
  MusdEquivalentValueResponse,
  MusdSHFvdBalanceResponse,
  VaultApyResponse,
} from './types';

// === GENERAL ===

/**
 * The name of the {@link MoneyAccountBalanceService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'MoneyAccountBalanceService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'getMusdBalance',
  'getMusdSHFvdBalance',
  'getExchangeRate',
  'getMusdEquivalentValue',
  'getVaultApy',
] as const;

/**
 * Invalidates cached queries for {@link MoneyAccountBalanceService}.
 */
export type MoneyAccountBalanceServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link MoneyAccountBalanceService} exposes to other consumers.
 */
export type MoneyAccountBalanceServiceActions =
  | MoneyAccountBalanceServiceMethodActions
  | MoneyAccountBalanceServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link MoneyAccountBalanceService} calls.
 */
type AllowedActions =
  | NetworkControllerGetNetworkConfigurationByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction;

/**
 * Published when {@link MoneyAccountBalanceService}'s cache is updated.
 */
export type MoneyAccountBalanceServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link MoneyAccountBalanceService}'s cache is
 * updated.
 */
export type MoneyAccountBalanceServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link MoneyAccountBalanceService} exposes to other consumers.
 */
export type MoneyAccountBalanceServiceEvents =
  | MoneyAccountBalanceServiceCacheUpdatedEvent
  | MoneyAccountBalanceServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link MoneyAccountBalanceService}
 * subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link MoneyAccountBalanceService}.
 */
export type MoneyAccountBalanceServiceMessenger = Messenger<
  typeof serviceName,
  MoneyAccountBalanceServiceActions | AllowedActions,
  MoneyAccountBalanceServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Data service responsible for fetching Money account balances (mUSD and
 * musdSHFvd) via on-chain RPC reads, the Veda Accountant exchange rate, and
 * the Veda vault APY from the Seven Seas REST API.
 *
 * All queries are cached via TanStack Query (inherited from
 * {@link BaseDataService}) and protected by a service policy that provides
 * automatic retries and circuit-breaking.
 *
 * @example
 *
 * ```ts
 * const service = new MoneyAccountBalanceService({
 *   messenger: moneyAccountBalanceServiceMessenger,
 * });
 *
 * const { balance } = await service.getMusdBalance('0xYourMoneyAccount...');
 * ```
 */
export class MoneyAccountBalanceService extends BaseDataService<
  typeof serviceName,
  MoneyAccountBalanceServiceMessenger
> {
  /**
   * Constructs a new MoneyAccountBalanceService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.policyOptions - Options to pass to `createServicePolicy`,
   * which is used to wrap each request.
   */
  constructor({
    messenger,
    policyOptions = {},
  }: {
    messenger: MoneyAccountBalanceServiceMessenger;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      policyOptions,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Resolves a Web3Provider for {@link VAULT_CHAIN_ID} by looking up the
   * network configuration and client via the messenger.
   *
   * @returns A Web3Provider connected to the vault chain.
   * @throws If no network configuration exists for the vault chain, or if the
   * resolved network client has no provider.
   */
  #getProvider(): Web3Provider {
    const config = this.messenger.call(
      'NetworkController:getNetworkConfigurationByChainId',
      VAULT_CHAIN_ID,
    );

    if (!config) {
      throw new Error(
        `No network configuration found for chain ${VAULT_CHAIN_ID}`,
      );
    }

    const { rpcEndpoints, defaultRpcEndpointIndex } = config;
    const { networkClientId } = rpcEndpoints[defaultRpcEndpointIndex];

    const networkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    if (!networkClient?.provider) {
      throw new Error(`No provider found for chain ${VAULT_CHAIN_ID}`);
    }

    return new Web3Provider(networkClient.provider);
  }

  /**
   * Fetches the mUSD ERC-20 balance for the given account address via RPC.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The mUSD balance as a raw uint256 string.
   */
  async getMusdBalance(accountAddress: Hex): Promise<MusdBalanceResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdBalance`, accountAddress],
      queryFn: async () => {
        const provider = this.#getProvider();
        const contract = new Contract(
          MUSD_CONTRACT_ADDRESS,
          abiERC20,
          provider,
        );
        const balance = await contract.balanceOf(accountAddress);
        return { balance: balance.toString() };
      },
      staleTime: inMilliseconds(30, Duration.Second),
    });
  }

  /**
   * Fetches the musdSHFvd (Veda vault share) ERC-20 balance for the given
   * account address via RPC.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The musdSHFvd balance as a raw uint256 string.
   */
  async getMusdSHFvdBalance(
    accountAddress: Hex,
  ): Promise<MusdSHFvdBalanceResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdSHFvdBalance`, accountAddress],
      queryFn: async () => {
        const provider = this.#getProvider();
        const contract = new Contract(
          MUSDHFVD_CONTRACT_ADDRESS,
          abiERC20,
          provider,
        );
        const balance = await contract.balanceOf(accountAddress);
        return { balance: balance.toString() } as MusdSHFvdBalanceResponse;
      },
      staleTime: inMilliseconds(30, Duration.Second),
    });
  }

  /**
   * Fetches the current exchange rate from the Veda Accountant contract via
   * RPC. The rate represents the conversion factor from musdSHFvd shares to
   * the underlying mUSD asset.
   *
   * @returns The exchange rate as a raw uint256 string.
   */
  async getExchangeRate(): Promise<ExchangeRateResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getExchangeRate`],
      queryFn: async () => {
        const provider = this.#getProvider();
        const contract = new Contract(
          ACCOUNTANT_CONTRACT_ADDRESS,
          ACCOUNTANT_ABI,
          provider,
        );
        const rate = await contract.getRate();
        return { rate: rate.toString() } as ExchangeRateResponse;
      },
      staleTime: inMilliseconds(30, Duration.Second),
    });
  }

  /**
   * Computes the mUSD-equivalent value of the account's musdSHFvd holdings.
   * Internally fetches the musdSHFvd balance and exchange rate (using cached
   * values when available within their staleTime windows), then multiplies
   * them.
   *
   * The Veda Accountant's `getRate()` returns the exchange rate in
   * `MUSD_DECIMALS` (6) precision (e.g., `1000000` = 1.0, `1050000` = 1.05).
   * Dividing by `10^MUSD_DECIMALS` removes the rate's scaling, producing
   * a result in the same 6-decimal raw units as mUSD.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The musdSHFvd balance, exchange rate, and computed
   * mUSD-equivalent value as raw uint256 strings.
   */
  async getMusdEquivalentValue(
    accountAddress: Hex,
  ): Promise<MusdEquivalentValueResponse> {
    const [{ balance: musdSHFvdBalance }, { rate: exchangeRate }] =
      await Promise.all([
        this.getMusdSHFvdBalance(accountAddress),
        this.getExchangeRate(),
      ]);

    const balanceBigInt = BigInt(musdSHFvdBalance);
    const rateBigInt = BigInt(exchangeRate);
    const musdEquivalentValue = (
      (balanceBigInt * rateBigInt) /
      BigInt(10 ** MUSD_DECIMALS)
    ).toString();

    return {
      musdSHFvdBalance,
      exchangeRate,
      musdEquivalentValue,
    };
  }

  /**
   * Fetches the vault's APY and fee breakdown from the Veda performance REST
   * API at `api.sevenseas.capital`.
   *
   * @returns The 7-day trailing net APY, fees, and per-position breakdown.
   */
  async getVaultApy(): Promise<VaultApyResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getVaultApy`],
      queryFn: async () => {
        const url = new URL(
          `/performance/${VEDA_NETWORK}/${MUSDHFVD_CONTRACT_ADDRESS}`,
          VEDA_PERFORMANCE_API_BASE_URL,
        );

        const response = await fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Veda performance API failed with status '${response.status}'`,
          );
        }

        const json = await response.json();

        return {
          apy: json.apy ?? null,
          fees: json.global_apy_breakdown?.fees ?? null,
          performanceFees: json.performance_fees ?? null,
          apyBreakdown: (
            json.global_apy_breakdown?.real_apy_breakdown ?? []
          ).map(
            (entry: {
              category?: string;
              apy?: number;
              allocation?: number;
            }) => ({
              category: entry.category ?? 'unknown',
              apy: entry.apy ?? null,
              allocation: entry.allocation ?? null,
            }),
          ),
        } as VaultApyResponse;
      },
      staleTime: inMilliseconds(5, Duration.Minute),
    });
  }
}
