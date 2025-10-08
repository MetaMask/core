import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import {
  createDeferredPromise,
  type DeferredPromise,
  getErrorMessage,
  type JsonRpcRequest,
} from '@metamask/utils';
import getCreateRandomId from 'json-rpc-random-id';

import type { BlockTracker } from './BlockTracker';
import { projectLogger, createModuleLogger } from './logging-utils';

const log = createModuleLogger(projectLogger, 'polling-block-tracker');
const createRandomId = getCreateRandomId();
const sec = 1000;

const blockTrackerEvents: (string | symbol)[] = ['sync', 'latest'];

export interface PollingBlockTrackerOptions {
  provider?: SafeEventEmitterProvider;
  pollingInterval?: number;
  retryTimeout?: number;
  keepEventLoopActive?: boolean;
  setSkipCacheFlag?: boolean;
  blockResetDuration?: number;
  usePastBlocks?: boolean;
}

interface ExtendedJsonRpcRequest extends JsonRpcRequest<[]> {
  skipCache?: boolean;
}

type InternalListener = (value: string) => void;

export class PollingBlockTracker
  extends SafeEventEmitter
  implements BlockTracker
{
  private _isRunning: boolean;

  private readonly _blockResetDuration: number;

  private readonly _usePastBlocks: boolean;

  private _currentBlock: string | null;

  private _blockResetTimeout?: ReturnType<typeof setTimeout>;

  private _pollingTimeout?: ReturnType<typeof setTimeout>;

  private readonly _provider: SafeEventEmitterProvider;

  private readonly _pollingInterval: number;

  private readonly _retryTimeout: number;

  private readonly _keepEventLoopActive: boolean;

  private readonly _setSkipCacheFlag: boolean;

  readonly #internalEventListeners: InternalListener[] = [];

  #pendingLatestBlock?: Omit<DeferredPromise<string>, 'resolve'>;

  #pendingFetch?: Omit<DeferredPromise<string>, 'resolve'>;

  constructor(opts: PollingBlockTrackerOptions = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('PollingBlockTracker - no provider specified.');
    }

    super();

    // config
    this._blockResetDuration = opts.blockResetDuration || 20 * sec;
    this._usePastBlocks = opts.usePastBlocks || false;
    // state
    this._currentBlock = null;
    this._isRunning = false;

    // bind functions for internal use
    this._onNewListener = this._onNewListener.bind(this);
    this._onRemoveListener = this._onRemoveListener.bind(this);
    this._resetCurrentBlock = this._resetCurrentBlock.bind(this);

    // listen for handler changes
    this._setupInternalEvents();

    // config
    this._provider = opts.provider;
    this._pollingInterval = opts.pollingInterval || 20 * sec;
    this._retryTimeout = opts.retryTimeout || this._pollingInterval / 10;
    this._keepEventLoopActive =
      opts.keepEventLoopActive === undefined ? true : opts.keepEventLoopActive;
    this._setSkipCacheFlag = opts.setSkipCacheFlag || false;
  }

  async destroy() {
    this._cancelBlockResetTimeout();
    super.removeAllListeners();
    this._maybeEnd();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  getCurrentBlock(): string | null {
    return this._currentBlock;
  }

  async getLatestBlock({
    useCache = true,
  }: { useCache?: boolean } = {}): Promise<string> {
    // return if available
    if (this._currentBlock && useCache) {
      return this._currentBlock;
    }

    if (this.#pendingLatestBlock) {
      return await this.#pendingLatestBlock.promise;
    }

    const { promise, resolve, reject } = createDeferredPromise<string>({
      suppressUnhandledRejection: true,
    });
    this.#pendingLatestBlock = { reject, promise };

    if (this._isRunning) {
      try {
        // If tracker is running, wait for next block with timeout
        const onLatestBlock = (value: string) => {
          this.#removeInternalListener(onLatestBlock);
          this.removeListener('latest', onLatestBlock);
          resolve(value);
        };

        this.#addInternalListener(onLatestBlock);
        this.once('latest', onLatestBlock);

        return await promise;
      } catch (error) {
        reject(error);
        throw error;
      } finally {
        this.#pendingLatestBlock = undefined;
      }
    } else {
      // If tracker isn't running, just fetch directly
      try {
        const latestBlock = await this._updateLatestBlock();
        resolve(latestBlock);
        return latestBlock;
      } catch (error) {
        reject(error);
        throw error;
      } finally {
        // We want to rate limit calls to this method if we made a direct fetch
        // for the block number because the BlockTracker was not running. We
        // achieve this by delaying the unsetting of the #pendingLatestBlock promise.
        setTimeout(() => {
          this.#pendingLatestBlock = undefined;
        }, this._pollingInterval);
      }
    }
  }

  // dont allow module consumer to remove our internal event listeners
  removeAllListeners(eventName?: string | symbol) {
    // perform default behavior, preserve fn arity
    if (eventName) {
      super.removeAllListeners(eventName);
    } else {
      super.removeAllListeners();
    }

    // re-add internal events
    this._setupInternalEvents();
    // trigger stop check just in case
    this._onRemoveListener();

    return this;
  }

  private _setupInternalEvents(): void {
    // first remove listeners for idempotence
    this.removeListener('newListener', this._onNewListener);
    this.removeListener('removeListener', this._onRemoveListener);
    // then add them
    this.on('newListener', this._onNewListener);
    this.on('removeListener', this._onRemoveListener);
  }

  private _onNewListener(eventName: string | symbol): void {
    // `newListener` is called *before* the listener is added
    if (blockTrackerEvents.includes(eventName)) {
      // TODO: Handle dangling promise
      this._maybeStart();
    }
  }

  private _onRemoveListener(): void {
    // `removeListener` is called *after* the listener is removed
    if (this._getBlockTrackerEventCount() > 0) {
      return;
    }
    this._maybeEnd();
  }

  private _maybeStart() {
    if (this._isRunning) {
      return;
    }

    this._isRunning = true;
    // cancel setting latest block to stale
    this._cancelBlockResetTimeout();
    this._start();
    this.emit('_started');
  }

  private _maybeEnd() {
    if (!this._isRunning) {
      return;
    }

    this._isRunning = false;
    this._setupBlockResetTimeout();
    this._end();
    this.#rejectPendingLatestBlock(new Error('Block tracker destroyed'));
    this.emit('_ended');
  }

  private _getBlockTrackerEventCount(): number {
    return (
      blockTrackerEvents
        .map((eventName) => this.listeners(eventName))
        .flat()
        // internal listeners are not included in the count
        .filter((listener) =>
          this.#internalEventListeners.every(
            (internalListener) => !Object.is(internalListener, listener),
          ),
        ).length
    );
  }

  private _shouldUseNewBlock(newBlock: string) {
    const currentBlock = this._currentBlock;
    if (!currentBlock) {
      return true;
    }
    const newBlockInt = hexToInt(newBlock);
    const currentBlockInt = hexToInt(currentBlock);

    return (
      (this._usePastBlocks && newBlockInt < currentBlockInt) ||
      newBlockInt > currentBlockInt
    );
  }

  private _newPotentialLatest(newBlock: string): void {
    if (!this._shouldUseNewBlock(newBlock)) {
      return;
    }
    this._setCurrentBlock(newBlock);
  }

  private _setCurrentBlock(newBlock: string): void {
    const oldBlock = this._currentBlock;
    this._currentBlock = newBlock;
    this.emit('latest', newBlock);
    this.emit('sync', { oldBlock, newBlock });
  }

  private _setupBlockResetTimeout(): void {
    // clear any existing timeout
    this._cancelBlockResetTimeout();
    // clear latest block when stale
    this._blockResetTimeout = setTimeout(
      this._resetCurrentBlock,
      this._blockResetDuration,
    );

    // nodejs - dont hold process open
    if (this._blockResetTimeout.unref) {
      this._blockResetTimeout.unref();
    }
  }

  private _cancelBlockResetTimeout(): void {
    if (this._blockResetTimeout) {
      clearTimeout(this._blockResetTimeout);
    }
  }

  private _resetCurrentBlock(): void {
    this._currentBlock = null;
  }

  /**
   * Checks for the latest block, updates the internal state,  and returns the
   * value immediately rather than waiting for the next polling interval.
   *
   * @deprecated Use {@link getLatestBlock} instead.
   * @returns A promise that resolves to the latest block number.
   */
  async checkForLatestBlock() {
    await this._updateLatestBlock();
    return await this.getLatestBlock();
  }

  private _start() {
    // Intentionally not awaited as this starts the polling via a timeout chain.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this._updateAndQueue();
  }

  private _end() {
    this._clearPollingTimeout();
  }

  private async _updateLatestBlock(): Promise<string> {
    // fetch + set latest block
    const latestBlock = await this._fetchLatestBlock();
    this._newPotentialLatest(latestBlock);
    // _newPotentialLatest() ensures that this._currentBlock is not null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this._currentBlock!;
  }

  private async _fetchLatestBlock(): Promise<string> {
    // If there's already a pending fetch, reuse it
    if (this.#pendingFetch) {
      return await this.#pendingFetch.promise;
    }

    // Create a new deferred promise for this request
    const { promise, resolve, reject } = createDeferredPromise<string>({
      suppressUnhandledRejection: true,
    });
    this.#pendingFetch = { reject, promise };

    try {
      const req: ExtendedJsonRpcRequest = {
        jsonrpc: '2.0',
        id: createRandomId(),
        method: 'eth_blockNumber',
        params: [] as [],
      };
      if (this._setSkipCacheFlag) {
        req.skipCache = true;
      }

      log('Making request', req);
      const result = await this._provider.request<[], string>(req);
      log('Got result', result);
      resolve(result);
      return result;
    } catch (error) {
      log('Encountered error fetching block', getErrorMessage(error));
      reject(error);
      this.#rejectPendingLatestBlock(error);
      throw error;
    } finally {
      this.#pendingFetch = undefined;
    }
  }

  /**
   * The core polling function that runs after each interval.
   * Updates the latest block and then queues the next update.
   */
  private async _updateAndQueue() {
    let interval = this._pollingInterval;

    try {
      await this._updateLatestBlock();
    } catch (error: unknown) {
      try {
        this.emit('error', error);
      } catch {
        console.error(`Error updating latest block: ${getErrorMessage(error)}`);
      }

      interval = this._retryTimeout;
    }

    if (!this._isRunning) {
      return;
    }

    this._clearPollingTimeout();

    const timeoutRef = setTimeout(() => {
      // Intentionally not awaited as this just continues the polling loop.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._updateAndQueue();
    }, interval);

    if (timeoutRef.unref && !this._keepEventLoopActive) {
      timeoutRef.unref();
    }

    this._pollingTimeout = timeoutRef;

    this.emit('_waitingForNextIteration');
  }

  _clearPollingTimeout() {
    if (this._pollingTimeout) {
      clearTimeout(this._pollingTimeout);
      this._pollingTimeout = undefined;
    }
  }

  #addInternalListener(listener: InternalListener) {
    this.#internalEventListeners.push(listener);
  }

  #removeInternalListener(listener: InternalListener) {
    this.#internalEventListeners.splice(
      this.#internalEventListeners.indexOf(listener),
      1,
    );
  }

  #rejectPendingLatestBlock(error: unknown) {
    this.#pendingLatestBlock?.reject(error);
    this.#pendingLatestBlock = undefined;
  }
}

/**
 * Converts a number represented as a string in hexadecimal format into a native
 * number.
 *
 * @param hexInt - The hex string.
 * @returns The number.
 */
function hexToInt(hexInt: string): number {
  return Number.parseInt(hexInt, 16);
}
