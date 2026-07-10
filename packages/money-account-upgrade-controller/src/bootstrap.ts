/**
 * Bootstrap orchestration for the MoneyAccountUpgradeController, shared by
 * every client. Bootstrapping is controlled by two signals: the money-account
 * remote feature flag being on and the keyring being unlocked. Clients inject
 * how each signal is read/observed and what the bootstrap itself does (e.g.
 * provisioning the chain and calling `controller.init`); the sequencing,
 * schedule-once semantics, and ready-promise gate live here.
 */

type Unsubscribe = () => void;

/**
 * The phase a bootstrap error was raised in: `missing-vault-config` when the
 * feature flag is on but carries no vault config, `bootstrap` when the
 * client's bootstrap action rejected.
 */
export type MoneyAccountUpgradeBootstrapErrorPhase =
  | 'missing-vault-config'
  | 'bootstrap';

export type MoneyAccountUpgradeBootstrapOptions<FlagsState, VaultConfig> = {
  /** Read the current feature-flag state. */
  getFeatureFlagState: () => FlagsState;
  /**
   * Observe feature-flag state changes. Returns an unsubscribe function; the
   * bootstrap unsubscribes itself once it has been scheduled.
   */
  onFeatureFlagStateChange: (
    listener: (state: FlagsState) => void,
  ) => Unsubscribe;
  /** Whether the money-account feature is enabled in the given state. */
  isEnabled: (state: FlagsState) => boolean;
  /**
   * Extract the vault config from the given state. Returning undefined while
   * `isEnabled` holds is reported as a `missing-vault-config` error.
   */
  getVaultConfig: (state: FlagsState) => VaultConfig | undefined;
  /** Whether the keyring is currently unlocked. */
  isKeyringUnlocked: () => boolean;
  /**
   * Observe the keyring-unlock signal. Returns an unsubscribe function; the
   * bootstrap unsubscribes itself after the first unlock.
   */
  onKeyringUnlock: (listener: () => void) => Unsubscribe;
  /**
   * The client's bootstrap action, run exactly once — e.g. ensure the chain
   * is configured, then `controller.init(...)`.
   */
  bootstrap: (vaultConfig: VaultConfig) => Promise<void>;
  /** Error sink (e.g. Sentry), keyed by the phase the error was raised in. */
  onError: (
    error: Error,
    phase: MoneyAccountUpgradeBootstrapErrorPhase,
  ) => void;
};

export type MoneyAccountUpgradeBootstrapHandle = {
  /**
   * Resolves once the bootstrap action has run. Rejects if it failed, or if
   * it hasn't been scheduled yet (i.e. the flag is off or the keyring is
   * still locked). Callers that depend on the controller being initialized —
   * e.g. `upgradeAccount` — should await this first.
   */
  whenReady: () => Promise<void>;
  /**
   * Evaluate the flag state now and either schedule the bootstrap or watch
   * for a flag change that enables it. Call once during client init.
   */
  start: () => void;
};

/**
 * Create the money-account upgrade bootstrap orchestrator.
 *
 * @param options - The injected signal sources and bootstrap action.
 * @returns The bootstrap handle: `start` to begin watching, `whenReady` to
 * await initialization.
 */
export function createMoneyAccountUpgradeBootstrap<FlagsState, VaultConfig>(
  options: MoneyAccountUpgradeBootstrapOptions<FlagsState, VaultConfig>,
): MoneyAccountUpgradeBootstrapHandle {
  let bootstrapPromise: Promise<void> | null = null;
  let bootstrapScheduled = false;

  const whenReady = (): Promise<void> =>
    bootstrapPromise ??
    Promise.reject(
      new Error(
        'MoneyAccountUpgradeController bootstrap has not been scheduled yet',
      ),
    );

  const runBootstrap = (vaultConfig: VaultConfig): void => {
    bootstrapPromise = options.bootstrap(vaultConfig);
    bootstrapPromise.catch((error) =>
      options.onError(error as Error, 'bootstrap'),
    );
  };

  const scheduleBootstrap = (vaultConfig: VaultConfig): void => {
    if (bootstrapScheduled) {
      return;
    }
    bootstrapScheduled = true;

    if (options.isKeyringUnlocked()) {
      runBootstrap(vaultConfig);
      return;
    }
    const unsubscribe = options.onKeyringUnlock(() => {
      unsubscribe();
      runBootstrap(vaultConfig);
    });
  };

  const tryStart = (state: FlagsState): boolean => {
    if (!options.isEnabled(state)) {
      return false;
    }
    const vaultConfig = options.getVaultConfig(state);
    if (!vaultConfig) {
      options.onError(
        new Error('Missing Money Account vault config'),
        'missing-vault-config',
      );
      return false;
    }
    scheduleBootstrap(vaultConfig);
    return true;
  };

  const start = (): void => {
    if (tryStart(options.getFeatureFlagState())) {
      return;
    }
    const unsubscribe = options.onFeatureFlagStateChange((state) => {
      if (tryStart(state)) {
        unsubscribe();
      }
    });
  };

  return { whenReady, start };
}
