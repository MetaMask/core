import type { JsonRpcRequest } from '@metamask/utils';
import type { JsonRpcMiddleware } from 'src/v2/JsonRpcEngineV2';

import { requestProps } from '../src/v2/compatibility-utils';
import type { JsonRpcNotification } from '../src/v2/utils';

export const makeRequest = <Request extends Partial<JsonRpcRequest>>(
  params: Request = {} as Request,
) =>
  ({
    jsonrpc: '2.0',
    id: '1',
    method: 'test_request',
    params: [],
    ...params,
  }) as const satisfies JsonRpcRequest;

export const makeNotification = <Request extends Partial<JsonRpcRequest>>(
  params: Request = {} as Request,
) =>
  ({
    jsonrpc: '2.0',
    method: 'test_request',
    params: [],
    ...params,
  }) as JsonRpcNotification;

/**
 * Creates a {@link JsonRpcCall} middleware that returns `null`.
 *
 * @returns The middleware.
 */
export const makeNullMiddleware = (): JsonRpcMiddleware => {
  return () => null;
};

/**
 * Creates a {@link JsonRpcRequest} middleware that returns `null`.
 *
 * @returns The middleware.
 */
export const makeRequestMiddleware = (): JsonRpcMiddleware<JsonRpcRequest> => {
  return () => null;
};

/**
 * Creates a {@link JsonRpcNotification} middleware that returns `undefined`.
 *
 * @returns The middleware.
 */
export const makeNotificationMiddleware =
  (): JsonRpcMiddleware<JsonRpcNotification> => {
    return () => undefined;
  };

/**
 * Get the keys of a request that are not part of the standard JSON-RPC request
 * properties.
 *
 * @param req - The request to get the extraneous keys from.
 * @returns The extraneous keys.
 */
export function getExtraneousKeys(req: Record<string, unknown>): string[] {
  return Object.keys(req).filter(
    (key) => !requestProps.find((requestProp) => requestProp === key),
  );
}
