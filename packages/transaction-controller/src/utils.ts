import type { TransactionDescription } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import {
  convertHexToDecimal,
  isValidHexAddress,
  query,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { abiERC721, abiERC20, abiERC1155 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { addHexPrefix, isHexString } from 'ethereumjs-util';
import type { Transaction as NonceTrackerTransaction } from 'nonce-tracker/dist/NonceTracker';

import type {
  GasPriceValue,
  FeeMarketEIP1559Values,
} from './TransactionController';
import type {
  InferTransactionTypeResult,
  Transaction,
  TransactionMeta,
} from './types';
import { TransactionType, TransactionStatus } from './types';

export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

const erc20Interface = new Interface(abiERC20);
const erc721Interface = new Interface(abiERC721);
const erc1155Interface = new Interface(abiERC1155);

const NORMALIZERS: { [param in keyof Transaction]: any } = {
  data: (data: string) => addHexPrefix(data),
  from: (from: string) => addHexPrefix(from).toLowerCase(),
  gas: (gas: string) => addHexPrefix(gas),
  gasPrice: (gasPrice: string) => addHexPrefix(gasPrice),
  nonce: (nonce: string) => addHexPrefix(nonce),
  to: (to: string) => addHexPrefix(to).toLowerCase(),
  value: (value: string) => addHexPrefix(value),
  maxFeePerGas: (maxFeePerGas: string) => addHexPrefix(maxFeePerGas),
  maxPriorityFeePerGas: (maxPriorityFeePerGas: string) =>
    addHexPrefix(maxPriorityFeePerGas),
  estimatedBaseFee: (maxPriorityFeePerGas: string) =>
    addHexPrefix(maxPriorityFeePerGas),
};

/**
 * Normalizes properties on a Transaction object.
 *
 * @param transaction - Transaction object to normalize.
 * @returns Normalized Transaction object.
 */
export function normalizeTransaction(transaction: Transaction) {
  const normalizedTransaction: Transaction = { from: '' };
  let key: keyof Transaction;
  for (key in NORMALIZERS) {
    if (transaction[key as keyof Transaction]) {
      normalizedTransaction[key] = NORMALIZERS[key](transaction[key]) as never;
    }
  }
  return normalizedTransaction;
}

/**
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate.
 */
export function validateTransaction(transaction: Transaction) {
  if (
    !transaction.from ||
    typeof transaction.from !== 'string' ||
    !isValidHexAddress(transaction.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${transaction.from} must be a valid string.`,
    );
  }

  if (transaction.to === '0x' || transaction.to === undefined) {
    if (transaction.data) {
      delete transaction.to;
    } else {
      throw new Error(
        `Invalid "to" address: ${transaction.to} must be a valid string.`,
      );
    }
  } else if (
    transaction.to !== undefined &&
    !isValidHexAddress(transaction.to)
  ) {
    throw new Error(
      `Invalid "to" address: ${transaction.to} must be a valid string.`,
    );
  }

  if (transaction.value !== undefined) {
    const value = transaction.value.toString();
    if (value.includes('-')) {
      throw new Error(`Invalid "value": ${value} is not a positive number.`);
    }

    if (value.includes('.')) {
      throw new Error(
        `Invalid "value": ${value} number must be denominated in wei.`,
      );
    }
    const intValue = parseInt(transaction.value, 10);
    const isValid =
      Number.isFinite(intValue) &&
      !Number.isNaN(intValue) &&
      !isNaN(Number(value)) &&
      Number.isSafeInteger(intValue);
    if (!isValid) {
      throw new Error(
        `Invalid "value": ${value} number must be a valid number.`,
      );
    }
  }
}

/**
 * Checks if a transaction is EIP-1559 by checking for the existence of
 * maxFeePerGas and maxPriorityFeePerGas within its parameters.
 *
 * @param transaction - Transaction object to add.
 * @returns Boolean that is true if the transaction is EIP-1559 (has maxFeePerGas and maxPriorityFeePerGas), otherwise returns false.
 */
export const isEIP1559Transaction = (transaction: Transaction): boolean => {
  const hasOwnProp = (obj: Transaction, key: string) =>
    Object.prototype.hasOwnProperty.call(obj, key);
  return (
    hasOwnProp(transaction, 'maxFeePerGas') &&
    hasOwnProp(transaction, 'maxPriorityFeePerGas')
  );
};

export const validateGasValues = (
  gasValues: GasPriceValue | FeeMarketEIP1559Values,
) => {
  Object.keys(gasValues).forEach((key) => {
    const value = (gasValues as any)[key];
    if (typeof value !== 'string' || !isHexString(value)) {
      throw new TypeError(
        `expected hex string for ${key} but received: ${value}`,
      );
    }
  });
};

export const isFeeMarketEIP1559Values = (
  gasValues?: GasPriceValue | FeeMarketEIP1559Values,
): gasValues is FeeMarketEIP1559Values =>
  (gasValues as FeeMarketEIP1559Values)?.maxFeePerGas !== undefined ||
  (gasValues as FeeMarketEIP1559Values)?.maxPriorityFeePerGas !== undefined;

export const isGasPriceValue = (
  gasValues?: GasPriceValue | FeeMarketEIP1559Values,
): gasValues is GasPriceValue =>
  (gasValues as GasPriceValue)?.gasPrice !== undefined;

export const getIncreasedPriceHex = (value: number, rate: number): string =>
  addHexPrefix(`${parseInt(`${value * rate}`, 10).toString(16)}`);

export const getIncreasedPriceFromExisting = (
  value: string | undefined,
  rate: number,
): string => {
  return getIncreasedPriceHex(convertHexToDecimal(value), rate);
};

/**
 * Validates that the proposed value is greater than or equal to the minimum value.
 *
 * @param proposed - The proposed value.
 * @param min - The minimum value.
 * @returns The proposed value.
 * @throws Will throw if the proposed value is too low.
 */
export function validateMinimumIncrease(proposed: string, min: string) {
  const proposedDecimal = convertHexToDecimal(proposed);
  const minDecimal = convertHexToDecimal(min);
  if (proposedDecimal >= minDecimal) {
    return proposed;
  }
  const errorMsg = `The proposed value: ${proposedDecimal} should meet or exceed the minimum value: ${minDecimal}`;
  throw new Error(errorMsg);
}

/**
 * Helper function to filter and format transactions for the nonce tracker.
 *
 * @param fromAddress - Address of the account from which the transactions to filter from are sent.
 * @param transactionStatus - Status of the transactions for which to filter.
 * @param transactions - Array of transactionMeta objects that have been prefiltered.
 * @returns Array of transactions formatted for the nonce tracker.
 */
export function getAndFormatTransactionsForNonceTracker(
  fromAddress: string,
  transactionStatus: TransactionStatus,
  transactions: TransactionMeta[],
): NonceTrackerTransaction[] {
  return transactions
    .filter(
      ({ status, transaction: { from } }) =>
        status === transactionStatus &&
        from.toLowerCase() === fromAddress.toLowerCase(),
    )
    .map(({ status, transaction: { from, gas, value, nonce } }) => {
      // the only value we care about is the nonce
      // but we need to return the other values to satisfy the type
      // TODO: refactor nonceTracker to not require this
      return {
        status,
        history: [{}],
        txParams: {
          from: from ?? '',
          gas: gas ?? '',
          value: value ?? '',
          nonce: nonce ?? '',
        },
      };
    });
}

/**
 * Checks whether a given transaction matches the specified network or chain ID.
 * This function is used to determine if a transaction is relevant to the current network or chain.
 *
 * @param transaction - The transaction metadata to check.
 * @param chainId - The chain ID of the current network.
 * @param networkId - The network ID of the current network.
 * @returns A boolean value indicating whether the transaction matches the current network or chain ID.
 */
export function transactionMatchesNetwork(
  transaction: TransactionMeta,
  chainId: Hex,
  networkId: string | null,
) {
  if (transaction.chainId) {
    return transaction.chainId === chainId;
  }

  if (transaction.networkID) {
    return transaction.networkID === networkId;
  }
  return false;
}

/**
 * Validates that a transaction is unapproved.
 * Throws if the transaction is not unapproved.
 *
 * @param transactionMeta - The transaction metadata to check.
 * @param fnName - The name of the function calling this helper.
 */
export function validateIfTransactionUnapproved(
  transactionMeta: TransactionMeta | undefined,
  fnName: string,
) {
  if (transactionMeta?.status !== TransactionStatus.unapproved) {
    throw new Error(
      `Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${transactionMeta?.status}`,
    );
  }
}

/**
 * Determines the type of the transaction by analyzing the txParams.
 * It will never return TRANSACTION_TYPE_CANCEL or TRANSACTION_TYPE_RETRY as these
 * represent specific events that we control from the extension and are added manually
 * at transaction creation.
 *
 * @param txParams - Parameters for the transaction.
 * @param ethQuery - EthQuery instance.
 * @returns A object with the transaction type and the contract code response in Hex.
 */
export async function determineTransactionType(
  txParams: Transaction,
  ethQuery: EthQuery,
): Promise<InferTransactionTypeResult> {
  let result;
  let contractCode;
  const { data, to } = txParams;
  const name = parseStandardTokenTransactionData(data)?.name;

  if (data && !to) {
    result = TransactionType.deployContract;
  } else {
    const { contractCode: resultCode, isContractAddress } =
      await readAddressAsContract(ethQuery, to);

    contractCode = resultCode;

    if (isContractAddress) {
      const hasValue = txParams.value && Number(txParams.value) !== 0;

      const tokenMethodName = [
        TransactionType.tokenMethodApprove,
        TransactionType.tokenMethodSetApprovalForAll,
        TransactionType.tokenMethodTransfer,
        TransactionType.tokenMethodTransferFrom,
        TransactionType.tokenMethodSafeTransferFrom,
      ].find((methodName) => methodName.toLowerCase() === name?.toLowerCase());

      result =
        data && tokenMethodName && !hasValue
          ? tokenMethodName
          : TransactionType.contractInteraction;
    } else {
      result = TransactionType.simpleSend;
    }
  }

  return { type: result, getCodeResponse: contractCode };
}

/**
 * Attempts to decode transaction data using ABIs for three different token standards: ERC20, ERC721, ERC1155.
 * The data will decode correctly if the transaction is an interaction with a contract that matches one of these
 * contract standards
 *
 * @param data - Encoded transaction data.
 * @returns A representation of an ethereum contract call.
 */
export function parseStandardTokenTransactionData(
  data?: string,
): TransactionDescription | undefined {
  if (!data) {
    return undefined;
  }

  try {
    return erc20Interface.parseTransaction({ data });
  } catch {
    // ignore and next try to parse with erc721 ABI
  }

  try {
    return erc721Interface.parseTransaction({ data });
  } catch {
    // ignore and next try to parse with erc1155 ABI
  }

  try {
    return erc1155Interface.parseTransaction({ data });
  } catch {
    // ignore and return undefined
  }

  return undefined;
}

/**
 * Reads an Ethereum address and determines if it is a contract address.
 *
 * @param ethQuery - The Ethereum query object used to interact with the Ethereum blockchain.
 * @param address - The Ethereum address.
 * @returns An object containing the contract code and a boolean indicating if it is a contract address.
 */
export async function readAddressAsContract(
  ethQuery: EthQuery,
  address?: string,
): Promise<{
  contractCode: string | null;
  isContractAddress: boolean;
}> {
  let contractCode;
  try {
    contractCode = await query(ethQuery, 'getCode', [address]);
  } catch (e) {
    contractCode = null;
  }

  const isContractAddress = contractCode
    ? contractCode !== '0x' && contractCode !== '0x0'
    : false;
  return { contractCode, isContractAddress };
}
