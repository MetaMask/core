import { MARKET_STATE_CONFIRM_MS } from '../constants/perpsConfig.js';

/**
 * Tells from a venue's price frames whether its markets changed: one was
 * listed or removed, or one was retired or quoted again and stayed so. A
 * retired market and one whose book is only empty look the same in a frame, so
 * a switch counts once it has lasted `MARKET_STATE_CONFIRM_MS`. Nothing runs on
 * a timer: the frames carry the time forward.
 */
export class MarketChangeDetector {
  /** Markets by ID, and whether each is known as retired. */
  readonly #markets: Map<string, boolean>;

  /** When each market that differs from its known state was first seen so. */
  readonly #differsSince = new Map<string, number>();

  /**
   * Create a detector.
   *
   * @param markets - Markets known so far, as `[id, isRetired]`.
   */
  constructor(markets: Iterable<[string, boolean]>) {
    this.#markets = new Map(markets);
  }

  /**
   * Take in a frame.
   *
   * @param frame - The frame's markets, as `[id, isRetired]`.
   * @param isComplete - The frame holds every market, so absence is a removal.
   * @returns Whether the markets changed.
   */
  update(frame: [string, boolean][], isComplete: boolean): boolean {
    const now = Date.now();
    let changed = false;
    for (const [id, isRetired] of frame) {
      const known = this.#markets.get(id);
      if (known === undefined) {
        this.#markets.set(id, isRetired);
        changed = true;
      } else if (known === isRetired) {
        this.#differsSince.delete(id);
      } else if (!this.#differsSince.has(id)) {
        this.#differsSince.set(id, now);
      }
    }
    if (isComplete && frame.length < this.#markets.size) {
      const ids = new Set(frame.map(([id]) => id));
      for (const id of [...this.#markets.keys()]) {
        if (!ids.has(id)) {
          this.#markets.delete(id);
          this.#differsSince.delete(id);
          changed = true;
        }
      }
    }
    for (const [id, since] of [...this.#differsSince]) {
      if (now - since >= MARKET_STATE_CONFIRM_MS) {
        this.#markets.set(id, !this.#markets.get(id));
        this.#differsSince.delete(id);
        changed = true;
      }
    }
    return changed;
  }
}
