import { APIType, SmartTransaction, SmartTransactionMinedTx } from './types';
import { API_BASE_URL, CHAIN_IDS_HEX_TO_DEC } from './constants';

export function isSmartTransactionPending(smartTransaction: SmartTransaction) {
  return (
    !smartTransaction.status ||
    (!smartTransaction.status.error &&
      smartTransaction.status.minedTx === SmartTransactionMinedTx.NOT_MINED)
  );
}

// TODO use actual url once API is defined
export function getAPIRequestURL(apiType: APIType, chainId: string): string {
  const chainIdDec = CHAIN_IDS_HEX_TO_DEC[chainId];
  switch (apiType) {
    case APIType.GET_TRANSACTIONS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/getTransactions`;
    }

    case APIType.SUBMIT_TRANSACTIONS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/submitTransactions`;
    }

    case APIType.CANCEL: {
      return `${API_BASE_URL}/networks/${chainIdDec}/cancel`;
    }

    case APIType.BATCH_STATUS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/batchStatus`;
    }

    case APIType.LIVENESS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/liveness`;
    }

    default: {
      throw new Error(`Invalid APIType`); // It can never get here thanks to TypeScript.
    }
  }
}
