import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { handleWhen, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetNetworkConfigurationByChainIdAction,
} from '@metamask/network-controller';
import { is } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';
import { Duration, inMilliseconds } from '@metamask/utils';

import {
  ACCOUNTANT_ABI,
  DEFAULT_VEDA_API_NETWORK_NAME,
  VEDA_API_NETWORK_NAMES,
  VEDA_PERFORMANCE_API_BASE_URL,
} from './constants';
import { VedaResponseValidationError } from './errors';
import type { MoneyAccountBalanceServiceMethodActions } from './money-account-balance-service-method-action-types';
import { normalizeVaultApyResponse } from './requestNormalization';
import type {
  ExchangeRateResponse,
  MusdEquivalentValueResponse,
  NormalizedVaultApyResponse,
} from './response.types';
import { VaultApyRawResponseStruct } from './structs';

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
 *   vaultAddress: '0x...',
 *   vaultChainId: '0xa4b1',
 *   accountantAddress: '0x...',
 *   underlyingTokenAddress: '0x...',
 *   underlyingTokenDecimals: 6,
 * });
 *
 * const { balance } = await service.getMusdBalance('0xYourMoneyAccount...');
 * ```
 */

type MoneyAccountBalanceServiceOptions = {
  messenger: MoneyAccountBalanceServiceMessenger;
  vaultAddress: Hex;
  vaultChainId: Hex;
  accountantAddress: Hex;
  underlyingTokenAddress: Hex;
  underlyingTokenDecimals: number;
  policyOptions?: CreateServicePolicyOptions;
};

export class MoneyAccountBalanceService extends BaseDataService<
  typeof serviceName,
  MoneyAccountBalanceServiceMessenger
> {
  readonly #networkName: string;

  readonly #vaultAddress: Hex;

  readonly #vaultChainId: Hex;

  readonly #accountantAddress: Hex;

  readonly #underlyingTokenAddress: Hex;

  readonly #underlyingTokenDecimals: number;

  /**
   * Constructs a new MoneyAccountBalanceService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.vaultAddress - The address of the Veda vault (e.g. musdSHFvd token contract).
   * @param args.vaultChainId - The chain ID of the Veda vault.
   * @param args.accountantAddress - The address of the Veda Accountant contract.
   * @param args.underlyingTokenAddress - The address of the underlying token (e.g. mUSD). Must be on the same chain as the vault.
   * @param args.underlyingTokenDecimals - The decimals of the underlying token.
   * @param args.policyOptions - Options to pass to `createServicePolicy`,
   */
  constructor({
    messenger,
    vaultAddress,
    vaultChainId,
    accountantAddress,
    underlyingTokenAddress,
    underlyingTokenDecimals,
    policyOptions = {},
  }: MoneyAccountBalanceServiceOptions) {
    super({
      name: serviceName,
      messenger,
      policyOptions: {
        retryFilterPolicy: handleWhen(
          (error) => !(error instanceof VedaResponseValidationError),
        ),
        ...policyOptions,
      },
    });

    this.#vaultAddress = vaultAddress;
    this.#vaultChainId = vaultChainId;
    this.#accountantAddress = accountantAddress;
    this.#underlyingTokenAddress = underlyingTokenAddress;
    this.#underlyingTokenDecimals = underlyingTokenDecimals;

    this.#networkName =
      VEDA_API_NETWORK_NAMES[this.#vaultChainId] ??
      DEFAULT_VEDA_API_NETWORK_NAME;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Resolves a Web3Provider for {@link MoneyAccountBalanceServiceOptions.vaultChainId} by looking up the
   * network configuration and client via the messenger.
   *
   * @returns A Web3Provider connected to the vault chain.
   * @throws If no network configuration exists for the vault chain, or if the
   * resolved network client has no provider.
   */
  #getProvider(): Web3Provider {
    const config = this.messenger.call(
      'NetworkController:getNetworkConfigurationByChainId',
      this.#vaultChainId,
    );

    if (!config) {
      throw new Error(
        `No network configuration found for chain ${this.#vaultChainId}`,
      );
    }

    const { rpcEndpoints, defaultRpcEndpointIndex } = config;
    const { networkClientId } = rpcEndpoints[defaultRpcEndpointIndex];

    const networkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    if (!networkClient?.provider) {
      throw new Error(`No provider found for chain ${this.#vaultChainId}`);
    }

    return new Web3Provider(networkClient.provider);
  }

  /**
   * Fetches the ERC-20 balance for the given contract address and account address via RPC.
   *
   * @param contractAddress - The address of the ERC-20 contract.
   * @param accountAddress - The address of the account.
   * @returns The balance as a raw uint256 string.
   */
  async #fetchErc20Balance(
    contractAddress: Hex,
    accountAddress: Hex,
  ): Promise<string> {
    const provider = this.#getProvider();
    const contract = new Contract(contractAddress, abiERC20, provider);
    const balance = await contract.balanceOf(accountAddress);
    return balance.toString();
  }

  /**
   * Fetches the mUSD ERC-20 balance for the given account address via RPC.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The mUSD balance as a raw uint256 string.
   */
  async getMusdBalance(accountAddress: Hex): Promise<{ balance: string }> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdBalance`, accountAddress],
      queryFn: async () => {
        const balance = await this.#fetchErc20Balance(
          this.#underlyingTokenAddress,
          accountAddress,
        );
        return { balance };
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
  async getMusdSHFvdBalance(accountAddress: Hex): Promise<{ balance: string }> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdSHFvdBalance`, accountAddress],
      queryFn: async () => {
        const balance = await this.#fetchErc20Balance(
          this.#vaultAddress,
          accountAddress,
        );
        return { balance };
      },
      staleTime: inMilliseconds(30, Duration.Second),
    });
  }

  /**
   * Fetches the current exchange rate from the Veda Accountant contract via
   * RPC. The rate represents the conversion factor from musdSHFvd shares to
   * the underlying mUSD asset.
   *
   * @param options - The options for the query.
   * @param options.staleTime - The stale time for the query. Defaults to 30 seconds.
   * @returns The exchange rate as a raw uint256 string.
   */
  async getExchangeRate({
    staleTime = inMilliseconds(30, Duration.Second),
  }: { staleTime?: number } = {}): Promise<ExchangeRateResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getExchangeRate`],
      queryFn: async () => {
        const provider = this.#getProvider();
        const contract = new Contract(
          this.#accountantAddress,
          ACCOUNTANT_ABI,
          provider,
        );
        const rate = await contract.getRate();
        return { rate: rate.toString() };
      },
      staleTime,
    });
  }

  /**
   * Computes the mUSD-equivalent value of the account's musdSHFvd holdings.
   * Internally fetches the musdSHFvd balance and exchange rate (using cached
   * values when available within their staleTime windows), then multiplies
   * them.
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
      10n ** BigInt(this.#underlyingTokenDecimals)
    ).toString();

    return {
      musdSHFvdBalance,
      exchangeRate,
      musdEquivalentValue,
    };
  }

  /**
   * Fetches the vault's APY and fee breakdown from the Veda performance REST API.
   *
   * @returns The normalized vault APY response.
   */
  async getVaultApy(): Promise<NormalizedVaultApyResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getVaultApy`],
      queryFn: async () => {
        const url = new URL(
          `/performance/${this.#networkName}/${this.#vaultAddress}`,
          VEDA_PERFORMANCE_API_BASE_URL,
        );

        const response = await fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Veda performance API failed with status '${response.status}'`,
          );
        }

        const rawResponse = await response.json();

        // Validate raw response inside queryFn to avoid poisoned cache.
        if (!is(rawResponse, VaultApyRawResponseStruct)) {
          throw new VedaResponseValidationError(
            'Malformed response received from Veda performance API',
          );
        }

        return normalizeVaultApyResponse(rawResponse);
      },
      staleTime: inMilliseconds(5, Duration.Minute),
    });
  }
}
