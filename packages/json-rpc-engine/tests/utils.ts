import type { JsonRpcRequest } from '@metamask/utils';

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

const requestProps = ['jsonrpc', 'method', 'params', 'id'] as const;

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
