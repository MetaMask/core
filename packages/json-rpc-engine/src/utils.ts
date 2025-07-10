import type { Json } from '@metamask/utils';
import {
  hasProperty,
  type JsonRpcNotification,
  type JsonRpcParams,
  type JsonRpcRequest,
} from '@metamask/utils';

export type JsonRpcCall<Params extends JsonRpcParams> =
  | JsonRpcNotification<Params>
  | JsonRpcRequest<Params>;

export const isRequest = <Params extends JsonRpcParams>(
  msg: JsonRpcCall<Params>,
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
