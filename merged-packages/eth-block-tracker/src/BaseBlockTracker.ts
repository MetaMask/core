import SafeEventEmitter from '@metamask/safe-event-emitter';
import { JsonRpcRequest, JsonRpcResponse } from 'json-rpc-engine';

const sec = 1000;

const calculateSum = (accumulator: number, currentValue: number) => accumulator + currentValue;
const blockTrackerEvents: (string | symbol)[] = ['sync', 'latest'];

export interface Provider extends SafeEventEmitter {
  sendAsync: <T, U>(req: JsonRpcRequest<T>, cb: (err: Error, response: JsonRpcResponse<U>) => void) => void;
}

interface BaseBlockTrackerArgs {
  blockResetDuration?: number;
}

export class BaseBlockTracker extends SafeEventEmitter {

  protected _isRunning: boolean;

  private _blockResetDuration: number;

  private _currentBlock: string | null;

  private _blockResetTimeout?: ReturnType<typeof setTimeout>;

  constructor(opts: BaseBlockTrackerArgs = {}) {
    super();

    // config
    this._blockResetDuration = opts.blockResetDuration || 20 * sec;
    // state
    this._currentBlock = null;
    this._isRunning = false;

    // bind functions for internal use
    this._onNewListener = this._onNewListener.bind(this);
    this._onRemoveListener = this._onRemoveListener.bind(this);
    this._resetCurrentBlock = this._resetCurrentBlock.bind(this);

    // listen for handler changes
    this._setupInternalEvents();
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
    const latestBlock: string = await new Promise((resolve) => this.once('latest', resolve));
    // return newly set current block
    return latestBlock;
  }

  // dont allow module consumer to remove our internal event listeners
  removeAllListeners(eventName: string | symbol) {
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

  /**
   * To be implemented in subclass.
   */
  protected _start(): void {
    // default behavior is noop
  }

  /**
   * To be implemented in subclass.
   */
  protected _end(): void {
    // default behavior is noop
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

  private _maybeStart(): void {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;
    // cancel setting latest block to stale
    this._cancelBlockResetTimeout();
    this._start();
  }

  private _maybeEnd(): void {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;
    this._setupBlockResetTimeout();
    this._end();
  }

  private _getBlockTrackerEventCount(): number {
    return blockTrackerEvents
      .map((eventName) => this.listenerCount(eventName))
      .reduce(calculateSum);
  }

  protected _newPotentialLatest(newBlock: string): void {
    const currentBlock = this._currentBlock;
    // only update if blok number is higher
    if (currentBlock && (hexToInt(newBlock) <= hexToInt(currentBlock))) {
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
    this._blockResetTimeout = setTimeout(this._resetCurrentBlock, this._blockResetDuration);

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

}

function hexToInt(hexInt: string): number {
  return Number.parseInt(hexInt, 16);
}
