import { successfulFetch } from '@metamask/controller-utils';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';

export type TransactionResponse = {
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
};

export type GetAccountTransactionsRequest = {
  address: Hex;
  chainIds?: Hex[];
  cursor?: string;
  endTimestamp?: number;
  sortDirection?: 'ASC' | 'DESC';
  startTimestamp?: number;
};

export type GetAccountTransactionsResponse = {
  data: TransactionResponse[];
  pageInfo: {
    count: number;
    hasNextPage: boolean;
    cursor?: string;
  };
};

const BASE_URL = `https://accounts.api.cx.metamask.io/v1/accounts/`;
const CLIENT_HEADER = 'x-metamask-clientproduct';
const CLIENT_ID = 'metamask-incoming-transactions';

const log = createModuleLogger(projectLogger, 'accounts-api');

/**
 * Fetch account transactions from the accounts API.
 * @param request - The request object.
 * @returns The response object.
 */
export async function getAccountTransactions(
  request: GetAccountTransactionsRequest,
): Promise<GetAccountTransactionsResponse> {
  const {
    address,
    chainIds,
    cursor,
    endTimestamp,
    sortDirection,
    startTimestamp,
  } = request;

  let url = `${BASE_URL}${address}/transactions`;
  const params = [];

  if (chainIds) {
    const network = chainIds.join(',');
    params.push(`networks=${network}`);
  }

  if (startTimestamp) {
    params.push(`startTimestamp=${startTimestamp}`);
  }

  if (endTimestamp) {
    params.push(`endTimestamp=${endTimestamp}`);
  }

  if (cursor) {
    params.push(`cursor=${cursor}`);
  }

  if (sortDirection) {
    params.push(`sortDirection=${sortDirection}`);
  }

  if (params.length) {
    url += `?${params.join('&')}`;
  }

  log('Getting account transactions', { request, url });

  const headers = {
    [CLIENT_HEADER]: CLIENT_ID,
  };

  const response = await successfulFetch(url, { headers });
  const responseJson = await response.json();

  log('Retrieved account transactions', responseJson);

  return responseJson;
}
