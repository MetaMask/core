import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash-es';

import {
  CODE_DELEGATION_MANAGER_NO_SIGNATURE_ERRORS,
  DELEGATION_MANAGER_ADDRESSES,
} from '../constants.js';
import { projectLogger } from '../logger.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type { GetSimulationConfig } from '../types.js';

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
   * Function to get the simulation configuration.
   */
  getSimulationConfig: GetSimulationConfig;

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

    /*
     * Whether to include a RedeemerEnforcer caveat, restricting redemption to
     * the relay signers, in the delegation used for the EIP-7702 estimate.
     */
    withRedeemerEnforcer?: boolean;

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

type SimulateTransactionsOptions = {
  chainId: Hex;
  messenger: TransactionControllerMessenger;
  request: SimulationRequest;
};

/**
 * Simulate transactions using the transaction simulation API.
 *
 * @param options - Simulation options.
 * @param options.chainId - The chain ID to simulate transactions on.
 * @param options.request - The request to simulate transactions.
 * @param options.messenger - The transaction controller messenger.
 * @returns The response from the simulation API.
 */
export async function simulateTransactions({
  chainId,
  request,
  messenger,
}: SimulateTransactionsOptions): Promise<SimulationResponse> {
  const { getSimulationConfig, ...rpcRequest } = finalizeRequest(request);

  log('Sending request', chainId, rpcRequest);

  // Callers catch simulation failures and either swallow or replace them, so
  // all service errors, including a missing result, can propagate unchanged.
  const response = await messenger.call(
    'SentinelApiService:simulateTransactions',
    chainId,
    rpcRequest,
    {
      getUrl: async (defaultUrl) => {
        const { newUrl, authorization } =
          (await getSimulationConfig(defaultUrl)) || {};

        return {
          url: newUrl ?? defaultUrl,
          ...(authorization ? { authorization } : {}),
        };
      },
    },
  );

  log('Received response', response);

  return response;
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
