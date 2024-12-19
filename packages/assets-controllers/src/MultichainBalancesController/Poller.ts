import { PollerError } from './error';

export class Poller {
  #interval: number;

  #callback: () => Promise<void>;

  #handle: NodeJS.Timeout | undefined = undefined;

  constructor(callback: () => Promise<void>, interval: number) {
    this.#interval = interval;
    this.#callback = callback;
  }

  start() {
    if (this.#handle) {
      return;
    }

    this.#handle = setInterval(() => {
      this.#callback().catch((err) => {
        console.error(new PollerError(err.message));
      });
    }, this.#interval);
  }

  stop() {
    if (!this.#handle) {
      return;
    }
    clearInterval(this.#handle);
    this.#handle = undefined;
  }
}
