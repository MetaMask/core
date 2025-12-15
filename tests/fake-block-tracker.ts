import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import type {
  ContextConstraint,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';

/**
 * Acts like a PollingBlockTracker, but doesn't start the polling loop or
 * make any requests.
 */
export class FakeBlockTracker<
  Context extends ContextConstraint = MiddlewareContext,
> extends PollingBlockTracker<Context> {
  #latestBlockNumber = '0x0';

  constructor({ provider }: { provider: InternalProvider<Context> }) {
    super({
      provider,
    });
    // Don't start the polling loop
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).start = (): void => {
      // Intentionally empty.
    };
  }

  /**
   * Sets the number of the block that the block tracker will always return.
   *
   * @param latestBlockNumber - The block number to use.
   */
  mockLatestBlockNumber(latestBlockNumber: string): void {
    this.#latestBlockNumber = latestBlockNumber;
  }

  override async getLatestBlock(): Promise<string> {
    return this.#latestBlockNumber;
  }

  override async checkForLatestBlock(): Promise<string> {
    return this.#latestBlockNumber;
  }
}
