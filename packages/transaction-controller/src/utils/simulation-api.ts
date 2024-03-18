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
  /** Data to send with the transaction. */
  data?: Hex;

  /** Sender of the transaction. */
  from: Hex;

  /** Gas limit for the transaction. */
  gas?: Hex;

  /** Maximum fee per gas for the transaction. */
  maxFeePerGas?: Hex;

  /** Maximum priority fee per gas for the transaction. */
  maxPriorityFeePerGas?: Hex;

  /** Recipient of the transaction. */
  to?: Hex;

  /** Value to send with the transaction. */
  value?: Hex;
};

/** Request to the simulation API to simulate transactions. */
export type SimulationRequest = {
  /**
   * Transactions to be sequentially simulated.
   * State changes impact subsequent transactions in the list.
   */
  transactions: SimulationRequestTransaction[];

  /**
   * Overrides to the state of the blockchain, keyed by smart contract address.
   */
  overrides?: {
    [address: Hex]: {
      /** Overrides to the storage slots for a smart contract account. */
      stateDiff: {
        [slot: Hex]: Hex;
      };
    };
  };

  /**
   * Whether to include call traces in the response.
   * Defaults to false.
   */
  withCallTrace?: boolean;

  /**
   * Whether to include event logs in the response.
   * Defaults to false.
   */
  withLogs?: boolean;
};

/** Raw event log emitted by a simulated transaction. */
export type SimulationResponseLog = {
  /** Address of the account that created the event. */
  address: Hex;

  /** Raw data in the event that is not indexed. */
  data: Hex;

  /** Raw indexed data from the event. */
  topics: Hex[];
};

/** Call trace of a single simulated transaction. */
export type SimulationResponseCallTrace = {
  /** Nested calls. */
  calls: SimulationResponseCallTrace[];

  /** Raw event logs created by the call. */
  logs: SimulationResponseLog[];
};

/**
 * Changes to the blockchain state.
 * Keyed by account address.
 */
export type SimulationResponseStateDiff = {
  [address: Hex]: {
    /** Native balance of the account. */
    balance?: Hex;

    /** Nonce of the account. */
    nonce?: Hex;

    /** Storage values per slot. */
    storage?: {
      [slot: Hex]: Hex;
    };
  };
};

/** Response from the simulation API for a single transaction. */
export type SimulationResponseTransaction = {
  /** An error message indicating the transaction could not be simulated. */
  error?: string;

  /** Return value of the transaction, such as the balance if calling balanceOf. */
  return: Hex;

  /** Hierarchy of call data including nested calls and logs. */
  callTrace?: SimulationResponseCallTrace;

  /** Changes to the blockchain state. */
  stateDiff?: {
    /** Initial blockchain state before the transaction. */
    pre?: SimulationResponseStateDiff;

    /** Updated blockchain state after the transaction. */
    post?: SimulationResponseStateDiff;
  };
};

/** Response from the simulation API. */
export type SimulationResponse = {
  /** Simulation data for each transaction in the request. */
  transactions: SimulationResponseTransaction[];
};

let requestIdCounter = 0;

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

  const requestId = requestIdCounter;
  requestIdCounter += 1;

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      id: String(requestId),
      jsonrpc: '2.0',
      method: RPC_METHOD,
      params: [request],
    }),
  });

  const responseJson = await response.json();

  log('Received response', responseJson);

  if (responseJson.error) {
    throw responseJson.error;
  }

  return responseJson?.result;
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
