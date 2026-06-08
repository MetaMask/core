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

/** Verbose timing / request logging for debugging stuck balance loads — temporary */
const balanceDebugLogger = createModuleLogger(projectLogger, 'balance-debug');

/**
 * Logs start, success or error with elapsed time. Intended only for temporary
 * debugging of stuck RPC / HTTP calls.
 *
 * @param phase - Stable label used in log lines.
 * @param details - Structured context (no secrets — avoid logging raw RPC URLs).
 * @param operation - Async work to wrap.
 */
async function withBalanceDebugTiming<T>(
  phase: string,
  details: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const startedAtWallMs = Date.now();
  balanceDebugLogger(`${phase}:start`, { ...details, startedAtWallMs });
  try {
    const result = await operation();
    balanceDebugLogger(`${phase}:ok`, {
      ...details,
      elapsedMs: Math.round(performance.now() - startedAt),
      startedAtWallMs,
    });
    return result;
  } catch (error) {
    balanceDebugLogger(`${phase}:error`, {
      ...details,
      elapsedMs: Math.round(performance.now() - startedAt),
      startedAtWallMs,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
    throw error;
  }
}

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
    const t0 = performance.now();
    balanceDebugLogger('getProvider:start', {
      chainId,
      step: 'getNetworkConfigurationByChainId',
    });

    const config = this.messenger.call(
      'NetworkController:getNetworkConfigurationByChainId',
      chainId,
    );

    if (!config) {
      balanceDebugLogger('getProvider:error', {
        chainId,
        reason: 'no_network_configuration',
        elapsedMs: Math.round(performance.now() - t0),
      });
      throw new Error(`No network configuration found for chain ${chainId}`);
    }

    const { rpcEndpoints, defaultRpcEndpointIndex, name: networkName } = config;
    const selectedEndpoint = rpcEndpoints[defaultRpcEndpointIndex];
    const { networkClientId } = selectedEndpoint;

    balanceDebugLogger('getProvider:network_config', {
      chainId,
      networkName,
      defaultRpcEndpointIndex,
      rpcEndpointCount: rpcEndpoints.length,
      networkClientId,
      // Omit raw RPC URLs — often contain API keys
      rpcEndpointType: selectedEndpoint?.type,
    });

    balanceDebugLogger('getProvider:step', {
      chainId,
      step: 'getNetworkClientById',
      networkClientId,
    });

    const networkClient = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    if (!networkClient?.provider) {
      balanceDebugLogger('getProvider:error', {
        chainId,
        networkClientId,
        reason: 'no_provider_on_network_client',
        elapsedMs: Math.round(performance.now() - t0),
      });
      throw new Error(`No provider found for chain ${chainId}`);
    }

    balanceDebugLogger('getProvider:ok', {
      chainId,
      networkClientId,
      elapsedMs: Math.round(performance.now() - t0),
    });

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
    balanceDebugLogger('fetchErc20Balance:about_to_get_provider', {
      chainId,
      contractAddress,
      accountAddress,
    });
    const provider = this.#getProvider(chainId);
    const contract = new Contract(contractAddress, abiERC20, provider);

    const balance = await withBalanceDebugTiming(
      'fetchErc20Balance:balanceOf',
      { chainId, contractAddress, accountAddress },
      async () => contract.balanceOf(accountAddress),
    );

    balanceDebugLogger('fetchErc20Balance:resolved', {
      chainId,
      contractAddress,
      accountAddress,
      balanceLengthChars: balance.toString().length,
    });

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
    balanceDebugLogger('fetchUnderlyingTokenAddress:about_to_get_provider', {
      chainId,
      accountantAddress,
    });
    const provider = this.#getProvider(chainId);
    const contract = new Contract(accountantAddress, ACCOUNTANT_ABI, provider);
    const underlyingTokenAddress = await withBalanceDebugTiming(
      'fetchUnderlyingTokenAddress:contract.base',
      { chainId, accountantAddress },
      async () => contract.base(),
    );
    balanceDebugLogger('fetchUnderlyingTokenAddress:resolved', {
      chainId,
      accountantAddress,
      underlyingTokenAddress,
    });
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
        const queryStarted = performance.now();
        balanceDebugLogger('getMusdBalance:queryFn:start', {
          accountAddress,
          queryKeyHint: 'getMusdBalance',
        });

        const { chainId } = this.#requireConfig();
        balanceDebugLogger('getMusdBalance:queryFn:after_require_config', {
          accountAddress,
          chainId,
          elapsedMs: Math.round(performance.now() - queryStarted),
        });

        const underlyingTokenAddress =
          await this.#fetchUnderlyingTokenAddress(chainId);

        balanceDebugLogger('getMusdBalance:queryFn:after_underlying_token', {
          accountAddress,
          chainId,
          underlyingTokenAddress,
          elapsedMs: Math.round(performance.now() - queryStarted),
        });

        const balance = await this.#fetchErc20Balance(
          underlyingTokenAddress,
          accountAddress,
          chainId,
        );

        balanceDebugLogger('getMusdBalance:queryFn:complete', {
          accountAddress,
          chainId,
          totalElapsedMs: Math.round(performance.now() - queryStarted),
          balancePreview: balance.slice(0, 24),
        });

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
        const queryStarted = performance.now();
        balanceDebugLogger('getMusdSHFvdBalance:queryFn:start', {
          accountAddress,
          queryKeyHint: 'getMusdSHFvdBalance',
        });

        const { boringVault, chainId } = this.#requireConfig();
        balanceDebugLogger('getMusdSHFvdBalance:queryFn:after_require_config', {
          accountAddress,
          chainId,
          boringVault,
          elapsedMs: Math.round(performance.now() - queryStarted),
        });

        const balance = await this.#fetchErc20Balance(
          boringVault,
          accountAddress,
          chainId,
        );

        balanceDebugLogger('getMusdSHFvdBalance:queryFn:complete', {
          accountAddress,
          chainId,
          boringVault,
          totalElapsedMs: Math.round(performance.now() - queryStarted),
          balancePreview: balance.slice(0, 24),
        });

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
        const queryStarted = performance.now();
        balanceDebugLogger('getExchangeRate:queryFn:start', {
          queryKeyHint: 'getExchangeRate',
        });

        const { accountantAddress, chainId } = this.#requireConfig();
        balanceDebugLogger('getExchangeRate:queryFn:after_require_config', {
          chainId,
          accountantAddress,
          elapsedMs: Math.round(performance.now() - queryStarted),
        });

        balanceDebugLogger('getExchangeRate:queryFn:before_get_provider', {
          chainId,
        });
        const provider = this.#getProvider(chainId);
        const contract = new Contract(
          accountantAddress,
          ACCOUNTANT_ABI,
          provider,
        );
        const rate = await withBalanceDebugTiming(
          'getExchangeRate:contract.getRate',
          { chainId, accountantAddress },
          async () => contract.getRate(),
        );

        balanceDebugLogger('getExchangeRate:queryFn:complete', {
          chainId,
          accountantAddress,
          totalElapsedMs: Math.round(performance.now() - queryStarted),
          ratePreview: rate.toString().slice(0, 24),
        });

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
        const queryStarted = performance.now();
        balanceDebugLogger('getMusdEquivalentValue:queryFn:start', {
          accountAddress,
          queryKeyHint: 'getMusdEquivalentValue',
        });

        const { lensAddress, boringVault, accountantAddress, chainId } =
          this.#requireConfig();
        balanceDebugLogger('getMusdEquivalentValue:queryFn:after_require_config', {
          accountAddress,
          chainId,
          lensAddress,
          boringVault,
          accountantAddress,
          elapsedMs: Math.round(performance.now() - queryStarted),
        });

        balanceDebugLogger(
          'getMusdEquivalentValue:queryFn:before_balanceOfInAssets',
          { accountAddress, chainId },
        );
        const provider = this.#getProvider(chainId);
        const contract = new Contract(lensAddress, LENS_ABI, provider);
        const balanceOfInAssets = await withBalanceDebugTiming(
          'getMusdEquivalentValue:contract.balanceOfInAssets',
          {
            accountAddress,
            chainId,
            lensAddress,
            boringVault,
            accountantAddress,
          },
          async () =>
            contract.balanceOfInAssets(
              accountAddress,
              boringVault,
              accountantAddress,
            ),
        );

        balanceDebugLogger('getMusdEquivalentValue:queryFn:complete', {
          accountAddress,
          chainId,
          totalElapsedMs: Math.round(performance.now() - queryStarted),
          balanceOfInAssetsPreview: balanceOfInAssets.toString().slice(0, 24),
        });

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
        const queryStarted = performance.now();
        balanceDebugLogger('getVaultApy:queryFn:start', {
          queryKeyHint: 'getVaultApy',
        });

        const { chainId, boringVault } = this.#requireConfig();
        balanceDebugLogger('getVaultApy:queryFn:after_require_config', {
          chainId,
          boringVault,
          elapsedMs: Math.round(performance.now() - queryStarted),
          knownVedaChainIds: Object.keys(VEDA_API_NETWORK_NAMES),
        });

        const networkName = VEDA_API_NETWORK_NAMES[chainId];

        if (!networkName) {
          balanceDebugLogger('getVaultApy:queryFn:error:no_veda_network_name', {
            chainId,
            boringVault,
            elapsedMs: Math.round(performance.now() - queryStarted),
          });
          throw new Error(
            `No Veda API network name found for chain ${chainId}`,
          );
        }

        const url = new URL(
          `/performance/${networkName}/${boringVault}`,
          VEDA_PERFORMANCE_API_BASE_URL,
        );

        balanceDebugLogger('getVaultApy:veda_request:prepared', {
          chainId,
          boringVault,
          networkName,
          baseUrl: VEDA_PERFORMANCE_API_BASE_URL,
          fullHref: url.href,
          pathname: url.pathname,
        });

        const fetchStarted = performance.now();
        balanceDebugLogger('getVaultApy:veda_request:fetch_start', {
          fullHref: url.href,
          startedAtWallMs: Date.now(),
        });

        const response = await fetch(url);

        balanceDebugLogger('getVaultApy:veda_request:fetch_headers_received', {
          fullHref: url.href,
          status: response.status,
          ok: response.ok,
          elapsedMsSinceFetchStart: Math.round(
            performance.now() - fetchStarted,
          ),
          contentType: response.headers.get('content-type'),
          // Helpful when debugging CDN / cache behavior (may be absent)
          cfRay: response.headers.get('cf-ray'),
        });

        if (!response.ok) {
          let errorBodySnippet: string | undefined;
          try {
            errorBodySnippet = (await response.text()).slice(0, 512);
          } catch {
            errorBodySnippet = undefined;
          }
          balanceDebugLogger('getVaultApy:veda_request:http_error_body', {
            fullHref: url.href,
            status: response.status,
            errorBodySnippet,
          });
          throw new HttpError(
            response.status,
            `Veda performance API failed with status '${response.status}'`,
          );
        }

        const jsonStarted = performance.now();
        const rawResponse = await response.json();
        balanceDebugLogger('getVaultApy:veda_request:json_parsed', {
          fullHref: url.href,
          jsonParseElapsedMs: Math.round(performance.now() - jsonStarted),
          totalElapsedSinceFetchStartMs: Math.round(
            performance.now() - fetchStarted,
          ),
          rawKeys:
            rawResponse !== null &&
            typeof rawResponse === 'object' &&
            !Array.isArray(rawResponse)
              ? Object.keys(rawResponse as object)
              : typeof rawResponse,
        });

        // Validate raw response inside queryFn to avoid poisoned cache.
        if (!is(rawResponse, VaultApyRawResponseStruct)) {
          balanceDebugLogger('getVaultApy:veda_response:validation_failed', {
            fullHref: url.href,
            rawResponseSnippet: JSON.stringify(rawResponse).slice(0, 512),
          });
          throw new VedaResponseValidationError(
            'Malformed response received from Veda performance API',
          );
        }

        balanceDebugLogger('getVaultApy:veda_request:success', {
          fullHref: url.href,
          totalElapsedSinceFetchStartMs: Math.round(
            performance.now() - fetchStarted,
          ),
        });

        const normalized = normalizeVaultApyResponse(rawResponse);

        balanceDebugLogger('getVaultApy:queryFn:complete', {
          chainId,
          boringVault,
          fullHref: url.href,
          totalQueryFnElapsedMs: Math.round(
            performance.now() - queryStarted,
          ),
        });

        return normalized;
      },
      staleTime: inMilliseconds(5, Duration.Minute),
    });
  }
}
