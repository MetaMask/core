import { createDeferredPromise, DeferredPromise } from '@metamask/utils';
import { once } from 'lodash';

import { projectLogger as log } from './logger';
import type { SnapAccountServiceMessenger } from './SnapAccountService';

export type SnapPlatformWatcherOptions = {
  /**
   * Resolves when onboarding is complete.
   */
  ensureOnboardingComplete?: () => Promise<void>;
};

export class SnapPlatformWatcher {
  readonly #messenger: SnapAccountServiceMessenger;

  readonly #ensureOnboardingComplete?: () => Promise<void>;

  readonly #isReadyOnce: DeferredPromise<void>;

  #isReady: boolean;

  constructor(
    messenger: SnapAccountServiceMessenger,
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
    await this.#ensureOnboardingComplete?.();
    await this.#isReadyOnce.promise;

    if (!this.#isReady) {
      throw new Error('Snap platform cannot be used now.');
    }
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
