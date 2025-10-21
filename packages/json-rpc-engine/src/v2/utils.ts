import {
  hasProperty,
  type JsonRpcNotification as BaseJsonRpcNotification,
  type JsonRpcParams,
  type JsonRpcRequest as BaseJsonRpcRequest,
} from '@metamask/utils';

export type JsonRpcNotification<Params extends JsonRpcParams = JsonRpcParams> =
  BaseJsonRpcNotification<Params>;

export type JsonRpcRequest<Params extends JsonRpcParams = JsonRpcParams> =
  BaseJsonRpcRequest<Params>;

export type JsonRpcCall<Params extends JsonRpcParams = JsonRpcParams> =
  | JsonRpcNotification<Params>
  | JsonRpcRequest<Params>;

export const isRequest = <Params extends JsonRpcParams>(
  msg: JsonRpcCall<Params> | Readonly<JsonRpcCall<Params>>,
): msg is JsonRpcRequest<Params> => hasProperty(msg, 'id');

export const isNotification = <Params extends JsonRpcParams>(
  msg: JsonRpcCall<Params>,
): msg is JsonRpcNotification<Params> => !isRequest(msg);

/**
 * JSON-stringifies a value.
 *
 * @param value - The value to stringify.
 * @returns The stringified value.
 */
export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const JsonRpcEngineErrorSymbol = Symbol.for('JsonRpcEngineError');

export class JsonRpcEngineError extends Error {
  private readonly [JsonRpcEngineErrorSymbol] = true;

  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcEngineError';
  }

  /**
   * Check if a value is a {@link JsonRpcEngineError} instance.
   * Works across different package versions in the same realm.
   *
   * @param value - The value to check.
   * @returns Whether the value is a {@link JsonRpcEngineError} instance.
   */
  static isInstance<Value extends Error>(
    value: Value,
  ): value is Value & JsonRpcEngineError {
    return (
      hasProperty(value, JsonRpcEngineErrorSymbol) &&
      value[JsonRpcEngineErrorSymbol] === true
    );
  }
}
