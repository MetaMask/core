import type { CaipChainId } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

/**
 * Creates a request to compute fees for a transaction using the new unified interface
 * Returns fees in native token amount (e.g., Solana instead of Lamports)
 *
 * @param snapId - The snap ID to send the request to
 * @param transaction - The base64 encoded transaction string
 * @param accountId - The account ID
 * @param scope - The CAIP-2 chain scope
 * @param options - Additional options to include in the request
 * @returns The snap request object
 */
export const computeFeeRequest = (
  snapId: string,
  transaction: string,
  accountId: string,
  scope: CaipChainId,
  options?: Record<string, unknown>,
) => {
  return {
    // TODO: remove 'as never' typing.
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onClientRequest' as never,
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'computeFee',
      params: {
        transaction,
        accountId,
        scope,
        ...(options && { options }),
      },
    },
  };
};
