import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type { JsonRpcRequest } from '@metamask/utils';

/**
 * An Ethereum provider.
 *
 * This provider loosely follows conventions that pre-date EIP-1193.
 * It is not compliant with any Ethereum provider standard.
 */
export class SafeEventEmitterProvider extends SafeEventEmitter {
  #engine: JsonRpcEngine;

  /**
   * Construct a SafeEventEmitterProvider from a JSON-RPC engine.
   *
   * @param options - Options.
   * @param options.engine - The JSON-RPC engine used to process requests.
   */
  constructor({ engine }: { engine: JsonRpcEngine }) {
    super();
    this.#engine = engine;

    if (engine.on) {
      engine.on('notification', (message: string) => {
        this.emit('data', null, message);
      });
    }
  }

  /**
   * Send a provider request asynchronously.
   *
   * @param req - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   */
  sendAsync = (
    req: JsonRpcRequest,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    this.#engine.handle(req, callback);
  };

  /**
   * Send a provider request asynchronously.
   *
   * This method serves the same purpose as `sendAsync`. It only exists for
   * legacy reasons.
   *
   * @deprecated Use `sendAsync` instead.
   * @param req - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   */
  send = (
    req: JsonRpcRequest,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    if (typeof callback !== 'function') {
      throw new Error('Must provide callback to "send" method.');
    }
    this.#engine.handle(req, callback);
  };
}
