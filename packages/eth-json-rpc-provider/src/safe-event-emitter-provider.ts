import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { JsonRpcError } from '@metamask/rpc-errors';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type {
  Json,
  JsonRpcId,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcVersion2,
} from '@metamask/utils';
import { v4 as uuidV4 } from 'uuid';

/**
 * A JSON-RPC request conforming to the EIP-1193 specification.
 */
type Eip1193Request<Params extends JsonRpcParams> = {
  id?: JsonRpcId;
  jsonrpc?: JsonRpcVersion2;
  method: string;
  params?: Params;
};

/**
 * Converts an EIP-1193 request to a JSON-RPC request.
 *
 * @param eip1193Request - The EIP-1193 request to convert.
 * @returns The corresponding JSON-RPC request.
 */
export function convertEip1193RequestToJsonRpcRequest<
  Params extends JsonRpcParams,
>(
  eip1193Request: Eip1193Request<Params>,
): JsonRpcRequest<Params | Record<never, never>> {
  const {
    id = uuidV4(),
    jsonrpc = '2.0',
    method,
    params = {},
  } = eip1193Request;
  return {
    id,
    jsonrpc,
    method,
    params,
  };
}

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
   * @param eip1193Request - The request to send.
   * @returns The JSON-RPC response.
   */
  async request<Params extends JsonRpcParams, Result extends Json>(
    eip1193Request: Eip1193Request<Params>,
  ): Promise<Result> {
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);
    const response = await this.#engine.handle<
      Params | Record<never, never>,
      Result
    >(jsonRpcRequest);

    if ('result' in response) {
      return response.result;
    }

    const error = new JsonRpcError(
      response.error.code,
      response.error.message,
      response.error.data,
    );
    if ('stack' in response.error) {
      error.stack = response.error.stack;
    }
    throw error;
  }

  /**
   * Send a provider request asynchronously.
   *
   * This method serves the same purpose as `request`. It only exists for
   * legacy reasons.
   *
   * @param eip1193Request - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   * @deprecated Please use `request` instead.
   */
  sendAsync = <Params extends JsonRpcParams>(
    eip1193Request: Eip1193Request<Params>,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);
    this.#engine.handle(jsonRpcRequest, callback);
  };

  /**
   * Send a provider request asynchronously.
   *
   * This method serves the same purpose as `request`. It only exists for
   * legacy reasons.
   *
   * @param eip1193Request - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   * @deprecated Please use `request` instead.
   */
  send = <Params extends JsonRpcParams>(
    eip1193Request: Eip1193Request<Params>,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    if (typeof callback !== 'function') {
      throw new Error('Must provide callback to "send" method.');
    }
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);
    this.#engine.handle(jsonRpcRequest, callback);
  };
}
