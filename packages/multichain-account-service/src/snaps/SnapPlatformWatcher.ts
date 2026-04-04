import { KeyringTypes } from '@metamask/keyring-controller';
import { createDeferredPromise, DeferredPromise } from '@metamask/utils';
import { once } from 'lodash';

import { projectLogger as log, WARNING_PREFIX } from '../logger';
import { MultichainAccountServiceMessenger } from '../types';

/** Minimal KeyringController state shape needed to detect Snap keyring. */
type KeyringControllerStateSlice = {
  keyrings: { type: string }[];
};

/** Default wait for Snap keyring to appear before rejecting (ms). */
export const DEFAULT_SNAP_KEYRING_WAIT_TIMEOUT_MS = 5_000;

/** Error message when Snap keyring does not appear within the timeout. */
const SNAP_KEYRING_TIMEOUT_MESSAGE =
  'Snap platform or keyrings still not ready. Aborting.';

/**
 * Returns true if the given KeyringController state slice contains a Snap keyring.
 *
 * @param state - KeyringController state.
 * @returns True if state.keyrings contains a keyring with type KeyringTypes.snap.
 */
function stateHasSnapKeyring(state: KeyringControllerStateSlice): boolean {
  return state.keyrings.some((k) => k.type === KeyringTypes.snap);
}

export type SnapPlatformWatcherOptions = {
  /**
   * Resolves when onboarding is complete.
   */
  ensureOnboardingComplete?: () => Promise<void>;
  /**
   * How long to wait for the Snap keyring to appear before rejecting (ms).
   *
   * @default DEFAULT_SNAP_KEYRING_WAIT_TIMEOUT_MS
   */
  snapKeyringWaitTimeoutMs?: number;
};

export class SnapPlatformWatcher {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #ensureOnboardingComplete?: () => Promise<void>;

  readonly #snapKeyringWaitTimeoutMs: number;

  readonly #isReadyOnce: DeferredPromise<void>;

  #isReady: boolean;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    options: SnapPlatformWatcherOptions = {},
  ) {
    this.#messenger = messenger;
    this.#ensureOnboardingComplete = options.ensureOnboardingComplete;
    this.#snapKeyringWaitTimeoutMs =
      options.snapKeyringWaitTimeoutMs ?? DEFAULT_SNAP_KEYRING_WAIT_TIMEOUT_MS;

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
   * appears or the timeout is reached (then throws).
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
   * appears in state, or rejects with an error after the timeout.
   */
  async #waitForSnapKeyringViaStateChange(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeoutRef: { id: ReturnType<typeof setTimeout> | undefined } = {
        id: undefined,
      };

      const listener = (
        keyrings: KeyringControllerStateSlice['keyrings'],
      ): void => {
        if (stateHasSnapKeyring({ keyrings })) {
          clearTimeout(timeoutRef.id);
          this.#messenger.unsubscribe(
            'KeyringController:stateChange',
            listener,
          );
          resolve();
        }
      };

      timeoutRef.id = setTimeout(() => {
        this.#messenger.unsubscribe('KeyringController:stateChange', listener);
        reject(new Error(SNAP_KEYRING_TIMEOUT_MESSAGE));
      }, this.#snapKeyringWaitTimeoutMs);

      this.#messenger.subscribe(
        'KeyringController:stateChange',
        listener,
        (state) => state.keyrings,
      );
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
