import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';
import { handleWhen, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  MoneyAccountApiDataServiceFetchPositionsAction,
  PositionResponse,
} from '@metamask/money-account-api-data-service';
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
  BALANCE_SOURCE_POLICIES,
  DEFAULT_BALANCE_SOURCE_POLICY,
  DEFAULT_BALANCE_STALE_TIME,
  LENS_ABI,
  MONEY_ACCOUNT_BALANCE_SOURCE_FEATURE_FLAG_KEY,
  MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY,
  MULTICALL3_ABI,
  MULTICALL3_ADDRESS_BY_CHAIN_ID,
  VAULT_CONFIG_FEATURE_FLAG_KEY,
  VEDA_API_NETWORK_NAMES,
  VEDA_PERFORMANCE_API_BASE_URL,
} from './constants';
import type { BalanceSource, BalanceSourcePolicy } from './constants';
import {
  MoneyAccountBalanceFetchError,
  MoneyAccountBalanceUnavailableError,
  MoneyAccountBalanceValidationError,
  VaultConfigNotAvailableError,
  VaultConfigValidationError,
  VedaResponseValidationError,
} from './errors';
import { projectLogger, createModuleLogger } from './logger';
import type { MoneyAccountBalanceServiceMethodActions } from './money-account-balance-service-method-action-types';
import { normalizeVaultApyResponse } from './requestNormalization';
import type {
  CanonicalMoneyAccountBalanceResponse,
  ExchangeRateResponse,
  MoneyAccountBalanceResponse,
  MusdEquivalentValueResponse,
  NormalizedVaultApyResponse,
} from './response.types';
import { VaultApyRawResponseStruct, VaultConfigStruct } from './structs';
import type { VaultConfig } from './types';

// === GENERAL ===

/**
 * The shape of a single result entry returned by Multicall3's `aggregate3`.
 * Mirrors the on-chain `struct Multicall3.Result`.
 */
type Multicall3Result = {
  success: boolean;
  returnData: string;
};

/**
 * ethers `CallOverrides` used for BALANCE reads (mUSD, vmUSD, Lens).
 *
 * We deliberately read at `pending` rather than `latest` to bypass the provider's block cache middleware.
 */
const PENDING_READ_OVERRIDES = { blockTag: 'pending' } as const;

/**
 * The name of the {@link MoneyAccountBalanceService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'MoneyAccountBalanceService';

export const TRACES = {
  ERC20_BALANCE_RPC: 'Get Money Account ERC20 Balance RPC',
  UNDERLYING_TOKEN_RPC: 'Get Money Account Underlying Token RPC',
  MONEY_ACCOUNT_BALANCE_RPC: 'Get Money Account Balance RPC',
  EXCHANGE_RATE_RPC: 'Get Money Account Exchange Rate RPC',
  MUSD_EQUIVALENT_VALUE_RPC: 'Get Money Account mUSD Equivalent Value RPC',
  VAULT_APY_API: 'Get Money Account Vault APY API',
} as const;

export type MoneyAccountBalanceServiceTraceName =
  (typeof TRACES)[keyof typeof TRACES];

export type MoneyAccountBalanceServiceTraceRequest = Omit<
  TraceRequest,
  'name'
> & {
  name: MoneyAccountBalanceServiceTraceName;
  startTime?: number;
};

export type MoneyAccountBalanceServiceTraceCallback = <ReturnType>(
  request: MoneyAccountBalanceServiceTraceRequest,
  fn?: (context?: TraceContext) => ReturnType,
) => Promise<ReturnType>;

const configLogger = createModuleLogger(projectLogger, 'config');
const traceLogger = createModuleLogger(projectLogger, 'trace');
const balanceLogger = createModuleLogger(projectLogger, 'balance');

const NON_NEGATIVE_INTEGER_STRING_PATTERN = /^\d+$/u;

/**
 * Validates that balance amounts are non-negative integer strings and that
 * `totalBalance === musdBalance + vmusdValueInMusd`.
 *
 * @param balance - Balance amounts to validate.
 * @throws {@link MoneyAccountBalanceValidationError} when validation fails.
 */
function assertValidBalanceAmounts(balance: MoneyAccountBalanceResponse): void {
  const entries: [keyof MoneyAccountBalanceResponse, string][] = [
    ['musdBalance', balance.musdBalance],
    ['vmusdValueInMusd', balance.vmusdValueInMusd],
    ['totalBalance', balance.totalBalance],
  ];

  for (const [field, value] of entries) {
    if (!NON_NEGATIVE_INTEGER_STRING_PATTERN.test(value)) {
      throw new MoneyAccountBalanceValidationError(
        `Invalid ${field}: expected a non-negative integer string, got '${value}'`,
      );
    }
  }

  if (
    BigInt(balance.musdBalance) + BigInt(balance.vmusdValueInMusd) !==
    BigInt(balance.totalBalance)
  ) {
    throw new MoneyAccountBalanceValidationError(
      `Invalid balance invariant: totalBalance (${balance.totalBalance}) must equal musdBalance (${balance.musdBalance}) + vmusdValueInMusd (${balance.vmusdValueInMusd})`,
    );
  }
}

/**
 * Routing table from policy to primary/fallback sources.
 */
const BALANCE_ROUTING_BY_POLICY: Record<
  BalanceSourcePolicy,
  { primary: BalanceSource; fallback: BalanceSource | null }
> = {
  api: { primary: 'api', fallback: 'rpc' },
  rpc: { primary: 'rpc', fallback: 'api' },
  'api-only': { primary: 'api', fallback: null },
  'rpc-only': { primary: 'rpc', fallback: null },
};

/**
 * Resolves primary and optional fallback sources from a routing policy.
 *
 * @param policy - The active balance source policy.
 * @returns Primary source and optional fallback.
 */
function resolveBalanceRouting(policy: BalanceSourcePolicy): {
  primary: BalanceSource;
  fallback: BalanceSource | null;
} {
  return BALANCE_ROUTING_BY_POLICY[policy];
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'fetchBalanceWithFallback',
  'getMoneyAccountBalance',
  'getMusdBalance',
  'getVmusdBalance',
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
  | RemoteFeatureFlagControllerGetStateAction
  | MoneyAccountApiDataServiceFetchPositionsAction;

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
 * vmUSD). Prefer {@link MoneyAccountBalanceService.fetchBalanceWithFallback}
 * for presentation — it selects between the Money API and Multicall3 RPC
 * sources via the `moneyAccountBalanceSource` remote feature flag.
 *
 * Lower-level methods remain available for diagnostics and source-specific
 * use cases: on-chain RPC reads (`getMoneyAccountBalance`, etc.), the Veda
 * Accountant exchange rate, and the Veda vault APY from the Seven Seas REST
 * API.
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
 * const balance = await service.fetchBalanceWithFallback('0xYourMoneyAccount...');
 * ```
 */

export type MoneyAccountBalanceServiceOptions = {
  messenger: MoneyAccountBalanceServiceMessenger;
  policyOptions?: CreateServicePolicyOptions;
  trace?: MoneyAccountBalanceServiceTraceCallback;
};

export class MoneyAccountBalanceService extends BaseDataService<
  typeof serviceName,
  MoneyAccountBalanceServiceMessenger
> {
  #vaultConfig: VaultConfig | undefined;

  /** Cache stale time (ms) for on-chain balance reads. Overridable via remote feature flag. */
  #balanceStaleTime: number = DEFAULT_BALANCE_STALE_TIME;

  /**
   * Preferred balance source routing policy. Overridable via remote feature
   * flag; defaults to Money API primary with RPC fallback.
   */
  #balanceSourcePolicy: BalanceSourcePolicy = DEFAULT_BALANCE_SOURCE_POLICY;

  readonly #trace: MoneyAccountBalanceServiceTraceCallback;

  /**
   * @param options - Constructor options.
   * @param options.messenger - The messenger for this service.
   * @param options.policyOptions - Options passed to `createServicePolicy`.
   * @param options.trace - Optional callback to trace network requests.
   */
  constructor({
    messenger,
    policyOptions = {},
    trace,
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

    this.#trace =
      trace ??
      (async <ReturnType>(
        _request: MoneyAccountBalanceServiceTraceRequest,
        fn?: (context?: TraceContext) => ReturnType,
      ): Promise<ReturnType> => {
        return await Promise.resolve(fn?.() as ReturnType);
      });

    this.messenger.subscribe(
      // eslint-disable-next-line no-restricted-syntax
      'RemoteFeatureFlagController:stateChange',
      (state) => this.#onRemoteFeatureFlagChange(state.remoteFeatureFlags),
    );

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Runs a network request and emits a best-effort backdated trace.
   *
   * @param request - Trace metadata for the network request.
   * @param fn - Network request to execute.
   * @returns The network request result.
   */
  async #traceNetworkRequest<ReturnType>(
    request: MoneyAccountBalanceServiceTraceRequest,
    fn: () => Promise<ReturnType>,
  ): Promise<ReturnType> {
    const startTime = Date.now();
    let success = false;
    let errorName: string | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      errorName = error instanceof Error ? error.name : typeof error;
      throw error;
    } finally {
      const traceRequest = {
        ...request,
        startTime,
        data: {
          ...request.data,
          success,
          ...(errorName ? { errorName } : {}),
        },
      };
      const onTraceError = (traceError: unknown): void => {
        traceLogger('Failed to emit trace', {
          traceName: request.name,
          traceError,
        });
      };

      try {
        Promise.resolve(this.#trace(traceRequest, () => undefined)).catch(
          onTraceError,
        );
      } catch (traceError) {
        onTraceError(traceError);
      }
    }
  }

  /**
   * Eagerly reads already-loaded feature flags and initialises service state.
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
      this.#onRemoteFeatureFlagChange(remoteFeatureFlags);
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
   * Applies the balance `staleTime` feature flag, falling back to
   * {@link DEFAULT_BALANCE_STALE_TIME} when the flag is absent or malformed.
   *
   * @param flagValue - Raw flag value from `remoteFeatureFlags`; expected to be
   * a non-negative number of milliseconds.
   */
  #applyBalanceStaleTimeFlag(flagValue: Json | undefined): void {
    let nextStaleTime = DEFAULT_BALANCE_STALE_TIME;

    if (flagValue !== undefined) {
      if (
        typeof flagValue === 'number' &&
        Number.isFinite(flagValue) &&
        flagValue >= 0
      ) {
        nextStaleTime = flagValue;
      } else {
        configLogger('Invalid balance staleTime flag value; using default', {
          flagValue,
          default: DEFAULT_BALANCE_STALE_TIME,
        });
      }
    }

    if (nextStaleTime !== this.#balanceStaleTime) {
      configLogger('Balance staleTime updated', {
        previous: this.#balanceStaleTime,
        next: nextStaleTime,
      });
      this.#balanceStaleTime = nextStaleTime;
    }
  }

  /**
   * Handles `RemoteFeatureFlagController:stateChange` events and the initial
   * {@link init} call.
   *
   * @param remoteFeatureFlags - The `remoteFeatureFlags` map from
   * `RemoteFeatureFlagController` state.
   */
  #onRemoteFeatureFlagChange(remoteFeatureFlags: Record<string, Json>): void {
    this.#applyBalanceStaleTimeFlag(
      remoteFeatureFlags[MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY],
    );
    this.#applyBalanceSourcePolicyFlag(
      remoteFeatureFlags[MONEY_ACCOUNT_BALANCE_SOURCE_FEATURE_FLAG_KEY],
    );
    this.#applyVaultConfig(remoteFeatureFlags[VAULT_CONFIG_FEATURE_FLAG_KEY]);
  }

  /**
   * Applies the balance source routing feature flag, falling back to
   * {@link DEFAULT_BALANCE_SOURCE_POLICY} when the flag is absent or malformed.
   *
   * @param flagValue - Raw flag value from `remoteFeatureFlags`.
   */
  #applyBalanceSourcePolicyFlag(flagValue: Json | undefined): void {
    let nextPolicy = DEFAULT_BALANCE_SOURCE_POLICY;

    if (flagValue !== undefined) {
      if (
        typeof flagValue === 'string' &&
        (BALANCE_SOURCE_POLICIES as readonly string[]).includes(flagValue)
      ) {
        nextPolicy = flagValue as BalanceSourcePolicy;
      } else {
        configLogger(
          'Invalid balance source policy flag value; using default',
          {
            flagValue,
            default: DEFAULT_BALANCE_SOURCE_POLICY,
          },
        );
      }
    }

    if (nextPolicy !== this.#balanceSourcePolicy) {
      configLogger('Balance source policy updated', {
        previous: this.#balanceSourcePolicy,
        next: nextPolicy,
      });
      this.#balanceSourcePolicy = nextPolicy;
    }
  }

  /**
   * Validates the vault config feature flag value, updates `#vaultConfig`, and
   * invalidates all cached queries when the config changes.
   * Throws {@link VaultConfigValidationError} when the flag value is malformed.
   *
   * @param flagValue - The raw flag value from `remoteFeatureFlags`.
   */
  #applyVaultConfig(flagValue: Json | undefined): void {
    const previousConfig = this.#vaultConfig;
    const hadConfig = previousConfig !== undefined;

    if (flagValue === undefined) {
      if (hadConfig) {
        // Invalidate the cache if the flag key was removed. We don't want to keep using old config values.
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
      if (hadConfig) {
        // Invalidate the cache if the config is malformed. We don't want to keep using old config values.
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
          { error },
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
    const balance = await this.#traceNetworkRequest(
      {
        name: TRACES.ERC20_BALANCE_RPC,
        data: {
          chainId,
          tokenAddress: contractAddress,
          operation: 'balanceOf',
        },
      },
      async () =>
        await contract.balanceOf(accountAddress, PENDING_READ_OVERRIDES),
    );
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
    const underlyingTokenAddress = await this.#traceNetworkRequest(
      {
        name: TRACES.UNDERLYING_TOKEN_RPC,
        data: { chainId, operation: 'base' },
      },
      async () => await contract.base(),
    );
    return underlyingTokenAddress;
  }

  /**
   * Resolves the underlying mUSD token address.
   *
   * Prefers the remotely-configured underlyingToken.
   * Falls back to on-chain read when the flag isn't available.
   *
   * @param chainId - The chain ID to use for the provider on the fallback path.
   * @returns The underlying mUSD token address.
   */
  async #resolveUnderlyingTokenAddress(chainId: Hex): Promise<Hex> {
    const { underlyingToken } = this.#requireConfig();
    if (underlyingToken) {
      return underlyingToken;
    }
    configLogger(
      'underlyingToken absent from vault config; falling back to on-chain read',
    );
    return this.#fetchUnderlyingTokenAddress(chainId);
  }

  /**
   * Returns the Multicall3 contract address for the given chain, or throws if
   * the chain is not supported.
   *
   * @param chainId - The chain ID to resolve a Multicall3 address for.
   * @returns The Multicall3 contract address.
   * @throws If no Multicall3 address is configured for the chain.
   */
  #getMulticall3Address(chainId: Hex): Hex {
    const multicall3Address = MULTICALL3_ADDRESS_BY_CHAIN_ID[chainId];
    if (!multicall3Address) {
      throw new Error(`No Multicall3 address configured for chain ${chainId}`);
    }
    return multicall3Address;
  }

  /**
   * Fetches the canonical Money account balance, selecting the Money API or
   * RPC source according to the `moneyAccountBalanceSource` remote feature
   * flag (default: API primary with RPC fallback).
   *
   * Callers must not select a source. Provenance is returned on the result so
   * fallback is never silent.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns Canonical balance amounts with source provenance.
   * @throws {@link MoneyAccountBalanceFetchError} when every eligible source
   * fails. Never returns a synthetic zero balance.
   */
  async fetchBalanceWithFallback(
    accountAddress: Hex,
  ): Promise<CanonicalMoneyAccountBalanceResponse> {
    const { primary, fallback } = resolveBalanceRouting(
      this.#balanceSourcePolicy,
    );
    const errors: unknown[] = [];

    try {
      return await this.#fetchBalanceFromSource(accountAddress, primary, false);
    } catch (primaryError) {
      errors.push(primaryError);
      balanceLogger('Primary balance source failed', {
        primary,
        fallback,
        primaryError,
      });
      if (fallback === null) {
        throw new MoneyAccountBalanceFetchError(errors);
      }
    }

    try {
      return await this.#fetchBalanceFromSource(accountAddress, fallback, true);
    } catch (fallbackError) {
      errors.push(fallbackError);
      balanceLogger('Fallback balance source failed', {
        primary,
        fallback,
        fallbackError,
      });
      throw new MoneyAccountBalanceFetchError(errors);
    }
  }

  /**
   * Fetches and validates balance from a single source.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @param source - Balance source to query.
   * @param usedFallback - Whether this attempt is a fallback after primary failure.
   * @returns Canonical balance result for the source.
   */
  async #fetchBalanceFromSource(
    accountAddress: Hex,
    source: BalanceSource,
    usedFallback: boolean,
  ): Promise<CanonicalMoneyAccountBalanceResponse> {
    if (source === 'api') {
      return await this.#fetchBalanceFromApi(accountAddress, usedFallback);
    }
    return await this.#fetchBalanceFromRpc(accountAddress, usedFallback);
  }

  /**
   * Reads balance from MoneyAccountApiDataService positions and maps it to
   * the canonical result.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @param usedFallback - Whether this attempt is a fallback.
   * @returns Canonical balance from the Money API.
   * @throws {@link MoneyAccountBalanceUnavailableError} when `balance` is null
   * or absent.
   * @throws {@link MoneyAccountBalanceValidationError} when amounts fail
   * semantic validation.
   */
  async #fetchBalanceFromApi(
    accountAddress: Hex,
    usedFallback: boolean,
  ): Promise<CanonicalMoneyAccountBalanceResponse> {
    const positions: PositionResponse = await this.messenger.call(
      'MoneyAccountApiDataService:fetchPositions',
      accountAddress,
    );

    if (positions.balance === undefined || positions.balance === null) {
      throw new MoneyAccountBalanceUnavailableError(
        'Money API returned a null or missing balance',
      );
    }

    const amounts: MoneyAccountBalanceResponse = {
      musdBalance: positions.balance.musd_balance,
      vmusdValueInMusd: positions.balance.vmusd_value_in_musd,
      totalBalance: positions.balance.total_balance,
    };
    assertValidBalanceAmounts(amounts);

    return {
      ...amounts,
      source: 'api',
      usedFallback,
    };
  }

  /**
   * Reads balance via the existing Multicall3 RPC path and maps it to the
   * canonical result.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @param usedFallback - Whether this attempt is a fallback.
   * @returns Canonical balance from RPC.
   */
  async #fetchBalanceFromRpc(
    accountAddress: Hex,
    usedFallback: boolean,
  ): Promise<CanonicalMoneyAccountBalanceResponse> {
    const amounts = await this.getMoneyAccountBalance(accountAddress);
    assertValidBalanceAmounts(amounts);

    return {
      ...amounts,
      source: 'rpc',
      usedFallback,
    };
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
          await this.#resolveUnderlyingTokenAddress(chainId);

        const balance = await this.#fetchErc20Balance(
          underlyingTokenAddress,
          accountAddress,
          chainId,
        );
        return { balance };
      },
      staleTime: this.#balanceStaleTime,
    });
  }

  /**
   * Fetches the account's total Money balance inputs in a single batched RPC
   * request via Multicall3's `aggregate3`
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The mUSD balance and the mUSD-equivalent value of vault shares as
   * raw uint256 strings. The total balance is the sum of the mUSD balance and the mUSD-equivalent value of vault shares.
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getMoneyAccountBalance(
    accountAddress: Hex,
  ): Promise<MoneyAccountBalanceResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getMoneyAccountBalance`, accountAddress],
      queryFn: async () => {
        const { chainId, boringVault, accountantAddress, lensAddress } =
          this.#requireConfig();
        const provider = this.#getProvider(chainId);

        const underlyingTokenAddress =
          await this.#resolveUnderlyingTokenAddress(chainId);

        const erc20 = new Contract(underlyingTokenAddress, abiERC20, provider);
        const lens = new Contract(lensAddress, LENS_ABI, provider);

        const calls = [
          {
            target: underlyingTokenAddress,
            allowFailure: false,
            callData: erc20.interface.encodeFunctionData('balanceOf', [
              accountAddress,
            ]),
          },
          {
            target: lensAddress,
            allowFailure: false,
            callData: lens.interface.encodeFunctionData('balanceOfInAssets', [
              accountAddress,
              boringVault,
              accountantAddress,
            ]),
          },
        ];

        const multicall3 = new Contract(
          this.#getMulticall3Address(chainId),
          MULTICALL3_ABI,
          provider,
        );
        const [musdResult, vmusdResult] = (await this.#traceNetworkRequest(
          {
            name: TRACES.MONEY_ACCOUNT_BALANCE_RPC,
            data: { chainId, operation: 'aggregate3' },
          },
          async () =>
            await multicall3.callStatic.aggregate3(
              calls,
              PENDING_READ_OVERRIDES,
            ),
        )) as [Multicall3Result, Multicall3Result];

        const musdBalanceBN = erc20.interface.decodeFunctionResult(
          'balanceOf',
          musdResult.returnData,
        )[0];
        const vmusdBN = lens.interface.decodeFunctionResult(
          'balanceOfInAssets',
          vmusdResult.returnData,
        )[0];

        return {
          musdBalance: musdBalanceBN.toString(),
          vmusdValueInMusd: vmusdBN.toString(),
          totalBalance: musdBalanceBN.add(vmusdBN).toString(),
        };
      },
      staleTime: this.#balanceStaleTime,
    });
  }

  /**
   * Fetches the vmUSD (Veda vault share) ERC-20 balance for the given
   * account address via RPC.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The vmUSD balance as a raw uint256 string.
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getVmusdBalance(accountAddress: Hex): Promise<{ balance: string }> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getVmusdBalance`, accountAddress],
      queryFn: async () => {
        const { boringVault, chainId } = this.#requireConfig();
        const balance = await this.#fetchErc20Balance(
          boringVault,
          accountAddress,
          chainId,
        );
        return { balance };
      },
      staleTime: this.#balanceStaleTime,
    });
  }

  /**
   * Fetches the current exchange rate from the Veda Accountant contract via
   * RPC. The rate represents the conversion factor from vmUSD shares to
   * the underlying mUSD asset.
   *
   * @param options - The options for the query.
   * @param options.staleTime - Cache stale time override for this query.
   * @returns The exchange rate as a raw uint256 string.
   * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
   */
  async getExchangeRate({
    staleTime,
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
        const rate = await this.#traceNetworkRequest(
          {
            name: TRACES.EXCHANGE_RATE_RPC,
            data: { chainId, operation: 'getRate' },
          },
          async () => await contract.getRate(),
        );
        return { rate: rate.toString() };
      },
      staleTime: staleTime ?? this.#balanceStaleTime,
    });
  }

  /**
   * Fetches the mUSD-equivalent value of the account's vmUSD vault shares
   * via `Lens.balanceOfInAssets` RPC.
   *
   * @param accountAddress - The Money account's Ethereum address.
   * @returns The mUSD-equivalent value of vault shares as a raw uint256 string.
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
        const balanceOfInAssets = await this.#traceNetworkRequest(
          {
            name: TRACES.MUSD_EQUIVALENT_VALUE_RPC,
            data: { chainId, operation: 'balanceOfInAssets' },
          },
          async () =>
            await contract.balanceOfInAssets(
              accountAddress,
              boringVault,
              accountantAddress,
              PENDING_READ_OVERRIDES,
            ),
        );

        return { balanceOfInAssets: balanceOfInAssets.toString() };
      },
      staleTime: this.#balanceStaleTime,
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

        const rawResponse = await this.#traceNetworkRequest(
          {
            name: TRACES.VAULT_APY_API,
            data: { chainId, operation: 'fetchVaultApy' },
          },
          async () => {
            const response = await fetch(url);

            if (!response.ok) {
              throw new HttpError(
                response.status,
                `Veda performance API failed with status '${response.status}'`,
              );
            }

            return await response.json();
          },
        );

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
