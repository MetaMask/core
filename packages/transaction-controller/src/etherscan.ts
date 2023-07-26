import { NetworkType, handleFetch } from '@metamask/controller-utils';

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

export interface EtherscanTransactionMeta extends EtherscanTransactionMetaBase {
  functionName: string;
  input: string;
  isError: string;
  methodId: string;
  txreceipt_status: string;
}

export interface EtherscanTokenTransactionMeta
  extends EtherscanTransactionMetaBase {
  tokenDecimal: string;
  tokenName: string;
  tokenSymbol: string;
}

export interface EtherscanTransactionResponse<
  T extends EtherscanTransactionMetaBase,
> {
  status: '0' | '1';
  result: T[];
}

export interface EtherscanTransactionRequest {
  address: string;
  networkType: NetworkType;
  limit: number;
  fromBlock?: string;
  apiKey?: string;
}

/**
 * Retrieves transaction data from Etherscan.
 *
 * @param request - Configuration required to fetch transactions.
 * @param request.address - Address to retrieve transactions for.
 * @param request.networkType - Current network type used to determine the Etherscan subdomain.
 * @param request.limit - Number of transactions to retrieve.
 * @param request.apiKey - Etherscan API key.
 * @param request.fromBlock - Block number to start fetching transactions from.
 * @returns An Etherscan response object containing the request status and an array of token transaction data.
 */
export async function fetchEtherscanTransactions({
  address,
  networkType,
  limit,
  apiKey,
  fromBlock,
}: EtherscanTransactionRequest): Promise<
  EtherscanTransactionResponse<EtherscanTransactionMeta>
> {
  return await fetchTransactions('txlist', {
    address,
    networkType,
    limit,
    fromBlock,
    apiKey,
  });
}

/**
 * Retrieves token transaction data from Etherscan.
 *
 * @param request - Configuration required to fetch token transactions.
 * @param request.address - Address to retrieve token transactions for.
 * @param request.networkType - Current network type used to determine the Etherscan subdomain.
 * @param request.limit - Number of token transactions to retrieve.
 * @param request.apiKey - Etherscan API key.
 * @param request.fromBlock - Block number to start fetching token transactions from.
 * @returns An Etherscan response object containing the request status and an array of token transaction data.
 */
export async function fetchEtherscanTokenTransactions({
  address,
  networkType,
  limit,
  apiKey,
  fromBlock,
}: EtherscanTransactionRequest): Promise<
  EtherscanTransactionResponse<EtherscanTokenTransactionMeta>
> {
  return await fetchTransactions('tokentx', {
    address,
    networkType,
    limit,
    fromBlock,
    apiKey,
  });
}

/**
 * Retrieves transaction data from Etherscan from a specific endpoint.
 *
 * @param action - The Etherscan endpoint to use.
 * @param options - Options bag.
 * @param options.address - Address to retrieve transactions for.
 * @param options.networkType - Current network type used to determine the Etherscan subdomain.
 * @param options.limit - Number of transactions to retrieve.
 * @param options.apiKey - Etherscan API key.
 * @param options.fromBlock - Block number to start fetching transactions from.
 * @returns An object containing the request status and an array of transaction data.
 */
async function fetchTransactions<T extends EtherscanTransactionMetaBase>(
  action: string,
  {
    address,
    networkType,
    limit,
    apiKey,
    fromBlock,
  }: {
    address: string;
    networkType: NetworkType;
    limit: number;
    fromBlock?: string;
    apiKey?: string;
  },
): Promise<EtherscanTransactionResponse<T>> {
  const urlParams = {
    module: 'account',
    address,
    startBlock: fromBlock,
    apikey: apiKey,
    offset: limit.toString(),
    order: 'desc',
  };

  const etherscanTxUrl = getEtherscanApiUrl(networkType, {
    ...urlParams,
    action,
  });

  const response = (await handleFetch(
    etherscanTxUrl,
  )) as EtherscanTransactionResponse<T>;

  if (response.status === '0' || response.result.length <= 0) {
    return { status: response.status, result: [] };
  }

  return response;
}

/**
 * Return a URL that can be used to fetch data from Etherscan.
 *
 * @param networkType - Network type of desired network.
 * @param urlParams - The parameters used to construct the URL.
 * @returns URL to access Etherscan data.
 */
function getEtherscanApiUrl(
  networkType: string,
  urlParams: Record<string, string | undefined>,
): string {
  let etherscanSubdomain = 'api';

  if (networkType !== NetworkType.mainnet) {
    etherscanSubdomain = `api-${networkType}`;
  }

  const apiUrl = `https://${etherscanSubdomain}.etherscan.io`;
  let url = `${apiUrl}/api?`;

  for (const paramKey in urlParams) {
    const value = urlParams[paramKey];

    if (!value) {
      continue;
    }

    url += `${paramKey}=${value}&`;
  }

  url += 'tag=latest&page=1';

  return url;
}
