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
      this.#callback().catch((_error) => {
        // Do nothing with the error for now
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
