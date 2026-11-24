/**
 * Error thrown when trying to create a watch-only account while the
 * watch-only support is disabled.
 */
export class WatchOnlyAccountDisabledError extends Error {
  constructor() {
    super('Watch-only account support is disabled');
    this.name = 'WatchOnlyAccountDisabledError';
  }
}
