import { JsonRpcProvider } from '@ethersproject/providers';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { CHAIN_IDS } from '../constants';
import { projectLogger } from '../logger';

const log = createModuleLogger(projectLogger, 'simulation-api');

const RPC_METHOD = 'infura_simulateTransactions';
const BASE_URL = 'https://tx-sentinel-{0}.api.cx.metamask.io/';

const SUBDOMAIN_BY_CHAIN_ID: Record<Hex, string> = {
  [CHAIN_IDS.MAINNET]: 'ethereum-mainnet',
  [CHAIN_IDS.GOERLI]: 'ethereum-goerli',
  [CHAIN_IDS.SEPOLIA]: 'ethereum-sepolia',
  [CHAIN_IDS.LINEA_MAINNET]: 'linea-mainnet',
  [CHAIN_IDS.LINEA_GOERLI]: 'linea-goerli',
  [CHAIN_IDS.ARBITRUM]: 'arbitrum-mainnet',
  [CHAIN_IDS.AVALANCHE]: 'avalanche-mainnet',
  [CHAIN_IDS.OPTIMISM]: 'optimism-mainnet',
  [CHAIN_IDS.POLYGON]: 'polygon-mainnet',
  [CHAIN_IDS.BSC]: 'bsc-mainnet',
};

/** Single transaction to simulate in a simulation API request.  */
export type SimulationRequestTransaction = {
  from: Hex;
  to?: Hex;
  value?: Hex;
  data?: Hex;
};

/** Request to the simulation API to simulate transactions. */
export type SimulationRequest = {
  transactions: SimulationRequestTransaction[];
  overrides?: {
    [address: Hex]: {
      stateDiff: {
        [slot: Hex]: Hex;
      };
    };
  };
  withCallTrace?: boolean;
  withLogs?: boolean;
};

/** Raw event log emitted by a simulated transaction. */
export type SimulationLog = {
  address: Hex;
  data: Hex;
  topics: Hex[];
};

/** Call trace of a single simulated transaction. */
export type SimulationResponseCallTrace = {
  calls: SimulationResponseCallTrace[];
  logs: SimulationLog[];
};

/** Response from the simulation API. */
export type SimulationResponse = {
  transactions: {
    return: Hex;
    callTrace: SimulationResponseCallTrace;
    stateDiff: {
      pre: {
        [address: Hex]: {
          balance?: Hex;
          nonce?: Hex;
          storage?: {
            [slot: Hex]: Hex;
          };
        };
      };
      post: {
        [address: Hex]: {
          balance?: Hex;
          nonce?: Hex;
          storage?: {
            [slot: Hex]: Hex;
          };
        };
      };
    };
  }[];
};

/**
 * Simulate transactions using the transaction simulation API.
 * @param chainId - The chain ID to simulate transactions on.
 * @param request - The request to simulate transactions.
 */
export async function simulateTransactions(
  chainId: Hex,
  request: SimulationRequest,
): Promise<SimulationResponse> {
  const url = getUrl(chainId);

  log('Sending request', url, request);

  const jsonRpc = new JsonRpcProvider(url);
  const response = await jsonRpc.send(RPC_METHOD, [request]);

  log('Received response', response);

  return response;
}

/**
 * Get the URL for the transaction simulation API.
 * @param chainId - The chain ID to get the URL for.
 * @returns The URL for the transaction simulation API.
 */
function getUrl(chainId: Hex): string {
  const subdomain = SUBDOMAIN_BY_CHAIN_ID[chainId];

  if (!subdomain) {
    log('Chain is not supported', chainId);
    throw new Error(`Chain is not supported: ${chainId}`);
  }

  return BASE_URL.replace('{0}', subdomain);
}
