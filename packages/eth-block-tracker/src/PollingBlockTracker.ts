import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import type {
  ContextConstraint,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { createDeferredPromise, getErrorMessage } from '@metamask/utils';
import type { DeferredPromise, JsonRpcRequest } from '@metamask/utils';
import getCreateRandomId from 'json-rpc-random-id';

import type { BlockTracker } from './BlockTracker';
import { projectLogger, createModuleLogger } from './logging-utils';

const log = createModuleLogger(projectLogger, 'polling-block-tracker');
const createRandomId = getCreateRandomId();
const sec = 1000;

const blockTrackerEvents: (string | symbol)[] = ['sync', 'latest'];

export type PollingBlockTrackerOptions<
  Context extends ContextConstraint = MiddlewareContext,
> = {
  provider?: InternalProvider<Context>;
  pollingInterval?: number;
  retryTimeout?: number;
  keepEventLoopActive?: boolean;
  setSkipCacheFlag?: boolean;
  blockResetDuration?: number;
  usePastBlocks?: boolean;
};

type ExtendedJsonRpcRequest = {
  skipCache?: boolean;
} & JsonRpcRequest<[]>;

type InternalListener = (value: string) => void;

export class PollingBlockTracker<
    Context extends ContextConstraint = MiddlewareContext,
  >
  extends SafeEventEmitter
  implements BlockTracker
{
  #isRunning: boolean;

  readonly #blockResetDuration: number;

  readonly #usePastBlocks: boolean;

  #currentBlock: string | null;

  #blockResetTimeout?: ReturnType<typeof setTimeout>;

  #pollingTimeout?: ReturnType<typeof setTimeout>;

  readonly #provider: InternalProvider<Context>;

  readonly #pollingInterval: number;

  readonly #retryTimeout: number;

  readonly #keepEventLoopActive: boolean;

  readonly #setSkipCacheFlag: boolean;

  readonly #internalEventListeners: InternalListener[] = [];

  #pendingLatestBlock?: Omit<DeferredPromise<string>, 'resolve'>;

  #pendingFetch?: Omit<DeferredPromise<string>, 'resolve'>;

  readonly #onNewListener: (eventName: string | symbol) => void;

  readonly #onRemoveListener: () => void;

  readonly #resetCurrentBlock: () => void;

  constructor(opts: PollingBlockTrackerOptions<Context> = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('PollingBlockTracker - no provider specified.');
    }

    super();

    // config
    this.#blockResetDuration = opts.blockResetDuration ?? 20 * sec;
    this.#usePastBlocks = opts.usePastBlocks ?? false;
    // state
    this.#currentBlock = null;
    this.#isRunning = false;

    // bind functions for internal use
    this.#onNewListener = this.#onNewListenerUnbound.bind(this);
    this.#onRemoveListener = this.#onRemoveListenerUnbound.bind(this);
    this.#resetCurrentBlock = this.#resetCurrentBlockUnbound.bind(this);

    // listen for handler changes
    this.#setupInternalEvents();

    // config
    this.#provider = opts.provider;
    this.#pollingInterval = opts.pollingInterval ?? 20 * sec;
    this.#retryTimeout = opts.retryTimeout ?? this.#pollingInterval / 10;
    this.#keepEventLoopActive = opts.keepEventLoopActive ?? true;
    this.#setSkipCacheFlag = opts.setSkipCacheFlag ?? false;
  }

  async destroy(): Promise<void> {
    this.#cancelBlockResetTimeout();
    super.removeAllListeners();
    this.#maybeEnd();
  }

  isRunning(): boolean {
    return this.#isRunning;
  }

  getCurrentBlock(): string | null {
    return this.#currentBlock;
  }

  async getLatestBlock({
    useCache = true,
  }: { useCache?: boolean } = {}): Promise<string> {
    // return if available
    if (this.#currentBlock && useCache) {
      return this.#currentBlock;
    }

    if (this.#pendingLatestBlock) {
      return await this.#pendingLatestBlock.promise;
    }

    const { promise, resolve, reject } = createDeferredPromise<string>({
      suppressUnhandledRejection: true,
    });
    this.#pendingLatestBlock = { reject, promise };

    if (this.#isRunning) {
      try {
        // If tracker is running, wait for next block with timeout
        const onLatestBlock = (value: string): void => {
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
        const latestBlock = await this.#updateLatestBlock();
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
        }, this.#pollingInterval);
      }
    }
  }

  // Don't allow module consumer to remove our internal event listeners.
  removeAllListeners(eventName?: string | symbol): this {
    // perform default behavior, preserve fn arity
    if (eventName) {
      super.removeAllListeners(eventName);
    } else {
      super.removeAllListeners();
    }

    // re-add internal events
    this.#setupInternalEvents();
    // trigger stop check just in case
    this.#onRemoveListener();

    return this;
  }

  #setupInternalEvents(): void {
    // first remove listeners for idempotence
    this.removeListener('newListener', this.#onNewListener);
    this.removeListener('removeListener', this.#onRemoveListener);
    // then add them
    this.on('newListener', this.#onNewListener);
    this.on('removeListener', this.#onRemoveListener);
  }

  #onNewListenerUnbound(eventName: string | symbol): void {
    // `newListener` is called *before* the listener is added
    if (blockTrackerEvents.includes(eventName)) {
      // TODO: Handle dangling promise
      this.#maybeStart();
    }
  }

  #onRemoveListenerUnbound(): void {
    // `removeListener` is called *after* the listener is removed
    if (this.#getBlockTrackerEventCount() > 0) {
      return;
    }
    this.#maybeEnd();
  }

  #maybeStart(): void {
    if (this.#isRunning) {
      return;
    }

    this.#isRunning = true;
    // cancel setting latest block to stale
    this.#cancelBlockResetTimeout();
    this.#start();
    this.emit('_started');
  }

  #maybeEnd(): void {
    if (!this.#isRunning) {
      return;
    }

    this.#isRunning = false;
    this.#setupBlockResetTimeout();
    this.#end();
    this.#rejectPendingLatestBlock(new Error('Block tracker destroyed'));
    this.emit('_ended');
  }

  #getBlockTrackerEventCount(): number {
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

  #shouldUseNewBlock(newBlock: string): boolean {
    const currentBlock = this.#currentBlock;
    if (!currentBlock) {
      return true;
    }
    const newBlockInt = hexToInt(newBlock);
    const currentBlockInt = hexToInt(currentBlock);

    return (
      (this.#usePastBlocks && newBlockInt < currentBlockInt) ||
      newBlockInt > currentBlockInt
    );
  }

  #newPotentialLatest(newBlock: string): void {
    if (!this.#shouldUseNewBlock(newBlock)) {
      return;
    }
    this.#setCurrentBlock(newBlock);
  }

  #setCurrentBlock(newBlock: string): void {
    const oldBlock = this.#currentBlock;
    this.#currentBlock = newBlock;
    this.emit('latest', newBlock);
    this.emit('sync', { oldBlock, newBlock });
  }

  #setupBlockResetTimeout(): void {
    // clear any existing timeout
    this.#cancelBlockResetTimeout();
    // clear latest block when stale
    this.#blockResetTimeout = setTimeout(
      this.#resetCurrentBlock,
      this.#blockResetDuration,
    );

    // nodejs - dont hold process open
    if (this.#blockResetTimeout.unref) {
      this.#blockResetTimeout.unref();
    }
  }

  #cancelBlockResetTimeout(): void {
    if (this.#blockResetTimeout) {
      clearTimeout(this.#blockResetTimeout);
    }
  }

  #resetCurrentBlockUnbound(): void {
    this.#currentBlock = null;
  }

  /**
   * Checks for the latest block, updates the internal state,  and returns the
   * value immediately rather than waiting for the next polling interval.
   *
   * @deprecated Use {@link getLatestBlock} instead.
   * @returns A promise that resolves to the latest block number.
   */
  async checkForLatestBlock(): Promise<string> {
    await this.#updateLatestBlock();
    return await this.getLatestBlock();
  }

  #start(): void {
    // Intentionally not awaited as this starts the polling via a timeout chain.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#updateAndQueue();
  }

  #end(): void {
    this.#clearPollingTimeout();
  }

  async #updateLatestBlock(): Promise<string> {
    // fetch + set latest block
    const latestBlock = await this.#fetchLatestBlock();
    this.#newPotentialLatest(latestBlock);

    if (!this.#isRunning) {
      // Ensure the one-time update is eventually reset once it's stale
      this.#setupBlockResetTimeout();
    }

    // _newPotentialLatest() ensures that this._currentBlock is not null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#currentBlock!;
  }

  async #fetchLatestBlock(): Promise<string> {
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
      if (this.#setSkipCacheFlag) {
        req.skipCache = true;
      }

      log('Making request', req);
      const result = await this.#provider.request<[], string>(req);
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
  async #updateAndQueue(): Promise<void> {
    let interval = this.#pollingInterval;

    try {
      await this.#updateLatestBlock();
    } catch (error: unknown) {
      try {
        this.emit('error', error);
      } catch {
        console.error(`Error updating latest block: ${getErrorMessage(error)}`);
      }

      interval = this.#retryTimeout;
    }

    if (!this.#isRunning) {
      return;
    }

    this.#clearPollingTimeout();

    const timeoutRef = setTimeout(() => {
      // Intentionally not awaited as this just continues the polling loop.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#updateAndQueue();
    }, interval);

    if (timeoutRef.unref && !this.#keepEventLoopActive) {
      timeoutRef.unref();
    }

    this.#pollingTimeout = timeoutRef;

    this.emit('_waitingForNextIteration');
  }

  #clearPollingTimeout(): void {
    if (this.#pollingTimeout) {
      clearTimeout(this.#pollingTimeout);
      this.#pollingTimeout = undefined;
    }
  }

  #addInternalListener(listener: InternalListener): void {
    this.#internalEventListeners.push(listener);
  }

  #removeInternalListener(listener: InternalListener): void {
    this.#internalEventListeners.splice(
      this.#internalEventListeners.indexOf(listener),
      1,
    );
  }

  #rejectPendingLatestBlock(error: unknown): void {
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
