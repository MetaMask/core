import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';

/**
 * Acts like a PollingBlockTracker, but doesn't start the polling loop or
 * make any requests.
 */
export class FakeBlockTracker extends PollingBlockTracker {
  #latestBlockNumber = '0x0';

  constructor({ provider }: { provider: SafeEventEmitterProvider }) {
    super({
      provider,
    });
    // Don't start the polling loop
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-explicit-any
    (this as any).start = () => {};
  }

  /**
   * Sets the number of the block that the block tracker will always return.
   *
   * @param latestBlockNumber - The block number to use.
   */
  mockLatestBlockNumber(latestBlockNumber: string) {
    this.#latestBlockNumber = latestBlockNumber;
  }

  override async getLatestBlock() {
    return this.#latestBlockNumber;
  }
}
