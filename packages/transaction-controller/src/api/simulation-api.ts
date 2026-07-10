import type {
  SentinelApiService,
  SentinelSimulationRequest,
} from '@metamask/sentinel-api-service';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants';
import { projectLogger } from '../logger';

const log = createModuleLogger(projectLogger, 'simulation-api');

/** Single transaction to simulate in a simulation API request.  */
export type SimulationRequestTransaction = {
  authorizationList?: {
    /** Address of a smart contract that contains the code to be set. */
    address: Hex;

    /** Address of the account being upgraded. */
    from: Hex;
  }[];

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
  blockOverrides?: {
    time?: Hex;
  };

  /**
   * Overrides to the state of the blockchain, keyed by address.
   */
  overrides?: {
    [address: Hex]: {
      /** Override the code for an address. */
      code?: Hex;

      /** Overrides to the storage slots for an address. */
      stateDiff?: {
        [slot: Hex]: Hex;
      };
    };
  };

  /**
   * Whether to include available token fees.
   */
  suggestFees?: {
    /* Whether to estimate gas for the transaction being submitted via a delegation. */
    with7702?: boolean;

    /* Whether to include the gas fee of the token transfer. */
    withFeeTransfer?: boolean;

    /* Whether to include the native transfer if available. */
    withTransfer?: boolean;
  };

  /**
   * Transactions to be sequentially simulated.
   * State changes impact subsequent transactions in the list.
   */
  transactions: SimulationRequestTransaction[];

  /**
   * Whether to include call traces in the response.
   * Defaults to false.
   */
  withCallTrace?: boolean;

  /**
   * Whether to include the default block data in the simulation.
   * Defaults to false.
   */
  withDefaultBlockOverrides?: boolean;

  /**
   * Whether to use the gas fees in the simulation.
   * Defaults to false.
   */
  withGas?: boolean;

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
  calls?: SimulationResponseCallTrace[] | null;

  /** Error message for the call, if any. */
  error?: string;

  /** Raw event logs created by the call. */
  logs?: SimulationResponseLog[] | null;

  /** Raw return data from the call (revert hex when reverted). */
  output?: Hex;
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

export type SimulationResponseTokenFee = {
  /** Token data independent of current transaction. */
  token: {
    /** Address of the token contract. */
    address: Hex;

    /** Decimals of the token. */
    decimals: number;

    /** Symbol of the token. */
    symbol: string;
  };

  /** Amount of tokens needed to pay for gas. */
  balanceNeededToken: Hex;

  /** Current token balance of sender. */
  currentBalanceToken: Hex;

  /** Account address that token should be transferred to. */
  feeRecipient: Hex;

  /** Conversation rate of 1 token to native WEI. */
  rateWei: Hex;

  /** Portion of `balanceNeededToken` that is the fee paid to MetaMask. */
  serviceFee?: Hex;

  /** Estimated gas limit required for fee transfer. */
  transferEstimate: Hex;
};

/** Response from the simulation API for a single transaction. */
export type SimulationResponseTransaction = {
  /** Hierarchy of call data including nested calls and logs. */
  callTrace?: SimulationResponseCallTrace;

  /** An error message indicating the transaction could not be simulated. */
  error?: string;

  /** Recommended gas fees for the transaction. */
  fees?: {
    /** Gas limit for the fee level. */
    gas: Hex;

    /** Maximum fee per gas for the fee level. */
    maxFeePerGas: Hex;

    /** Maximum priority fee per gas for the fee level. */
    maxPriorityFeePerGas: Hex;

    /** Token fee data for the fee level. */
    tokenFees: SimulationResponseTokenFee[];
  }[];

  /**
   * Estimated total gas cost of the transaction.
   * Included in the stateDiff if `withGas` is true.
   */
  gasCost?: number;

  /** Required `gasLimit` for the transaction. */
  gasLimit?: Hex;

  /** Total gas used by the transaction. */
  gasUsed?: Hex;

  /** Return value of the transaction, such as the balance if calling balanceOf. */
  return: Hex;

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

  sponsorship: {
    /** Whether the gas costs are sponsored meaning a transfer is not required. */
    isSponsored: boolean;

    /** Error message for the determination of sponsorship. */
    error: string | null;
  };
};

/**
 * Simulate transactions using the injected {@link SentinelApiService}.
 *
 * The DelegationManager code override is still applied locally via
 * {@link finalizeRequest} before delegating the actual
 * `infura_simulateTransactions` request (URL derivation, JSON-RPC transport,
 * validation, and error handling) to the shared service.
 *
 * @param sentinelApiService - The Sentinel API service to delegate to.
 * @param chainId - The chain ID to simulate transactions on.
 * @param request - The request to simulate transactions.
 * @returns The response from the simulation API.
 */
export async function simulateTransactions(
  sentinelApiService: SentinelApiService,
  chainId: Hex,
  request: SimulationRequest,
): Promise<SimulationResponse> {
  const finalizedRequest = finalizeRequest(request);

  log('Sending request', chainId, finalizedRequest);

  const response = await sentinelApiService.simulateTransactions(
    chainId,
    finalizedRequest as unknown as SentinelSimulationRequest,
  );

  log('Received response', response);

  return response as unknown as SimulationResponse;
}

/**
 * Finalize the simulation request.
 * Overrides the DelegationManager code to remove signature errors.
 * Temporary pending support in the simulation API.
 *
 * @param request - The simulation request to finalize.
 * @returns The finalized simulation request.
 */
function finalizeRequest(request: SimulationRequest): SimulationRequest {
  const newRequest = cloneDeep(request);

  for (const transaction of newRequest.transactions) {
    const normalizedTo = transaction.to?.toLowerCase() as Hex;

    const isToDelegationManager =
      DELEGATION_MANAGER_ADDRESSES.includes(normalizedTo);

    if (!isToDelegationManager) {
      continue;
    }

    newRequest.overrides = newRequest.overrides ?? {};

    newRequest.overrides[normalizedTo] = {
      code: CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
    };
  }

  return newRequest;
}
