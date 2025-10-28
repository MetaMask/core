import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcServer } from '@metamask/json-rpc-engine/v2';
import { JsonRpcError } from '@metamask/rpc-errors';
import type { JsonRpcFailure } from '@metamask/utils';
import {
  hasProperty,
  type Json,
  type JsonRpcId,
  type JsonRpcParams,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcVersion2,
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

type Options =
  | {
      /**
       * @deprecated Use `rpcHandler` instead.
       */
      engine: JsonRpcEngine;
    }
  | {
      rpcHandler: JsonRpcEngine | JsonRpcServer;
    };

/**
 * An Ethereum provider.
 *
 * This provider loosely follows conventions that pre-date EIP-1193.
 * It is not compliant with any Ethereum provider standard.
 */
export class InternalProvider {
  readonly #rpcHandler: JsonRpcEngine | JsonRpcServer;

  /**
   * Construct a InternalProvider from a JSON-RPC server or legacy engine.
   *
   * @param options - Options.
   * @param options.rpcHandler - The JSON-RPC server or engine used to process requests. Mutually exclusive with `engine`.
   * @param options.engine - The JSON-RPC engine used to process requests. Mutually exclusive with `rpcHandler`.
   */
  constructor(options: Options) {
    this.#rpcHandler =
      'rpcHandler' in options ? options.rpcHandler : options.engine;
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
    const response: JsonRpcResponse<Result> =
      await this.#handle(jsonRpcRequest);

    if ('result' in response) {
      return response.result;
    }
    throw deserializeError(response.error);
  }

  /**
   * Send a provider request asynchronously.
   *
   * This method serves the same purpose as `request`. It only exists for
   * legacy reasons.
   *
   * @param eip1193Request - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   * @deprecated Use {@link request} instead.
   */
  sendAsync = <Params extends JsonRpcParams>(
    eip1193Request: Eip1193Request<Params>,
    // Non-polluting `any` that acts like a constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);
    this.#handleWithCallback(jsonRpcRequest, callback);
  };

  /**
   * Send a provider request asynchronously.
   *
   * This method serves the same purpose as `request`. It only exists for
   * legacy reasons.
   *
   * @param eip1193Request - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   * @deprecated Use {@link request} instead.
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
    this.#handleWithCallback(jsonRpcRequest, callback);
  };

  readonly #handle = async <Result extends Json>(
    jsonRpcRequest: JsonRpcRequest,
  ): Promise<JsonRpcResponse<Result>> => {
    // @ts-expect-error - The signatures are incompatible between the legacy engine
    // and server, but this works at runtime.
    return await this.#rpcHandler.handle(jsonRpcRequest);
  };

  readonly #handleWithCallback = (
    jsonRpcRequest: JsonRpcRequest,
    callback: (error: unknown, providerRes?: unknown) => void,
  ): void => {
    /* eslint-disable promise/always-return,promise/no-callback-in-promise */
    this.#handle(jsonRpcRequest)
      .then((response) => {
        if (hasProperty(response, 'result')) {
          callback(null, response);
        } else {
          callback(deserializeError(response.error));
        }
      })
      .catch((error) => {
        callback(error);
      });
    /* eslint-enable promise/always-return,promise/no-callback-in-promise */
  };
}

/**
 * Convert an EIP-1193 request to a JSON-RPC request.
 *
 * @param eip1193Request - The EIP-1193 request to convert.
 * @returns The JSON-RPC request.
 */
export function convertEip1193RequestToJsonRpcRequest<
  Params extends JsonRpcParams,
>(
  eip1193Request: Eip1193Request<Params>,
): JsonRpcRequest<Params | Record<never, never>> {
  const { id = uuidV4(), jsonrpc = '2.0', method, params } = eip1193Request;
  return params
    ? {
        id,
        jsonrpc,
        method,
        params,
      }
    : {
        id,
        jsonrpc,
        method,
      };
}

/**
 * Deserialize a JSON-RPC error.
 *
 * @param error - The JSON-RPC error to deserialize.
 * @returns The deserialized error.
 */
function deserializeError(error: JsonRpcFailure['error']): JsonRpcError<Json> {
  const jsonRpcError = new JsonRpcError(error.code, error.message, error.data);
  if ('stack' in error) {
    jsonRpcError.stack = error.stack;
  }
  return jsonRpcError;
}
