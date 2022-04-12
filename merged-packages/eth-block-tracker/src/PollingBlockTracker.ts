import getCreateRandomId from 'json-rpc-random-id';
import pify from 'pify';
import { JsonRpcRequest } from 'json-rpc-engine';
import { BaseBlockTracker, Provider } from './BaseBlockTracker';

const createRandomId = getCreateRandomId();
const sec = 1000;

interface PollingBlockTrackerArgs {
  provider: Provider;
  pollingInterval: number;
  retryTimeout: number;
  keepEventLoopActive: boolean;
  setSkipCacheFlag: boolean;
}

interface ExtendedJsonRpcRequest<T> extends JsonRpcRequest<T> {
  skipCache?: boolean;
}

export class PollingBlockTracker extends BaseBlockTracker {
  private _provider: Provider;

  private _pollingInterval: number;

  private _retryTimeout: number;

  private _keepEventLoopActive: boolean;

  private _setSkipCacheFlag: boolean;

  constructor(opts: Partial<PollingBlockTrackerArgs> = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('PollingBlockTracker - no provider specified.');
    }

    super({
      blockResetDuration: opts.pollingInterval,
    });

    // config
    this._provider = opts.provider;
    this._pollingInterval = opts.pollingInterval || 20 * sec;
    this._retryTimeout = opts.retryTimeout || this._pollingInterval / 10;
    this._keepEventLoopActive =
      opts.keepEventLoopActive === undefined ? true : opts.keepEventLoopActive;
    this._setSkipCacheFlag = opts.setSkipCacheFlag || false;
  }

  // trigger block polling
  async checkForLatestBlock() {
    await this._updateLatestBlock();
    return await this.getLatestBlock();
  }

  protected _start(): void {
    this._synchronize().catch((err) => this.emit('error', err));
  }

  private async _synchronize(): Promise<void> {
    while (this._isRunning) {
      try {
        await this._updateLatestBlock();
        await timeout(this._pollingInterval, !this._keepEventLoopActive);
      } catch (err: any) {
        const newErr = new Error(
          `PollingBlockTracker - encountered an error while attempting to update latest block:\n${
            err.stack ?? err
          }`,
        );
        try {
          this.emit('error', newErr);
        } catch (emitErr) {
          console.error(newErr);
        }
        await timeout(this._retryTimeout, !this._keepEventLoopActive);
      }
    }
  }

  private async _updateLatestBlock(): Promise<void> {
    // fetch + set latest block
    const latestBlock = await this._fetchLatestBlock();
    this._newPotentialLatest(latestBlock);
  }

  private async _fetchLatestBlock(): Promise<string> {
    const req: ExtendedJsonRpcRequest<[]> = {
      jsonrpc: '2.0',
      id: createRandomId(),
      method: 'eth_blockNumber',
      params: [],
    };
    if (this._setSkipCacheFlag) {
      req.skipCache = true;
    }

    const res = await pify((cb) => this._provider.sendAsync(req, cb))();
    if (res.error) {
      throw new Error(
        `PollingBlockTracker - encountered error fetching block:\n${res.error}`,
      );
    }
    return res.result;
  }
}

/**
 * Waits for the specified amount of time.
 *
 * @param duration - The amount of time in milliseconds.
 * @param unref - Assuming this function is run in a Node context, governs
 * whether Node should wait before the `setTimeout` has completed before ending
 * the process (true for no, false for yes). Defaults to false.
 * @returns A promise that can be used to wait.
 */
function timeout(duration: number, unref: boolean) {
  return new Promise((resolve) => {
    const timeoutRef = setTimeout(resolve, duration);
    // don't keep process open
    if (timeoutRef.unref && unref) {
      timeoutRef.unref();
    }
  });
}
