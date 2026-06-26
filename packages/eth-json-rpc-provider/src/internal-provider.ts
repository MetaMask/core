import { asV2Middleware } from '@metamask/json-rpc-engine';
import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type {
  HandleOptions,
  ContextConstraint,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import type {
  Json,
  JsonRpcId,
  JsonRpcParams,
  JsonRpcSuccess,
  JsonRpcRequest,
  JsonRpcVersion2,
} from '@metamask/utils';
import { nanoid } from 'nanoid';

/**
 * A JSON-RPC request conforming to the EIP-1193 specification.
 */
type Eip1193Request<Params extends JsonRpcParams = JsonRpcParams> = {
  id?: JsonRpcId;
  jsonrpc?: JsonRpcVersion2;
  method: string;
  params?: Params;
};

type Options<
  Request extends JsonRpcRequest = JsonRpcRequest,
  Context extends ContextConstraint = MiddlewareContext,
> = {
  engine: JsonRpcEngine | JsonRpcEngineV2<Request, Context>;
};

/**
 * An Ethereum provider.
 *
 * This provider loosely follows conventions that pre-date EIP-1193.
 * It is not compliant with any Ethereum provider standard.
 */
export class InternalProvider<
  Context extends ContextConstraint = MiddlewareContext,
> {
  readonly #engine: JsonRpcEngineV2<JsonRpcRequest, Context>;

  /**
   * Construct a InternalProvider from a JSON-RPC server or legacy engine.
   *
   * @param options - Options.
   * @param options.engine - The JSON-RPC engine used to process requests.
   */
  constructor({ engine }: Options<JsonRpcRequest, Context>) {
    this.#engine =
      'push' in engine
        ? JsonRpcEngineV2.create({
            middleware: [asV2Middleware<JsonRpcParams, JsonRpcRequest>(engine)],
          })
        : engine;
  }

  /**
   * Send a provider request asynchronously.
   *
   * @param eip1193Request - The request to send.
   * @param options - The options for the request operation.
   * @param options.context - The context to include with the request.
   * @returns The JSON-RPC response.
   */
  async request<Params extends JsonRpcParams, Result extends Json>(
    eip1193Request: Eip1193Request<Params>,
    options?: HandleOptions<Context>,
  ): Promise<Result> {
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);
    return (await this.#handle<Result>(jsonRpcRequest, options)).result;
  }

  /**
   * Send a provider request asynchronously.
   *
   * This method serves the same purpose as `request`. It only exists for
   * legacy reasons.
   *
   * @param eip1193Request - The request to send.
   * @param callback - A function that is called upon the success or failure of the request.
   * @deprecated Use {@link request} instead. This method is retained solely for backwards
   * compatibility with certain libraries.
   */
  sendAsync = <Params extends JsonRpcParams>(
    eip1193Request: Eip1193Request<Params>,
    // Non-polluting `any` that acts like a constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ): void => {
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
   * @deprecated Use {@link request} instead. This method is retained solely for backwards
   * compatibility with certain libraries.
   */
  send = <Params extends JsonRpcParams>(
    eip1193Request: Eip1193Request<Params>,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ): void => {
    if (typeof callback !== 'function') {
      throw new Error('Must provide callback to "send" method.');
    }
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);
    this.#handleWithCallback(jsonRpcRequest, callback);
  };

  readonly #handle = async <Result extends Json>(
    jsonRpcRequest: JsonRpcRequest,
    options?: HandleOptions<Context>,
  ): Promise<JsonRpcSuccess<Result>> => {
    const { id, jsonrpc } = jsonRpcRequest;
    // The `result` typecast is unsafe, but we need it to preserve the provider's
    // public interface, which allows you to unsafely typecast results.
    const result = (await this.#engine.handle(
      jsonRpcRequest,
      options,
    )) as unknown as Result;

    return {
      id,
      jsonrpc,
      result,
    };
  };

  readonly #handleWithCallback = (
    jsonRpcRequest: JsonRpcRequest,
    callback: (error: unknown, providerRes?: unknown) => void,
  ): void => {
    /* eslint-disable promise/no-callback-in-promise */
    this.#handle(jsonRpcRequest)
      // A resolution will always be a successful response
      .then((response) => callback(null, response))
      .catch((error) => {
        callback(error);
      });
    /* eslint-enable promise/no-callback-in-promise */
  };
}

/**
 * Convert an EIP-1193 request to a JSON-RPC request.
 *
 * @param eip1193Request - The EIP-1193 request to convert.
 * @returns The JSON-RPC request.
 */
export function convertEip1193RequestToJsonRpcRequest(
  eip1193Request: Eip1193Request,
): JsonRpcRequest {
  const { id = nanoid(), jsonrpc = '2.0', method, params } = eip1193Request;

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
