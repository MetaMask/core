import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { getErrorMessage, type JsonRpcRequest } from '@metamask/utils';
import getCreateRandomId from 'json-rpc-random-id';

import type { BlockTracker } from './BlockTracker';
import { projectLogger, createModuleLogger } from './logging-utils';

const log = createModuleLogger(projectLogger, 'polling-block-tracker');
const createRandomId = getCreateRandomId();
const sec = 1000;

const calculateSum = (accumulator: number, currentValue: number) =>
  accumulator + currentValue;
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
    this._maybeEnd();
    super.removeAllListeners();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  getCurrentBlock(): string | null {
    return this._currentBlock;
  }

  async getLatestBlock(): Promise<string> {
    // return if available
    if (this._currentBlock) {
      return this._currentBlock;
    }
    // wait for a new latest block
    const latestBlock: string = await new Promise((resolve) =>
      this.once('latest', resolve),
    );
    // return newly set current block
    return latestBlock;
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
    this.emit('_ended');
  }

  private _getBlockTrackerEventCount(): number {
    return blockTrackerEvents
      .map((eventName) => this.listenerCount(eventName))
      .reduce(calculateSum);
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

  // trigger block polling
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

  private async _updateLatestBlock(): Promise<void> {
    // fetch + set latest block
    const latestBlock = await this._fetchLatestBlock();
    this._newPotentialLatest(latestBlock);
  }

  private async _fetchLatestBlock(): Promise<string> {
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
    try {
      const result = await this._provider.request<[], string>(req);
      log('Got result', result);
      return result;
    } catch (error) {
      log('Encountered error fetching block', getErrorMessage(error));
      throw error;
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
