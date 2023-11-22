import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { PollingBlockTracker } from 'eth-block-tracker';

/**
 * Acts like a PollingBlockTracker, but doesn't start the polling loop or
 * make any requests.
 */
export class FakeBlockTracker extends PollingBlockTracker {
  #latestBlockNumber = '0x0';

  constructor() {
    super({
      provider: new SafeEventEmitterProvider({ engine: new JsonRpcEngine() }),
    });
    // Don't start the polling loop
    // eslint-disable-next-line @typescript-eslint/no-empty-function
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
