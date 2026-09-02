import type {
  AuthenticatedUserStorageServiceCreateDelegationAction,
  AuthenticatedUserStorageServiceListDelegationsAction,
} from '@metamask/authenticated-user-storage';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceAssociateAddressAction,
  ChompApiServiceCreateIntentsAction,
  ChompApiServiceCreateUpgradeAction,
  ChompApiServiceGetAssociatedAddressesAction,
  ChompApiServiceGetIntentsByAddressAction,
  ChompApiServiceGetServiceDetailsAction,
  ChompApiServiceVerifyDelegationAction,
} from '@metamask/chomp-api-service';
import type { DelegationControllerSignDelegationAction } from '@metamask/delegation-controller';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignPersonalMessageAction,
  KeyringControllerState,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import {
  areMoneyAccountVaultConfigsEqual,
  getMoneyAccountVaultConfig,
} from '@metamask/money-account-utils';
import type { MoneyAccountVaultConfig } from '@metamask/money-account-utils';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerState,
} from '@metamask/remote-feature-flag-controller';
import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  MissingMoneyAccountVaultConfigError,
  MoneyAccountUpgradeStepError,
} from './errors.js';
import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types.js';
import { associateAddressStep } from './steps/associate-address.js';
import { buildDelegationStep } from './steps/build-delegations.js';
import { eip7702AuthorizationStep } from './steps/eip-7702-authorization.js';
import { registerIntentsStep } from './steps/register-intents.js';
import type { Step } from './steps/step.js';
import type { UpgradeConfig } from './types.js';

/**
 * The Delegation Framework deployment version we resolve contract addresses
 * against in `@metamask/delegation-deployments`.
 */
const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

export const controllerName = 'MoneyAccountUpgradeController';

/**
 * Record of a Money Account upgrade sequence that ran to completion.
 */
export type MoneyAccountUpgradeStatus = {
  /**
   * Fingerprint of the upgrade config the sequence completed under. The
   * record is only trusted while the active config produces the same
   * fingerprint — if the chain, CHOMP contracts, or Delegation Framework
   * version change, the sequence re-runs.
   */
  configFingerprint: string;
  /** Unix timestamp (in milliseconds) when the sequence completed. */
  completedAt: number;
};

export type MoneyAccountUpgradeControllerState = {
  /**
   * Accounts whose upgrade sequence has fully completed, keyed by lowercased
   * account address.
   */
  upgradedAccounts: { [address: Hex]: MoneyAccountUpgradeStatus };
};

const moneyAccountUpgradeControllerMetadata = {
  upgradedAccounts: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MoneyAccountUpgradeControllerState>;

/**
 * Constructs the default {@link MoneyAccountUpgradeController} state. This
 * allows consumers to provide a partial state object when initializing the
 * controller and also helps in constructing complete state objects for this
 * controller in tests.
 *
 * @returns The default {@link MoneyAccountUpgradeController} state.
 */
export function getDefaultMoneyAccountUpgradeControllerState(): MoneyAccountUpgradeControllerState {
  return {
    upgradedAccounts: {},
  };
}

const MESSENGER_EXPOSED_METHODS = ['upgradeAccount'] as const;

export type MoneyAccountUpgradeControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerActions =
  | MoneyAccountUpgradeControllerGetStateAction
  | MoneyAccountUpgradeControllerMethodActions;

type AllowedActions =
  | AuthenticatedUserStorageServiceCreateDelegationAction
  | AuthenticatedUserStorageServiceListDelegationsAction
  | ChompApiServiceAssociateAddressAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetAssociatedAddressesAction
  | ChompApiServiceGetIntentsByAddressAction
  | ChompApiServiceGetServiceDetailsAction
  | ChompApiServiceVerifyDelegationAction
  | DelegationControllerSignDelegationAction
  | KeyringControllerGetStateAction
  | KeyringControllerSignEip7702AuthorizationAction
  | KeyringControllerSignPersonalMessageAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction;

export type MoneyAccountUpgradeControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerEvents =
  MoneyAccountUpgradeControllerStateChangedEvent;

type AllowedEvents =
  | ControllerStateChangedEvent<'KeyringController', KeyringControllerState>
  | ControllerStateChangedEvent<
      'RemoteFeatureFlagController',
      RemoteFeatureFlagControllerState
    >;

export type MoneyAccountUpgradeControllerMessenger = Messenger<
  typeof controllerName,
  MoneyAccountUpgradeControllerActions | AllowedActions,
  MoneyAccountUpgradeControllerEvents | AllowedEvents
>;

/**
 * These hooks must be provided by the client - they provide functions that required to bootstrap
 * the controller, which rely on client specific information.
 */
export type MoneyAccountUpgradeControllerHooks = {
  /**
   * Whether the Money Account feature is enabled for this client.
   *
   * The controller will call the function with the current state of
   * the remote feature flags. It gets caleld on every sync, and re-checked
   * when the bootstrap `awaits`.
   *
   * The isEnabled function should re-read any client state it depends
   * on (e.g. a version-gated flag, a "basic functionality" toggle) rather
   * than caching it. Returning `false` after a successful bootstrap disarms
   * the controller: `upgradeAccount` refuses to run until a later sync
   * re-bootstraps.
   */
  isEnabled: (remoteFeatureFlags: FeatureFlags) => boolean;

  /**
   * An asynchronous client gate checked once per bootstrap run, before any
   * network is added or external service is called — e.g. a fail-closed
   * geolocation check. A run skipped here is forgotten and retried on the
   * next sync trigger. If the function is not provided we assume the client is eligible.
   */
  isEligible?: () => Promise<boolean>;

  /**
   * Ensure the vault chain exists in the client's NetworkController before
   * the bootstrap validates it. Adding a network is client-specific, so
   * the controller awaits this before calling
   * `NetworkController:findNetworkClientIdByChainId` consumers. Defaults to a
   * no-op.
   */
  ensureChainConfigured?: (
    vaultConfig: MoneyAccountVaultConfig,
  ) => Promise<void>;

  /**
   * Called when a bootstrap run fails or cannot be scheduled. Receives a
   * {@link MissingMoneyAccountVaultConfigError} (once per controller
   * lifetime) when the enable flag is on but `moneyAccountVaultConfig` is
   * unserved or malformed.
   */
  onBootstrapError?: (error: unknown) => void;
};

/**
 * Controller that owns the Money Account upgrade sequence and its own
 * bootstrap.
 *
 * After {@link MoneyAccountUpgradeController.init} is called, the controller watches
 * `RemoteFeatureFlagController` and `KeyringController` state and bootstraps
 * itself when:
 *
 * 1. the client's `isEnabled` hook returns `true` for the current flags,
 * 2. the wallet is unlocked with an HD keyring,
 * 3. the client's `isEligible` hook (if any) resolves `true`, and
 * 4. the `moneyAccountVaultConfig` flag parses.
 *
 * The bootstrap awaits the client's `ensureChainConfigured` hook and then
 * fetches CHOMP service details to get the upgrade config. We recheck points
 * 1–2 when awaiting in the bootstrap so a lock or an `isEnabled` will stop the process.
 *
 * The bootstrap re-runs whenever the vault config changes.
 * `isEnabled` going `false` disables the controller.
 */
export class MoneyAccountUpgradeController extends BaseController<
  typeof controllerName,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeControllerMessenger
> {
  #config?: UpgradeConfig & { chainId: Hex };

  readonly #isEnabled: MoneyAccountUpgradeControllerHooks['isEnabled'];

  readonly #isEligible: NonNullable<
    MoneyAccountUpgradeControllerHooks['isEligible']
  >;

  readonly #ensureChainConfigured: NonNullable<
    MoneyAccountUpgradeControllerHooks['ensureChainConfigured']
  >;

  readonly #onBootstrapError: NonNullable<
    MoneyAccountUpgradeControllerHooks['onBootstrapError']
  >;

  #initialized = false;

  #bootstrap?: Promise<void>;

  #bootstrappedConfig?: MoneyAccountVaultConfig;

  #missingConfigReported = false;

  readonly #steps: Step[] = [
    associateAddressStep,
    eip7702AuthorizationStep,
    buildDelegationStep,
    registerIntentsStep,
  ];

  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state, merged with the defaults.
   * @param options.hooks - The client hooks for the bootstrap; see
   * {@link MoneyAccountUpgradeControllerHooks}.
   */
  constructor({
    messenger,
    state,
    hooks,
  }: {
    messenger: MoneyAccountUpgradeControllerMessenger;
    state?: Partial<MoneyAccountUpgradeControllerState>;
    hooks: MoneyAccountUpgradeControllerHooks;
  }) {
    super({
      messenger,
      metadata: moneyAccountUpgradeControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultMoneyAccountUpgradeControllerState(),
        ...state,
      },
    });

    this.#isEnabled = hooks.isEnabled;
    this.#isEligible = hooks.isEligible ?? (async (): Promise<boolean> => true);
    this.#ensureChainConfigured =
      hooks.ensureChainConfigured ?? (async (): Promise<void> => undefined);
    this.#onBootstrapError = hooks.onBootstrapError ?? ((): void => undefined);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Start the controller's bootstrap: subscribe to the feature-flag and
   * keyring triggers and run an initial sync. Call once, after all
   * controllers and services the messenger reaches are constructed — this is
   * the only method that may be called before the controller is bootstrapped,
   * and it is the reason the constructor performs no messenger calls.
   */
  init(): void {
    if (this.#initialized) {
      return;
    }
    this.#initialized = true;

    this.messenger.subscribe('RemoteFeatureFlagController:stateChanged', () =>
      this.sync(),
    );
    this.messenger.subscribe('KeyringController:stateChanged', () =>
      this.sync(),
    );
    this.sync();
  }

  /**
   * Re-evaluate the bootstrap checks against live state and schedule a
   * bootstrap run when they are open and the vault config is new. Runs on
   * every feature-flag and keyring state change.
   *
   * If sync fails a failure is reported through `onBootstrapError` and retried
   * on the next trigger.
   */
  sync(): void {
    try {
      const { remoteFeatureFlags } = this.messenger.call(
        'RemoteFeatureFlagController:getState',
      );

      if (!this.#isEnabled(remoteFeatureFlags)) {
        // Disarm so a later `upgradeAccount` cannot run against a config
        // armed while the feature was still enabled. Re-enabling re-runs the
        // bootstrap from scratch.
        this.#config = undefined;
        this.#bootstrappedConfig = undefined;
        return;
      }

      if (!this.#isWalletReady()) {
        return;
      }

      const vaultConfig = getMoneyAccountVaultConfig(remoteFeatureFlags);
      if (!vaultConfig) {
        this.#reportMissingConfig();
        return;
      }

      if (
        this.#bootstrappedConfig &&
        areMoneyAccountVaultConfigsEqual(vaultConfig, this.#bootstrappedConfig)
      ) {
        return;
      }

      this.#scheduleBootstrap(vaultConfig);
    } catch (error) {
      this.#onBootstrapError(error);
    }
  }

  /**
   * Whether the wallet can sign right now: unlocked with an HD keyring. The
   * keyring list matters because during a vault restore the unlock flips
   * before the keyrings land in state.
   *
   * @returns Whether the wallet is ready.
   */
  #isWalletReady(): boolean {
    const { isUnlocked, keyrings } = this.messenger.call(
      'KeyringController:getState',
    );
    return (
      isUnlocked && keyrings.some((keyring) => keyring.type === KeyringTypes.hd)
    );
  }

  /**
   * Whether the synchronous bootstrap gates are open right now. Re-read from
   * live state on every call because the bootstrap re-validates them across
   * its `await` points.
   *
   * @returns Whether the bootstrap may proceed.
   */
  #areGatesOpen(): boolean {
    const { remoteFeatureFlags } = this.messenger.call(
      'RemoteFeatureFlagController:getState',
    );
    return this.#isEnabled(remoteFeatureFlags) && this.#isWalletReady();
  }

  #scheduleBootstrap(vaultConfig: MoneyAccountVaultConfig): void {
    this.#bootstrappedConfig = vaultConfig;

    const run = async (): Promise<void> => {
      // The gates were checked when this run was scheduled, but it may start
      // much later, chained behind an in-flight bootstrap. Eligibility comes
      // after the gates so a disabled client also skips the (possibly
      // external) eligibility lookup.
      if (!this.#areGatesOpen() || !(await this.#isEligible())) {
        this.#forget(vaultConfig);
        return;
      }

      await this.#ensureChainConfigured(vaultConfig);

      // Configuring the chain can suspend for a while, so re-check the gates
      // before the external CHOMP call.
      if (!this.#areGatesOpen()) {
        this.#forget(vaultConfig);
        return;
      }

      await this.#applyVaultConfig(vaultConfig);
    };

    const bootstrap = this.#bootstrap
      ? this.#bootstrap.catch(() => undefined).then(run)
      : run();
    this.#bootstrap = bootstrap;

    bootstrap.catch((error) => {
      this.#onBootstrapError(error);
      this.#forget(vaultConfig);
    });
  }

  /**
   * Forget a scheduled bootstrap that was skipped or failed, so the next
   * trigger re-runs it — but only if no newer config has been scheduled
   * meanwhile: a newer config supersedes this run, success or failure.
   *
   * @param vaultConfig - The config the abandoned run was scheduled with.
   */
  #forget(vaultConfig: MoneyAccountVaultConfig): void {
    if (this.#bootstrappedConfig === vaultConfig) {
      this.#bootstrappedConfig = undefined;
    }
  }

  /**
   * Report a served enable flag without a usable `moneyAccountVaultConfig` —
   * a flag misconfiguration that silently disables upgrades. Reported once
   * per controller lifetime; flag refreshes arrive continuously and would
   * otherwise spam.
   */
  #reportMissingConfig(): void {
    if (!this.#missingConfigReported) {
      this.#missingConfigReported = true;
      this.#onBootstrapError(new MissingMoneyAccountVaultConfigError());
    }
  }

  /**
   * Fetches service details and validates the controller can operate on the
   * vault's chain, arming the upgrade config `upgradeAccount` runs against.
   * Resolves the Delegation Framework contract addresses for the chain from
   * `@metamask/delegation-deployments`.
   *
   * @param vaultConfig - The vault config to arm; its `boringVault` is the
   * withdrawal-side delegation token (vmUSD), supplied via the flag until
   * the CHOMP service-details API exposes it.
   */
  async #applyVaultConfig(vaultConfig: MoneyAccountVaultConfig): Promise<void> {
    const { chainId, boringVault: boringVaultAddress } = vaultConfig;

    const contracts =
      DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][hexToNumber(chainId)];
    if (!contracts) {
      throw new Error(
        `Delegation Framework ${DELEGATION_FRAMEWORK_VERSION} is not deployed on chain ${chainId}`,
      );
    }

    const response = await this.messenger.call(
      'ChompApiService:getServiceDetails',
      [chainId],
    );

    const chain = response.chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not found in service details response`);
    }

    const { vedaProtocol } = chain.protocol;
    if (!vedaProtocol) {
      throw new Error(
        `vedaProtocol not found for chain ${chainId} in service details response`,
      );
    }

    if (vedaProtocol.supportedTokens.length === 0) {
      throw new Error(
        `No supported tokens found for vedaProtocol on chain ${chainId}`,
      );
    }

    // A disarm (isEnabled flipping off) or a newer scheduled config during
    // the CHOMP call supersedes this run: arming now would resurrect a config
    // the controller just dropped, or briefly shadow the newer one.
    if (this.#bootstrappedConfig !== vaultConfig) {
      return;
    }

    this.#config = {
      chainId,
      delegateAddress: chain.autoDepositDelegate,
      musdTokenAddress: vedaProtocol.supportedTokens[0].tokenAddress,
      boringVaultAddress,
      vedaVaultAdapterAddress: vedaProtocol.adapterAddress,
      delegatorImplAddress: contracts.EIP7702StatelessDeleGatorImpl,
      erc20TransferAmountEnforcer: contracts.ERC20TransferAmountEnforcer,
      redeemerEnforcer: contracts.RedeemerEnforcer,
      valueLteEnforcer: contracts.ValueLteEnforcer,
    };
  }

  /**
   * Runs each step in the upgrade sequence in order. A step that reports
   * `'already-done'` is skipped without performing any action; a step that
   * reports `'completed'` has performed its action. An error thrown by any
   * step halts the sequence and is re-thrown wrapped in a
   * {@link MoneyAccountUpgradeStepError} that records which step failed (the
   * original error is preserved as `cause`).
   *
   * A run that completes is recorded in state (keyed by lowercased address,
   * fingerprinted against the active config); subsequent calls for a
   * recorded account return immediately without running any steps. If the
   * active config no longer matches the recorded fingerprint, the sequence
   * re-runs.
   *
   * A call that arrives while the bootstrap is still in flight waits for it
   * rather than failing; it only throws when no bootstrap has armed a config
   * (feature disabled, wallet locked, or the last bootstrap failed).
   *
   * @param address - The Money Account address to upgrade.
   */
  async upgradeAccount(address: Hex): Promise<void> {
    if (!this.#config && this.#bootstrap) {
      await this.#bootstrap.catch(() => undefined);
    }
    if (!this.#config) {
      throw new Error(
        'MoneyAccountUpgradeController is not bootstrapped: upgradeAccount() requires the feature flag on, the wallet unlocked, and a successful bootstrap',
      );
    }
    const config = this.#config;

    const accountKey = address.toLowerCase() as Hex;
    const configFingerprint = computeConfigFingerprint(config);
    if (
      this.state.upgradedAccounts[accountKey]?.configFingerprint ===
      configFingerprint
    ) {
      return;
    }

    for (const step of this.#steps) {
      try {
        await step.run({
          messenger: this.messenger,
          address,
          ...config,
        });
      } catch (error) {
        throw new MoneyAccountUpgradeStepError(step.name, error);
      }
    }

    this.update((state) => {
      state.upgradedAccounts[accountKey] = {
        configFingerprint,
        completedAt: Date.now(),
      };
    });
  }
}

/**
 * Derives a stable fingerprint of the config fields that define what
 * "upgraded" means for an account. A recorded upgrade is only trusted while
 * the active config produces the same fingerprint.
 *
 * @param config - The active upgrade config.
 * @returns A canonical string over the config's identifying fields.
 */
function computeConfigFingerprint(
  config: UpgradeConfig & { chainId: Hex },
): string {
  return [
    DELEGATION_FRAMEWORK_VERSION,
    config.chainId,
    config.delegateAddress,
    config.musdTokenAddress,
    config.boringVaultAddress,
    config.vedaVaultAdapterAddress,
    config.delegatorImplAddress,
    config.erc20TransferAmountEnforcer,
    config.redeemerEnforcer,
    config.valueLteEnforcer,
  ]
    .map((value) => value.toLowerCase())
    .join('|');
}
