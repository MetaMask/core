import type { CaipChainId } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

/**
 * Creates a client request object for signing and sending a transaction
 * Works for Solana, BTC, Tron, and other non-EVM networks
 *
 * @param snapId - The snap ID to send the request to
 * @param transaction - The base64 encoded transaction string
 * @param scope - The CAIP-2 chain scope
 * @param accountId - The account ID
 * @param options - Optional network-specific options
 * @returns The snap request object
 */
export const createClientTransactionRequest = (
  snapId: string,
  transaction: string,
  scope: CaipChainId,
  accountId: string,
  options?: Record<string, unknown>,
) => {
  return {
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onClientRequest' as never,
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'signAndSendTransaction',
      params: {
        transaction,
        scope,
        accountId,
        ...(options && { options }),
      },
    },
  };
};
