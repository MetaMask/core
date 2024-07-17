import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type { Json, JsonRpcNotification } from '@metamask/utils';
import getCreateRandomId from 'json-rpc-random-id';

import type { BlockTracker } from './BlockTracker';

const createRandomId = getCreateRandomId();

const sec = 1000;

const calculateSum = (accumulator: number, currentValue: number) =>
  accumulator + currentValue;
const blockTrackerEvents: (string | symbol)[] = ['sync', 'latest'];

export interface SubscribeBlockTrackerOptions {
  provider?: SafeEventEmitterProvider;
  blockResetDuration?: number;
  usePastBlocks?: boolean;
}

interface SubscriptionNotificationParams {
  [key: string]: Json;
  subscription: string;
  result: { number: string };
}

export class SubscribeBlockTracker
  extends SafeEventEmitter
  implements BlockTracker
{
  private _isRunning: boolean;

  private readonly _blockResetDuration: number;

  private readonly _usePastBlocks: boolean;

  private _currentBlock: string | null;

  private _blockResetTimeout?: ReturnType<typeof setTimeout>;

  private readonly _provider: SafeEventEmitterProvider;

  private _subscriptionId: string | null;

  constructor(opts: SubscribeBlockTrackerOptions = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('SubscribeBlockTracker - no provider specified.');
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
    this._subscriptionId = null;
  }

  async destroy() {
    this._cancelBlockResetTimeout();
    await this._maybeEnd();
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

  private async _maybeStart(): Promise<void> {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;
    // cancel setting latest block to stale
    this._cancelBlockResetTimeout();
    await this._start();
    this.emit('_started');
  }

  private async _maybeEnd(): Promise<void> {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;
    this._setupBlockResetTimeout();
    await this._end();
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

  async checkForLatestBlock(): Promise<string> {
    return await this.getLatestBlock();
  }

  private async _start(): Promise<void> {
    if (this._subscriptionId === undefined || this._subscriptionId === null) {
      try {
        const blockNumber = (await this._call('eth_blockNumber')) as string;
        this._subscriptionId = (await this._call(
          'eth_subscribe',
          'newHeads',
        )) as string;
        this._provider.on('data', this._handleSubData.bind(this));
        this._newPotentialLatest(blockNumber);
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  private async _end() {
    if (this._subscriptionId !== null && this._subscriptionId !== undefined) {
      try {
        await this._call('eth_unsubscribe', this._subscriptionId);
        this._subscriptionId = null;
      } catch (e) {
        this.emit('error', e);
      }
    }
  }

  private async _call(method: string, ...params: Json[]): Promise<unknown> {
    return this._provider.request({
      id: createRandomId(),
      method,
      params,
      jsonrpc: '2.0',
    });
  }

  private _handleSubData(
    _: unknown,
    response: JsonRpcNotification<SubscriptionNotificationParams>,
  ): void {
    if (
      response.method === 'eth_subscription' &&
      response.params?.subscription === this._subscriptionId
    ) {
      this._newPotentialLatest(response.params.result.number);
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
