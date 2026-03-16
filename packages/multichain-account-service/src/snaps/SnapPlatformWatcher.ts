import { KeyringTypes } from '@metamask/keyring-controller';
import { createDeferredPromise, DeferredPromise } from '@metamask/utils';
import { once } from 'lodash';

import { projectLogger as log, WARNING_PREFIX } from '../logger';
import { MultichainAccountServiceMessenger } from '../types';

/** Minimal KeyringController state shape needed to detect Snap keyring. */
type KeyringControllerStateSlice = {
  keyrings: { type: string }[];
};

/** How long to wait for the Snap keyring to appear before giving up (ms). */
const SNAP_KEYRING_WAIT_TIMEOUT_MS = 5_000;

/**
 * Returns true if the given KeyringController state slice contains a Snap keyring.
 *
 * @param state - KeyringController state.
 * @returns True if state.keyrings contains a keyring with type KeyringTypes.snap.
 */
function stateHasSnapKeyring(state: KeyringControllerStateSlice): boolean {
  return Boolean(
    Array.isArray(state?.keyrings) &&
      state.keyrings.some((k) => k.type === (KeyringTypes.snap as string)),
  );
}

export type SnapPlatformWatcherOptions = {
  /**
   * Resolves when onboarding is complete.
   */
  ensureOnboardingComplete?: () => Promise<void>;
};

export class SnapPlatformWatcher {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #ensureOnboardingComplete?: () => Promise<void>;

  readonly #isReadyOnce: DeferredPromise<void>;

  #isReady: boolean;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    options: SnapPlatformWatcherOptions = {},
  ) {
    this.#messenger = messenger;
    this.#ensureOnboardingComplete = options.ensureOnboardingComplete;

    this.#isReady = false;
    this.#isReadyOnce = createDeferredPromise<void>();

    this.#watch();
  }

  get isReady(): boolean {
    return this.#isReady;
  }

  async ensureCanUseSnapPlatform(): Promise<void> {
    // When ensureOnboardingComplete is provided, wait for the onboarding first.
    await this.#ensureOnboardingComplete?.();

    // In all cases, we also require the Snap platform to be ready and available.
    await this.#isReadyOnce.promise;

    if (!this.#isReady) {
      throw new Error('Snap platform cannot be used now.');
    }

    // After a restore/reset, the Snap keyring is created lazily by the client (e.g. when
    // getSnapKeyring() is called). Non-EVM account creation needs the keyring to exist, so we
    // wait for it here with a timeout to avoid "Keyring not found" errors.
    await this.#waitForSnapKeyring();
  }

  /**
   * Waits for KeyringController to have a Snap keyring available.
   * Checks once, then subscribes to KeyringController:stateChange until the keyring
   * appears or the timeout is reached.
   */
  async #waitForSnapKeyring(): Promise<void> {
    if (this.#hasSnapKeyring()) {
      return;
    }
    await this.#waitForSnapKeyringViaStateChange();
  }

  /**
   * Returns true if KeyringController already has a Snap keyring.
   * Logs and returns false on error.
   *
   * @returns True if a Snap keyring exists, false otherwise or on error.
   */
  #hasSnapKeyring(): boolean {
    try {
      const state = this.#messenger.call(
        'KeyringController:getState',
      ) as KeyringControllerStateSlice;
      return stateHasSnapKeyring(state);
    } catch (error) {
      log(
        `${WARNING_PREFIX} KeyringController error while waiting for Snap keyring:`,
        error,
      );
      return false;
    }
  }

  /**
   * Subscribes to KeyringController:stateChange and resolves when a Snap keyring
   * appears in state, or after the timeout.
   */
  async #waitForSnapKeyringViaStateChange(): Promise<void> {
    await new Promise<void>((resolve) => {
      const listener = (state: KeyringControllerStateSlice): void => {
        if (stateHasSnapKeyring(state)) {
          this.#messenger.unsubscribe(
            'KeyringController:stateChange',
            listener,
          );
          resolve();
        }
      };

      setTimeout(() => {
        this.#messenger.unsubscribe('KeyringController:stateChange', listener);
        resolve();
      }, SNAP_KEYRING_WAIT_TIMEOUT_MS);

      this.#messenger.subscribe('KeyringController:stateChange', listener);
    });
  }

  #watch(): void {
    const logReadyOnce = once(() => log('Snap platform is ready!'));

    const initialState = this.#messenger.call('SnapController:getState');
    if (initialState.isReady) {
      this.#isReady = true;
      this.#isReadyOnce.resolve();
    }

    this.#messenger.subscribe(
      'SnapController:stateChange',
      (isReady: boolean) => {
        this.#isReady = isReady;

        if (isReady) {
          logReadyOnce();
          this.#isReadyOnce.resolve();
        }
      },
      (state) => state.isReady,
    );
  }
}
