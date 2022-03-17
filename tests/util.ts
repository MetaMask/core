import { JsonRpcRequest } from 'json-rpc-engine';
import { EthQueryMethodCallback, EthQuerySendAsyncFunction } from 'eth-query';
import { EthQueryish } from '../src/util';

/**
 * Builds a EthQuery object that implements the bare minimum necessary to pass
 * to `query`.
 *
 * @param overrides - An optional set of methods to add to the fake EthQuery
 * object.
 * @returns The fake EthQuery object.
 */
export function buildFakeEthQuery(
  overrides: Record<string, (...args: any[]) => void> = {},
): EthQueryish {
  const sendAsync: EthQuerySendAsyncFunction<
    Record<string, unknown>,
    string
  > = (
    _request: JsonRpcRequest<Record<string, unknown>>,
    callback: EthQueryMethodCallback<string>,
  ) => {
    callback(null, 'default result');
  };

  return {
    sendAsync,
    ...overrides,
  };
}
