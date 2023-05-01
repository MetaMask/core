import { PollingBlockTracker } from 'eth-block-tracker';
import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider/dist/safe-event-emitter-provider';
import { JsonRpcEngine } from 'json-rpc-engine';

/**
 * Acts like a PollingBlockTracker, but doesn't start the polling loop or
 * make any requests.
 */
export class FakeBlockTracker extends PollingBlockTracker {
  constructor() {
    super({
      provider: new SafeEventEmitterProvider({ engine: new JsonRpcEngine() }),
    });
  }

  async _start() {
    // do nothing
  }
}
