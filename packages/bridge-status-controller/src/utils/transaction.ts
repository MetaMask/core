import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { TxData } from '@metamask/bridge-controller';
import {
  ChainId,
  formatChainIdToHex,
  type QuoteMetadata,
  type QuoteResponse,
} from '@metamask/bridge-controller';
import { SolScope } from '@metamask/keyring-api';
import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { createProjectLogger } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import { LINEA_DELAY_MS } from '../constants';
import type { SolanaTransactionMeta } from '../types';

export const generateActionId = () => (Date.now() + Math.random()).toString();

export const getStatusRequestParams = (
  quoteResponse: QuoteResponse<string | TxData>,
) => {
  return {
    bridgeId: quoteResponse.quote.bridgeId,
    bridge: quoteResponse.quote.bridges[0],
    srcChainId: quoteResponse.quote.srcChainId,
    destChainId: quoteResponse.quote.destChainId,
    quote: quoteResponse.quote,
    refuel: Boolean(quoteResponse.quote.refuel),
  };
};

export const getTxMetaFields = (
  quoteResponse: Omit<QuoteResponse<string | TxData>, 'approval' | 'trade'> &
    QuoteMetadata,
  approvalTxId?: string,
): Omit<
  TransactionMeta,
  'networkClientId' | 'status' | 'time' | 'txParams' | 'id'
> => {
  return {
    destinationChainId: formatChainIdToHex(quoteResponse.quote.destChainId),
    sourceTokenAmount: quoteResponse.quote.srcTokenAmount,
    sourceTokenSymbol: quoteResponse.quote.srcAsset.symbol,
    sourceTokenDecimals: quoteResponse.quote.srcAsset.decimals,
    sourceTokenAddress: quoteResponse.quote.srcAsset.address,

    destinationTokenAmount: quoteResponse.quote.destTokenAmount,
    destinationTokenSymbol: quoteResponse.quote.destAsset.symbol,
    destinationTokenDecimals: quoteResponse.quote.destAsset.decimals,
    destinationTokenAddress: quoteResponse.quote.destAsset.address,

    chainId: formatChainIdToHex(quoteResponse.quote.srcChainId),
    approvalTxId,
    // this is the decimal (non atomic) amount (not USD value) of source token to swap
    swapTokenValue: quoteResponse.sentAmount.amount,
  };
};

export const handleSolanaTxResponse = (
  snapResponse: string | { result: Record<string, string> },
  quoteResponse: Omit<QuoteResponse<string>, 'approval'> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
): TransactionMeta & SolanaTransactionMeta => {
  const selectedAccountAddress = selectedAccount.address;
  const snapId = selectedAccount.metadata.snap?.id;
  let hash;
  // Handle different response formats
  if (typeof snapResponse === 'string') {
    hash = snapResponse;
  } else if (snapResponse && typeof snapResponse === 'object') {
    // If it's an object with result property, try to get the signature
    if (snapResponse.result && typeof snapResponse.result === 'object') {
      // Try to extract signature from common locations in response object
      hash =
        snapResponse.result.signature ||
        snapResponse.result.txid ||
        snapResponse.result.hash ||
        snapResponse.result.txHash;
    }
  }

  const hexChainId = formatChainIdToHex(quoteResponse.quote.srcChainId);
  // Create a transaction meta object with bridge-specific fields
  return {
    ...getTxMetaFields(quoteResponse),
    time: Date.now(),
    id: uuid(),
    chainId: hexChainId,
    networkClientId: snapId ?? hexChainId,
    txParams: { from: selectedAccountAddress, data: quoteResponse.trade },
    type: TransactionType.bridge,
    status: TransactionStatus.submitted,
    hash, // Add the transaction signature as hash
    origin: snapId,
    // Add an explicit bridge flag to mark this as a Solana transaction
    isSolana: true, // TODO deprecate this and use chainId
    isBridgeTx: true, // TODO deprecate this and use type
  };
};

export const handleLineaDelay = async (
  quoteResponse: QuoteResponse<TxData | string>,
) => {
  if (ChainId.LINEA === quoteResponse.quote.srcChainId) {
    const debugLog = createProjectLogger('bridge');
    debugLog(
      'Delaying submitting bridge tx to make Linea confirmation more likely',
    );
    const waitPromise = new Promise((resolve) =>
      setTimeout(resolve, LINEA_DELAY_MS),
    );
    await waitPromise;
  }
};

export const getKeyringRequest = (
  quoteResponse: Omit<QuoteResponse<string>, 'approval'> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  const keyringReqId = uuid();
  const snapRequestId = uuid();

  return {
    origin: 'metamask',
    snapId: selectedAccount.metadata.snap?.id as never,
    handler: 'onKeyringRequest' as never,
    request: {
      id: keyringReqId,
      jsonrpc: '2.0',
      method: 'keyring_submitRequest',
      params: {
        request: {
          params: {
            account: { address: selectedAccount.address },
            transaction: quoteResponse.trade,
            scope: SolScope.Mainnet,
          },
          method: 'signAndSendTransaction',
        },
        id: snapRequestId,
        account: selectedAccount.id,
        scope: SolScope.Mainnet,
      },
    },
  };
};
