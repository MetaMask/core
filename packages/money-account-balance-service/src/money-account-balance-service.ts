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
import type {
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import { assert, is } from '@metamask/superstruct';
import type { Hex, Json } from '@metamask/utils';
import { Duration, inMilliseconds } from '@metamask/utils';

import {
  ACCOUNTANT_ABI,
  LENS_ABI,
  VAULT_CONFIG_FEATURE_FLAG_KEY,
  VEDA_API_NETWORK_NAMES,
  VEDA_PERFORMANCE_API_BASE_URL,
} from './constants';
import {
  VaultConfigNotAvailableError,
  VaultConfigValidationError,
  VedaResponseValidationError,
} from './errors';
import { projectLogger, createModuleLogger } from './logger';
import type { MoneyAccountBalanceServiceMethodActions } from './money-account-balance-service-method-action-types';
import { normalizeVaultApyResponse } from './requestNormalization';
import type {
  ExchangeRateResponse,
  MusdEquivalentValueResponse,
  NormalizedVaultApyResponse,
} from './response.types';
import { VaultApyRawResponseStruct, VaultConfigStruct } from './structs';
import type { VaultConfig } from './types';

// === GENERAL ===

/**
 * The name of the {@link MoneyAccountBalanceService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'MoneyAccountBalanceService';

const configLogger = createModuleLogger(projectLogger, 'config');

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
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction;

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
type AllowedEvents = RemoteFeatureFlagControllerStateChangeEvent;

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
 * Vault configuration (addresses, chain ID, decimals) is read from the
 * remote feature flag via {@link RemoteFeatureFlagControllerGetStateAction}.
 * Methods throw {@link VaultConfigNotAvailableError} until flags have been fetched and a
 * valid config is present.
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

type MoneyAccountBalanceServiceOptions = {
  messenger: MoneyAccountBalanceServiceMessenger;
  policyOptions?: CreateServicePolicyOptions;
};

export class MoneyAccountBalanceService extends BaseDataService<
  typeof serviceName,
  MoneyAccountBalanceServiceMessenger
> {
  #vaultConfig: VaultConfig | undefined;

  /**
   * Constructs a new MoneyAccountBalanceService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    policyOptions = {},
  }: MoneyAccountBalanceServiceOptions) {
    super({
      name: serviceName,
      messenger,
      policyOptions: {
        retryFilterPolicy: handleWhen(
          (error) =>
            !(error instanceof VedaResponseValidationError) &&
            !(error instanceof VaultConfigNotAvailableError),
        ),
        ...policyOptions,
      },
    });

    this.messenger.subscribe(
      // eslint-disable-next-line no-restricted-syntax
      'RemoteFeatureFlagController:stateChange',
      (state) => {
        const flagValue =
          state.remoteFeatureFlags[VAULT_CONFIG_FEATURE_FLAG_KEY];
        this.#onRemoteFeatureFlagChange(flagValue);
      },
    );

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Eagerly reads already-loaded feature flags and initialises `#vaultConfig`.
   *
   * Must be called after all controllers and services have been instantiated so
   * that the `RemoteFeatureFlagController:getState` action is guaranteed to be
   * registered. Validation errors are swallowed — the service degrades
   * gracefully and throws {@link VaultConfigNotAvailableError} on the first
   * method call instead.
   */
  init(): void {
    try {
      const { remoteFeatureFlags } = this.messenger.call(
        'RemoteFeatureFlagController:getState',
      );
      const flagValue = remoteFeatureFlags[VAULT_CONFIG_FEATURE_FLAG_KEY];

      if (flagValue === undefined) {
        configLogger(
          'Init complete — no vault config flag present, awaiting remote flags',
        );
        return;
      }
      this.#vaultConfig = this.#parseAndValidateVaultConfig(flagValue);
      configLogger('Vault config loaded during init', this.#vaultConfig);
    } catch (error) {
      if (error instanceof VaultConfigValidationError) {
        configLogger(
          'Init failed — vault config validation error, service will start without config',
          { error },
        );
      } else {
        configLogger(
          'Init failed — RemoteFeatureFlagController not available, service will start without config',
          { error },
        );
      }
    }
  }

  /**
   * Returns the current vault config, or throws {@link VaultConfigNotAvailableError}
   * if it has not been loaded yet.
   *
   * @returns The validated vault configuration.
   */
  #requireConfig(): VaultConfig {
    if (!this.#vaultConfig) {
      throw new VaultConfigNotAvailableError();
    }
    return this.#vaultConfig;
  }

  /**
   * Called on every `RemoteFeatureFlagController:stateChange` event.
   * Validates the flag value, updates `#vaultConfig`, and invalidates all
   * cached queries when the config changes.
   *
   * Throws {@link VaultConfigValidationError} when the flag value is malformed.
   * The messenger catches throws from event subscribers and routes them to
   * `captureException` (Sentry) — the error does NOT propagate to the
   * stateChange publisher.
   *
   * @param flagValue - The raw flag value from `remoteFeatureFlags`.
   */
  #onRemoteFeatureFlagChange(flagValue: Json | undefined): void {
    const previousConfig = this.#vaultConfig;
    const hadConfig = previousConfig !== undefined;

    if (flagValue === undefined) {
      // Flag key absent — treat as "not loaded".
      if (hadConfig) {
        this.#vaultConfig = undefined;
        configLogger(
          'Vault config cleared — flag key absent; cache invalidated',
          previousConfig,
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.invalidateQueries();
      } else {
        configLogger(
          'Flag key still absent after remote flag change — config remains unavailable',
        );
      }
      return;
    }

    let newConfig: VaultConfig;
    try {
      newConfig = this.#parseAndValidateVaultConfig(flagValue);
    } catch (error) {
      // Clear previously valid config and purge stale cache.
      if (hadConfig) {
        this.#vaultConfig = undefined;
        configLogger(
          'Vault config validation failed — previous config cleared; cache invalidated',
          { previousConfig, error },
        );
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.invalidateQueries();
      } else {
        configLogger(
          'Vault config validation failed — config was already absent',
          {
            error,
          },
        );
      }
      throw error;
    }

    if (JSON.stringify(newConfig) === JSON.stringify(this.#vaultConfig)) {
      return;
    }

    this.#vaultConfig = newConfig;
    if (hadConfig) {
      configLogger('Vault config updated; cache invalidated', {
        previous: previousConfig,
        next: newConfig,
      });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.invalidateQueries();
    } else {
      configLogger('Vault config loaded', newConfig);
    }
  }

  /**
   * Validates `flagValue` against {@link VaultConfigStruct} and returns it
   * cast as {@link VaultConfig}.
   *
   * @param flagValue - The raw JSON value from the feature flag.
   * @returns The validated vault config.
   * @throws {@link VaultConfigValidationError} if the value does not match the
   * expected shape.
   */
  #parseAndValidateVaultConfig(flagValue: Json): VaultConfig {
    try {
      assert(flagValue, VaultConfigStruct);
    } catch {
      throw new VaultConfigValidationError();
    }
    return flagValue as unknown as VaultConfig;
  }

  /**
   * Resolves a Web3Provider for the given chain ID by looking up the network
   * configuration and client via the messenger.
   *
   * @param chainId - The chain ID to resolve a provider for.
   * @returns A Web3Provider connected to the given chain.
   * @throws If no network configuration exists for the chain, or if the
   * resolved network client has no provider.
   */
  #getProvider(chainId: Hex): Web3Provider {
    const config = this.messenger.call(
      'NetworkController:getNetworkConfigurationByChainId',
      chainId,
    );

    if (!config) {
      throw new Error(`No network configuration found for chain ${chainId}`);
    }

    const { rpcEndpoints, defaultRpcEndpointIndex } = config;
    const { networkClientId } = rpcEndpoints[defaultRpcEndpointIndex];

    const networkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    if (!networkClient?.provider) {
      throw new Error(`No provider found for chain ${chainId}`);
    }

    return new Web3Provider(networkClient.provider);
  }

  /**
   * Fetches the ERC-20 balance for the given contract address and account address via RPC.
   *
   * @param contractAddress - The address of the ERC-20 contract.
   * @param accountAddress - The address of the account.
   * @param chainId - The chain ID to use for the provider.
   * @returns The balance as a raw uint256 string.
   */
  async #fetchErc20Balance(
    contractAddress: Hex,
    accountAddress: Hex,
    chainId: Hex,
  ): Promise<string> {
    const provider = this.#getProvider(chainId);
    const contract = new Contract(contractAddress, abiERC20, provider);
    const balance = await contract.balanceOf(accountAddress);
    return balance.toString();
  }

  /**
   * Fetches the underlying token address from the Accountant contract via RPC.
   *
   * @param chainId - The chain ID to use for the provider.
   * @returns The underlying token address as a hex string.
   */
  async #fetchUnderlyingTokenAddress(chainId: Hex): Promise<Hex> {
    const { accountantAddress } = this.#requireConfig();
    const provider = this.#getProvider(chainId);
    const contract = new Contract(accountantAddress, ACCOUNTANT_ABI, provider);
    const underlyingTokenAddress = await contract.base();
    return underlyingTokenAddress;
  }

  /**
   * Fetches the mUSD ERC-20 balance for the given account address via RPC.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The mUSD balance as a raw uint256 string.
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getMusdBalance(accountAddress: Hex): Promise<{ balance: string }> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdBalance`, accountAddress],
      queryFn: async () => {
        const { chainId } = this.#requireConfig();

        const underlyingTokenAddress =
          await this.#fetchUnderlyingTokenAddress(chainId);

        const balance = await this.#fetchErc20Balance(
          underlyingTokenAddress,
          accountAddress,
          chainId,
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
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getMusdSHFvdBalance(accountAddress: Hex): Promise<{ balance: string }> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdSHFvdBalance`, accountAddress],
      queryFn: async () => {
        const { boringVault, chainId } = this.#requireConfig();
        const balance = await this.#fetchErc20Balance(
          boringVault,
          accountAddress,
          chainId,
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
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getExchangeRate({
    staleTime = inMilliseconds(30, Duration.Second),
  }: { staleTime?: number } = {}): Promise<ExchangeRateResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getExchangeRate`],
      queryFn: async () => {
        const { accountantAddress, chainId } = this.#requireConfig();
        const provider = this.#getProvider(chainId);
        const contract = new Contract(
          accountantAddress,
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
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getMusdEquivalentValue(
    accountAddress: Hex,
  ): Promise<MusdEquivalentValueResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMusdEquivalentValue`, accountAddress],
      queryFn: async () => {
        const { lensAddress, boringVault, accountantAddress, chainId } =
          this.#requireConfig();
        const provider = this.#getProvider(chainId);
        const contract = new Contract(lensAddress, LENS_ABI, provider);
        const balanceOfInAssets = await contract.balanceOfInAssets(
          accountAddress,
          boringVault,
          accountantAddress,
        );

        return { balanceOfInAssets: balanceOfInAssets.toString() };
      },
      staleTime: inMilliseconds(30, Duration.Second),
    });
  }

  /**
   * Fetches the vault's APY and fee breakdown from the Veda performance REST API.
   *
   * @returns The normalized vault APY response.
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getVaultApy(): Promise<NormalizedVaultApyResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getVaultApy`],
      queryFn: async () => {
        const { chainId, boringVault } = this.#requireConfig();
        const networkName = VEDA_API_NETWORK_NAMES[chainId];

        if (!networkName) {
          throw new Error(
            `No Veda API network name found for chain ${chainId}`,
          );
        }

        const url = new URL(
          `/performance/${networkName}/${boringVault}`,
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
