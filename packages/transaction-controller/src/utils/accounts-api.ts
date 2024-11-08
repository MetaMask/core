import type { Hex } from '@metamask/utils';

export type GetAccountTransactionsRequest = {
  address: Hex;
  chainIds: Hex[];
};

export type GetAccountTransactionsResponse = {
  count: number;
  hasNextPage: boolean;
  cursor: string;
  data: {
    hash: Hex;
    timestamp: string;
    chainId: number;
    blockNumber: number;
    blockHash: Hex;
    gas: number;
    gasUsed: number;
    gasPrice: string;
    effectiveGasPrice: string;
    nonce: number;
    cumulativeGasUsed: number;
    methodId: null;
    value: string;
    to: string;
    from: string;
    isError: boolean;
    valueTransfers: {
      contractAddress: string;
      decimal: number;
      symbol: string;
      from: string;
      to: string;
      amount: string;
    }[];
  }[];
};

const BASE_URL = `https://accounts.api.cx.metamask.io/v1/accounts/`;

/**
 * Fetch account transactions from the accounts API.
 * @param request - The request object.
 * @returns The response object.
 */
export async function getAccountTransactions(
  request: GetAccountTransactionsRequest,
): Promise<GetAccountTransactionsResponse> {
  const { address, chainIds } = request;

  const network = chainIds.join(',');
  const url = `${BASE_URL}${address}/transactions?networks=${network}`;

  const response = await fetch(url);
  const responseJson = await response.json();

  return responseJson;
}
