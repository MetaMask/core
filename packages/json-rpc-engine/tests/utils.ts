import type { JsonRpcRequest } from '@metamask/utils';

export const makeRequest = <Request extends JsonRpcRequest>(
  params: Partial<Request> = {},
): Request =>
  ({
    jsonrpc: '2.0' as const,
    id: '1',
    method: 'test_request',
    params: [] as Request['params'],
    ...params,
  }) as Request;

const requestProps = ['jsonrpc', 'method', 'params', 'id'];

/**
 * Get the keys of a request that are not part of the standard JSON-RPC request
 * properties.
 *
 * @param req - The request to get the extraneous keys from.
 * @returns The extraneous keys.
 */
export function getExtraneousKeys(req: Record<string, unknown>): string[] {
  return Object.keys(req).filter((key) => !requestProps.includes(key));
}
