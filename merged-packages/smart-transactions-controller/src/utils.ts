import { APIType, SmartTransaction, SmartTransactionMinedTx } from './types';
import { API_BASE_URL } from './constants';

export function isSmartTransactionPending(smartTransaction: SmartTransaction) {
  return (
    !smartTransaction.status ||
    (!smartTransaction.status.error &&
      smartTransaction.status.minedTx === SmartTransactionMinedTx.NOT_MINED)
  );
}

// TODO use actual url once API is defined
export function getAPIRequestURL(apiType: APIType, chainId: string): string {
  switch (apiType) {
    case APIType.GET_TRANSACTIONS: {
      return `${API_BASE_URL}/networks/${chainId}/getTransactions`;
    }

    case APIType.SUBMIT_TRANSACTIONS: {
      return `${API_BASE_URL}/networks/${chainId}/submitTransactions`;
    }

    case APIType.CANCEL: {
      return `${API_BASE_URL}/networks/${chainId}/cancel`;
    }

    case APIType.STATUS: {
      return `${API_BASE_URL}/networks/${chainId}/status`;
    }

    case APIType.LIVENESS: {
      return `${API_BASE_URL}/networks/${chainId}/liveness`;
    }

    default: {
      throw new Error(`Invalid APIType`);
    }
  }
}
