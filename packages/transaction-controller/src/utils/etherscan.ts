import { handleFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import { ETHERSCAN_SUPPORTED_NETWORKS } from '../constants';
import { incomingTransactionsLogger as log } from '../logger';

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface EtherscanTransactionMetaBase {
  blockNumber: string;
  blockHash: string;
  confirmations: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  nonce: string;
  timeStamp: string;
  to: string;
  transactionIndex: string;
  value: string;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface EtherscanTransactionMeta extends EtherscanTransactionMetaBase {
  functionName: string;
  input: string;
  isError: string;
  methodId: string;
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  txreceipt_status: string;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface EtherscanTokenTransactionMeta
  extends EtherscanTransactionMetaBase {
  tokenDecimal: string;
  tokenName: string;
  tokenSymbol: string;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface EtherscanTransactionResponse<
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  T extends EtherscanTransactionMetaBase,
> {
  status: '0' | '1';
  message?: string;
  result: string | T[];
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface EtherscanTransactionRequest {
  address: string;
  chainId: Hex;
  fromBlock?: number;
  limit?: number;
}

/**
 * Retrieves transaction data from Etherscan.
 *
 * @param request - Configuration required to fetch transactions.
 * @param request.address - Address to retrieve transactions for.
 * @param request.chainId - Current chain ID used to determine subdomain and domain.
 * @param request.fromBlock - Block number to start fetching transactions from.
 * @param request.limit - Number of transactions to retrieve.
 * @returns An Etherscan response object containing the request status and an array of token transaction data.
 */
export async function fetchEtherscanTransactions({
  address,
  chainId,
  fromBlock,
  limit,
}: EtherscanTransactionRequest): Promise<
  EtherscanTransactionResponse<EtherscanTransactionMeta>
> {
  return await fetchTransactions('txlist', {
    address,
    chainId,
    fromBlock,
    limit,
  });
}

/**
 * Retrieves token transaction data from Etherscan.
 *
 * @param request - Configuration required to fetch token transactions.
 * @param request.address - Address to retrieve token transactions for.
 * @param request.chainId - Current chain ID used to determine subdomain and domain.
 * @param request.fromBlock - Block number to start fetching token transactions from.
 * @param request.limit - Number of token transactions to retrieve.
 * @returns An Etherscan response object containing the request status and an array of token transaction data.
 */
export async function fetchEtherscanTokenTransactions({
  address,
  chainId,
  fromBlock,
  limit,
}: EtherscanTransactionRequest): Promise<
  EtherscanTransactionResponse<EtherscanTokenTransactionMeta>
> {
  return await fetchTransactions('tokentx', {
    address,
    chainId,
    fromBlock,
    limit,
  });
}

/**
 * Retrieves transaction data from Etherscan from a specific endpoint.
 *
 * @param action - The Etherscan endpoint to use.
 * @param options - Options bag.
 * @param options.address - Address to retrieve transactions for.
 * @param options.chainId - Current chain ID used to determine subdomain and domain.
 * @param options.fromBlock - Block number to start fetching transactions from.
 * @param options.limit - Number of transactions to retrieve.
 * @returns An object containing the request status and an array of transaction data.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
async function fetchTransactions<T extends EtherscanTransactionMetaBase>(
  action: string,
  {
    address,
    chainId,
    fromBlock,
    limit,
  }: {
    address: string;
    chainId: Hex;
    fromBlock?: number;
    limit?: number;
  },
): Promise<EtherscanTransactionResponse<T>> {
  const urlParams = {
    module: 'account',
    address,
    startBlock: fromBlock?.toString(),
    offset: limit?.toString(),
    sort: 'desc',
  };

  const etherscanTxUrl = getEtherscanApiUrl(chainId, {
    ...urlParams,
    action,
  });

  log('Sending Etherscan request', etherscanTxUrl);

  const response = (await handleFetch(
    etherscanTxUrl,
  )) as EtherscanTransactionResponse<T>;

  return response;
}

/**
 * Return a URL that can be used to fetch data from Etherscan.
 *
 * @param chainId - Current chain ID used to determine subdomain and domain.
 * @param urlParams - The parameters used to construct the URL.
 * @returns URL to access Etherscan data.
 */
function getEtherscanApiUrl(
  chainId: Hex,
  urlParams: Record<string, string | undefined>,
): string {
  const apiUrl = getEtherscanApiHost(chainId);
  let url = `${apiUrl}/api?`;

  for (const paramKey of Object.keys(urlParams)) {
    const value = urlParams[paramKey];

    if (!value) {
      continue;
    }

    url += `${paramKey}=${value}&`;
  }

  url += 'tag=latest&page=1';

  return url;
}

/**
 * Return the host url used to fetch data from Etherscan.
 *
 * @param chainId - Current chain ID used to determine subdomain and domain.
 * @returns host URL to access Etherscan data.
 */
export function getEtherscanApiHost(chainId: Hex) {
  // @ts-expect-error We account for `chainId` not being a property below
  const networkInfo = ETHERSCAN_SUPPORTED_NETWORKS[chainId];

  if (!networkInfo) {
    throw new Error(`Etherscan does not support chain with ID: ${chainId}`);
  }

  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `https://${networkInfo.subdomain}.${networkInfo.domain}`;
}
