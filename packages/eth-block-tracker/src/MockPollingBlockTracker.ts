import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import type {
  ContextConstraint,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';

import { PollingBlockTracker } from './PollingBlockTracker.js';

/**
 * Acts like a PollingBlockTracker, but doesn't start the polling loop or
 * make any requests.
 */
export class MockPollingBlockTracker<
  Context extends ContextConstraint = MiddlewareContext,
> extends PollingBlockTracker<Context> {
  latestBlockNumber: Hex;

  constructor({
    provider,
    latestBlockNumber = '0x0',
  }: {
    provider: InternalProvider<Context>;
    latestBlockNumber?: Hex;
  }) {
    super({ provider });

    this.latestBlockNumber = latestBlockNumber;

    // Don't start the polling loop
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).start = (): void => {
      // Intentionally empty.
    };
  }

  override async getLatestBlock(): Promise<string> {
    return this.latestBlockNumber;
  }

  override async checkForLatestBlock(): Promise<string> {
    return this.latestBlockNumber;
  }
}
