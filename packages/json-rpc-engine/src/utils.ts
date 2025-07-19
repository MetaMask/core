import type { Json } from '@metamask/utils';
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
 * JSON-stringifies a JSON value.
 *
 * @param value - The value to stringify.
 * @returns The stringified value.
 */
export function stringify(value: Json | Readonly<Json>): string {
  return JSON.stringify(value, null, 2);
}

export class JsonRpcEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonRpcEngineError';
  }
}
