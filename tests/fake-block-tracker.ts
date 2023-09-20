import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider/dist/safe-event-emitter-provider';
import { PollingBlockTracker } from 'eth-block-tracker';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';

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
  }

  override async _start() {
    // Don't start the polling loop
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
