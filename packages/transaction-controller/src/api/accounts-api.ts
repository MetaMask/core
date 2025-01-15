import { successfulFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { FirstTimeInteractionError } from '../errors';
import { projectLogger } from '../logger';

export type AccountAddressRelationshipResponse = {
  chainId?: number;
  count?: number;
  data?: {
    hash: string;
    timestamp: string;
    chainId: number;
    blockNumber: string;
    blockHash: string;
    gas: number;
    gasUsed: number;
    gasPrice: string;
    effectiveGasPrice: number;
    nonce: number;
    cumulativeGasUsed: number;
    methodId: string;
    value: string;
    to: string;
    from: string;
  };
  txHash?: string;
};

export type AccountAddressRelationshipResult =
  AccountAddressRelationshipResponse & {
    error?: {
      code: string;
      message: string;
    };
  };

export type GetAccountAddressRelationshipRequest = {
  /** Chain ID of account relationship to check. */
  chainId: number;

  /** Recipient of the transaction. */
  to: string;

  /** Sender of the transaction. */
  from: string;
};

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

const BASE_URL = `https://accounts.api.cx.metamask.io`;
const BASE_URL_ACCOUNTS = `${BASE_URL}/v1/accounts/`;
const CLIENT_HEADER = 'x-metamask-clientproduct';
const CLIENT_ID = 'metamask-transaction-controller';

const SUPPORTED_CHAIN_IDS_FOR_RELATIONSHIP_API = [
  1, // Ethereum Mainnet
  10, // Optimism
  56, // BSC
  137, // Polygon
  8453, // Base
  42161, // Arbitrum
  59144, // Linea
  534352, // Scroll
];

const log = createModuleLogger(projectLogger, 'accounts-api');

/**
 * Fetch account address relationship from the accounts API.
 * @param request - The request object.
 * @returns The raw response object from the API.
 */
export async function getAccountAddressRelationship(
  request: GetAccountAddressRelationshipRequest,
): Promise<AccountAddressRelationshipResult> {
  const { chainId, from, to } = request;

  if (!SUPPORTED_CHAIN_IDS_FOR_RELATIONSHIP_API.includes(chainId)) {
    log('Unsupported chain ID for account relationship API', chainId);
    throw new FirstTimeInteractionError('Unsupported chain ID');
  }

  const url = `${BASE_URL}/v1/networks/${chainId}/accounts/${from}/relationships/${to}`;

  log('Getting account address relationship', { request, url });

  const headers = {
    [CLIENT_HEADER]: CLIENT_ID,
  };

  const response = await successfulFetch(url, { headers });

  if (response.status === 204) {
    // The accounts API returns a 204 status code when there are no transactions with empty body
    // imitating a count of 0
    return { count: 0 };
  }

  const responseJson: AccountAddressRelationshipResult = await response.json();

  log('Retrieved account address relationship', responseJson);

  if (responseJson.error) {
    const { code, message } = responseJson.error;
    throw new FirstTimeInteractionError(message, code);
  }

  return responseJson;
}

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

  let url = `${BASE_URL_ACCOUNTS}${address}/transactions`;
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
