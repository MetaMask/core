import { createDeferredPromise, DeferredPromise } from '@metamask/utils';

import { MultichainAccountServiceMessenger } from '../types';

export class SnapPlatformWatcher {
  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #isReadyOnce: DeferredPromise<void>;

  #isReady: boolean;

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.#messenger = messenger;

    this.#isReady = false;
    this.#isReadyOnce = createDeferredPromise<void>();

    this.#watch();
  }

  get isReady(): boolean {
    return this.#isReady;
  }

  async ensureCanUsePlatform(): Promise<void> {
    // We always wait for the Snap platform to be ready at least once.
    await this.#isReadyOnce.promise;

    // Then, we check for the current state and see if we can use it.
    if (!this.#isReady) {
      throw new Error('Snap platform cannot be used now.');
    }
  }

  #watch(): void {
    const state = this.#messenger.call('SnapController:getState');

    // If already ready, resolve immediately.
    if (state.isReady) {
      this.#isReady = true;
      this.#isReadyOnce.resolve();
    }

    // We still subscribe to state changes to keep track of the platform's readiness.
    this.#messenger.subscribe('SnapController:stateChange', ({ isReady }) => {
      this.#isReady = isReady;

      if (isReady) {
        this.#isReadyOnce.resolve();
      }
    });
  }
}
