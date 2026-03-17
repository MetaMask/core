/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { Trade } from '@metamask/bridge-controller';
import {
  extractTradeData,
  formatChainIdToCaip,
  isTronTrade,
} from '@metamask/bridge-controller';
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
    // TODO: remove 'as never' typing.
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

/**
 * Creates a request to sign and send a transaction for non-EVM chains
 * Uses the new unified ClientRequest:signAndSendTransaction interface
 *
 * @param trade - The trade data
 * @param srcChainId - The source chain ID
 * @param selectedAccount - The selected account information
 * @returns The snap request object for signing and sending transaction
 */
export const getClientRequest = (
  trade: Trade,
  srcChainId: number,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  const scope = formatChainIdToCaip(srcChainId);

  const transactionData = extractTradeData(trade);

  // Tron trades need the visible flag and contract type to be included in the request options
  const options = isTronTrade(trade)
    ? {
        visible: trade.visible,
        type: trade.raw_data?.contract?.[0]?.type,
      }
    : undefined;

  // Use the new unified interface
  return createClientTransactionRequest(
    selectedAccount.metadata.snap?.id as string,
    transactionData,
    scope,
    selectedAccount.id,
    options,
  );
};
