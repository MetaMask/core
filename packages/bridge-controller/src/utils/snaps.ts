import { SolScope } from '@metamask/keyring-api';
import type { CaipChainId } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

export const getMinimumBalanceForRentExemptionRequest = (snapId: string) => {
  return {
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onProtocolRequest' as never,
    request: {
      method: ' ',
      jsonrpc: '2.0',
      params: {
        scope: SolScope.Mainnet,
        request: {
          id: uuid(),
          jsonrpc: '2.0',
          method: 'getMinimumBalanceForRentExemption',
          params: [0, { commitment: 'confirmed' }],
        },
      },
    },
  };
};

/**
 * Creates a request to compute fees for a transaction using the new unified interface
 * Returns fees in native token amount (e.g., Solana instead of Lamports)
 *
 * @param snapId - The snap ID to send the request to
 * @param transaction - The base64 encoded transaction string
 * @param accountId - The account ID
 * @param scope - The CAIP-2 chain scope
 * @returns The snap request object
 */
export const computeFeeRequest = (
  snapId: string,
  transaction: string,
  accountId: string,
  scope: CaipChainId,
) => {
  return {
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
      },
    },
  };
};
