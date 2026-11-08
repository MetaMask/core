import type {
  AccountId,
  AssetsFetchPhase,
  AssetsFetchPhaseStatus,
  AssetsFetchStatus,
  ChainId,
} from './types.js';

/**
 * Applies a recipe to the controller state. Matches the shape of the
 * controller's protected `update` method.
 */
export type AssetsFetchUpdate = (
  recipe: (state: {
    assetsFetchStatus?: Record<AccountId, AssetsFetchStatus>;
  }) => void,
) => void;

/**
 * Tracks in flight fetches per account and phase, and writes the resulting
 * fetch status through the injected `update` callback.
 */
export class AssetsFetchTracker {
  readonly #update: AssetsFetchUpdate;

  readonly #now: () => number;

  readonly #counts = new Map<string, number>();

  /**
   * @param update - Callback used to write state.
   * @param now - Clock used for `updatedAt`.
   */
  constructor(update: AssetsFetchUpdate, now: () => number = Date.now) {
    this.#update = update;
    this.#now = now;
  }

  /**
   * Mark a fetch as started for the given accounts and phase.
   *
   * @param accountIds - The accounts being fetched.
   * @param phase - The fetch phase.
   * @returns An idempotent `end` function to call when the fetch finishes.
   */
  begin(
    accountIds: AccountId[],
    phase: AssetsFetchPhase,
  ): (result?: { errors?: Record<ChainId, string> }) => void {
    if (accountIds.length === 0) {
      return (): void => undefined;
    }

    const ids = [...accountIds];
    const started = ids.filter(
      (accountId) => !this.#counts.has(`${accountId}:${phase}`),
    );

    // Write before counting so a failed write leaves no stale count behind.
    if (started.length > 0) {
      this.#write(started, phase, (status) => {
        status.fetchStatus = 'fetching';
        status.errors = {};
      });
    }

    for (const accountId of ids) {
      const key = `${accountId}:${phase}`;
      this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
    }

    let ended = false;
    return (result): void => {
      if (ended) {
        return;
      }
      ended = true;

      const errors = result?.errors ?? {};
      const finished: AccountId[] = [];
      for (const accountId of ids) {
        const key = `${accountId}:${phase}`;
        const count = (this.#counts.get(key) ?? 1) - 1;
        if (count <= 0) {
          this.#counts.delete(key);
          finished.push(accountId);
        } else {
          this.#counts.set(key, count);
        }
      }

      if (finished.length > 0) {
        const hasErrors = Object.keys(errors).length > 0;
        this.#write(finished, phase, (status) => {
          status.fetchStatus = 'idle';
          status.errors = { ...errors };
          if (!hasErrors) {
            status.updatedAt = this.#now();
          }
        });
      }
    };
  }

  #write(
    accountIds: AccountId[],
    phase: AssetsFetchPhase,
    mutate: (status: AssetsFetchPhaseStatus) => void,
  ): void {
    this.#update((state) => {
      state.assetsFetchStatus ??= {};
      for (const accountId of accountIds) {
        state.assetsFetchStatus[accountId] ??= {
          fast: { fetchStatus: 'idle', errors: {}, updatedAt: null },
          background: { fetchStatus: 'idle', errors: {}, updatedAt: null },
        };
        mutate(state.assetsFetchStatus[accountId][phase]);
      }
    });
  }
}
