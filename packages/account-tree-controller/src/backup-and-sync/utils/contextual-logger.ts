const LOG_PREFIX = '[AccountTreeController - Backup and sync] ';

export class ContextualLogger {
  readonly #isEnabled: boolean;

  constructor(options?: { isEnabled?: boolean }) {
    this.#isEnabled = options?.isEnabled ?? false;
  }

  log(...args: Parameters<typeof console.log>) {
    if (this.#isEnabled) {
      console.log(LOG_PREFIX, ...args);
    }
  }

  warn(...args: Parameters<typeof console.warn>) {
    if (this.#isEnabled) {
      console.warn(LOG_PREFIX, ...args);
    }
  }

  info(...args: Parameters<typeof console.info>) {
    if (this.#isEnabled) {
      console.info(LOG_PREFIX, ...args);
    }
  }

  error(...args: Parameters<typeof console.error>) {
    if (this.#isEnabled) {
      console.error(LOG_PREFIX, ...args);
    }
  }

  debug(...args: Parameters<typeof console.debug>) {
    if (this.#isEnabled) {
      console.debug(LOG_PREFIX, ...args);
    }
  }
}
