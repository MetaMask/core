import type { NetworkClientId } from './types';

export class NoNetworkClientFoundError extends Error {
  static create(networkClientId: NetworkClientId) {
    // ESLint is confused here; this is guaranteed to be a string.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return new this(`No network client found with ID "${networkClientId}"`);
  }
}
