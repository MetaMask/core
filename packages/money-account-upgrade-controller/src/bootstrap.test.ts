import type {
  MoneyAccountUpgradeBootstrapHandle,
  MoneyAccountUpgradeBootstrapOptions,
} from './bootstrap';
import { createMoneyAccountUpgradeBootstrap } from './bootstrap';

type Flags = { enabled: boolean; vaultConfig?: { chainId: string } };

const VAULT_CONFIG = { chainId: '0x8f' };

type Harness = {
  handle: MoneyAccountUpgradeBootstrapHandle;
  bootstrap: jest.Mock;
  onError: jest.Mock;
  unsubscribeFlags: jest.Mock;
  unsubscribeUnlock: jest.Mock;
  emitFlags: (state: Flags) => void;
  hasFlagListener: () => boolean;
  emitUnlock: () => void;
  hasUnlockListener: () => boolean;
};

/**
 * Build the orchestrator with controllable fakes for every injected signal.
 *
 * @param initialFlags - The flag state returned by `getFeatureFlagState`.
 * @param unlocked - Whether the keyring starts unlocked.
 * @returns The handle plus the fakes for driving signals and asserting calls.
 */
function setup(initialFlags: Flags, unlocked = true): Harness {
  let flagListener: ((state: Flags) => void) | undefined;
  let unlockListener: (() => void) | undefined;
  const unsubscribeFlags = jest.fn(() => {
    flagListener = undefined;
  });
  const unsubscribeUnlock = jest.fn(() => {
    unlockListener = undefined;
  });
  const bootstrap = jest.fn().mockResolvedValue(undefined);
  const onError = jest.fn();

  const options: MoneyAccountUpgradeBootstrapOptions<
    Flags,
    { chainId: string }
  > = {
    getFeatureFlagState: () => initialFlags,
    onFeatureFlagStateChange: (listener) => {
      flagListener = listener;
      return unsubscribeFlags;
    },
    isEnabled: (state) => state.enabled,
    getVaultConfig: (state) => state.vaultConfig,
    isKeyringUnlocked: () => unlocked,
    onKeyringUnlock: (listener) => {
      unlockListener = listener;
      return unsubscribeUnlock;
    },
    bootstrap,
    onError,
  };

  const handle = createMoneyAccountUpgradeBootstrap(options);

  return {
    handle,
    bootstrap,
    onError,
    unsubscribeFlags,
    unsubscribeUnlock,
    emitFlags: (state: Flags): void => flagListener?.(state),
    hasFlagListener: (): boolean => flagListener !== undefined,
    emitUnlock: (): void => unlockListener?.(),
    hasUnlockListener: (): boolean => unlockListener !== undefined,
  };
}

describe('createMoneyAccountUpgradeBootstrap', () => {
  it('rejects whenReady before the bootstrap has been scheduled', async () => {
    const { handle } = setup({ enabled: false });

    await expect(handle.whenReady()).rejects.toThrow(
      'MoneyAccountUpgradeController bootstrap has not been scheduled yet',
    );
  });

  it('bootstraps immediately when the flag is on and the keyring is unlocked', async () => {
    const { handle, bootstrap, hasFlagListener } = setup({
      enabled: true,
      vaultConfig: VAULT_CONFIG,
    });

    handle.start();

    expect(bootstrap).toHaveBeenCalledWith(VAULT_CONFIG);
    // Never subscribed: the initial state was already sufficient.
    expect(hasFlagListener()).toBe(false);
    expect(await handle.whenReady()).toBeUndefined();
  });

  it('waits for the flag to turn on, then unsubscribes from flag changes', async () => {
    const { handle, bootstrap, emitFlags, unsubscribeFlags } = setup({
      enabled: false,
    });

    handle.start();
    expect(bootstrap).not.toHaveBeenCalled();

    emitFlags({ enabled: false });
    expect(bootstrap).not.toHaveBeenCalled();

    emitFlags({ enabled: true, vaultConfig: VAULT_CONFIG });
    expect(bootstrap).toHaveBeenCalledWith(VAULT_CONFIG);
    expect(unsubscribeFlags).toHaveBeenCalled();
    expect(await handle.whenReady()).toBeUndefined();
  });

  it('reports a missing vault config and keeps watching for a usable state', () => {
    const { handle, bootstrap, onError, emitFlags } = setup({ enabled: true });

    handle.start();

    expect(bootstrap).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Missing Money Account vault config',
      }),
      'missing-vault-config',
    );

    emitFlags({ enabled: true, vaultConfig: VAULT_CONFIG });
    expect(bootstrap).toHaveBeenCalledWith(VAULT_CONFIG);
  });

  it('defers the bootstrap until the keyring unlocks, then unsubscribes', async () => {
    const { handle, bootstrap, emitUnlock, unsubscribeUnlock } = setup(
      { enabled: true, vaultConfig: VAULT_CONFIG },
      false,
    );

    handle.start();
    expect(bootstrap).not.toHaveBeenCalled();

    emitUnlock();
    expect(bootstrap).toHaveBeenCalledWith(VAULT_CONFIG);
    expect(unsubscribeUnlock).toHaveBeenCalled();
    expect(await handle.whenReady()).toBeUndefined();
  });

  it('schedules the bootstrap at most once across repeated flag states', () => {
    const { handle, bootstrap, emitFlags } = setup({ enabled: true }, true);

    handle.start();
    // The missing-config path leaves the flag subscription active; two
    // usable states must still bootstrap only once.
    emitFlags({ enabled: true, vaultConfig: VAULT_CONFIG });
    emitFlags({ enabled: true, vaultConfig: { chainId: '0x1' } });

    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('schedules only once even when a flag event fires before unsubscription takes effect', () => {
    // Simulates a messenger delivering a queued stateChange after tryStart
    // succeeded but before the unsubscribe landed.
    let flagListener: ((state: Flags) => void) | undefined;
    const bootstrap = jest.fn().mockResolvedValue(undefined);

    const handle = createMoneyAccountUpgradeBootstrap<
      Flags,
      { chainId: string }
    >({
      getFeatureFlagState: () => ({ enabled: false }),
      onFeatureFlagStateChange: (listener) => {
        flagListener = listener;
        return jest.fn(); // unsubscribe that never takes effect
      },
      isEnabled: (state) => state.enabled,
      getVaultConfig: (state) => state.vaultConfig,
      isKeyringUnlocked: () => true,
      onKeyringUnlock: () => jest.fn(),
      bootstrap,
      onError: jest.fn(),
    });

    handle.start();
    flagListener?.({ enabled: true, vaultConfig: VAULT_CONFIG });
    flagListener?.({ enabled: true, vaultConfig: VAULT_CONFIG });

    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('surfaces a bootstrap failure through onError and whenReady', async () => {
    const failure = new Error('init failed');
    const { handle, bootstrap, onError } = setup({
      enabled: true,
      vaultConfig: VAULT_CONFIG,
    });
    bootstrap.mockRejectedValue(failure);

    handle.start();

    await expect(handle.whenReady()).rejects.toThrow('init failed');
    expect(onError).toHaveBeenCalledWith(failure, 'bootstrap');
  });
});
