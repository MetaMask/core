import { Interface } from '@ethersproject/abi';
import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import {
  abiERC721,
  abiERC20,
  abiERC1155,
  abiFiatTokenV2,
} from '@metamask/metamask-eth-abis';

import { DELEGATION_PREFIX } from './eip7702';
import type { InferTransactionTypeResult, TransactionParams } from '../types';
import { TransactionType } from '../types';

export const ESTIMATE_GAS_ERROR = 'eth_estimateGas rpc method error';

const ERC20Interface = new Interface(abiERC20);
const ERC721Interface = new Interface(abiERC721);
const ERC1155Interface = new Interface(abiERC1155);
const USDCInterface = new Interface(abiFiatTokenV2);

/**
 * Determines the type of the transaction by analyzing the txParams.
 * It will never return TRANSACTION_TYPE_CANCEL or TRANSACTION_TYPE_RETRY as these
 * represent specific events that we specify manually at transaction creation.
 *
 * @param txParams - Parameters for the transaction.
 * @param ethQuery - EthQuery instance.
 * @returns A object with the transaction type and the contract code response in Hex.
 */
export async function determineTransactionType(
  txParams: TransactionParams,
  ethQuery?: EthQuery,
): Promise<InferTransactionTypeResult> {
  const { data, to } = txParams;

  if (data && !to) {
    return { type: TransactionType.deployContract, getCodeResponse: undefined };
  }

  let getCodeResponse;
  let isContractAddress = Boolean(data?.length);

  if (ethQuery) {
    const response = await readAddressAsContract(ethQuery, to);

    getCodeResponse = response.contractCode;
    isContractAddress = response.isContractAddress;
  }

  if (!isContractAddress) {
    return { type: TransactionType.simpleSend, getCodeResponse };
  }

  const hasValue = Number(txParams.value ?? '0') !== 0;

  const contractInteractionResult = {
    type: TransactionType.contractInteraction,
    getCodeResponse,
  };

  if (!data || hasValue) {
    return contractInteractionResult;
  }

  const name = getMethodName(data);

  if (!name) {
    return contractInteractionResult;
  }

  const tokenMethodName = [
    TransactionType.tokenMethodApprove,
    TransactionType.tokenMethodSetApprovalForAll,
    TransactionType.tokenMethodTransfer,
    TransactionType.tokenMethodTransferFrom,
    TransactionType.tokenMethodSafeTransferFrom,
    TransactionType.tokenMethodIncreaseAllowance,
  ].find(
    (methodName) => methodName.toLowerCase() === (name as string).toLowerCase(),
  );

  if (tokenMethodName) {
    return { type: tokenMethodName, getCodeResponse };
  }

  return contractInteractionResult;
}

/**
 * Attempts to decode transaction data using ABIs for three different token standards: ERC20, ERC721, ERC1155.
 * The data will decode correctly if the transaction is an interaction with a contract that matches one of these
 * contract standards
 *
 * @param data - Encoded transaction data.
 * @returns A representation of an ethereum contract call.
 */
function getMethodName(data?: string): string | undefined {
  if (!data || data.length < 10) {
    return undefined;
  }

  const fourByte = data.substring(0, 10);

  for (const interfaceInstance of [
    ERC20Interface,
    ERC721Interface,
    ERC1155Interface,
    USDCInterface,
  ]) {
    try {
      return interfaceInstance.getFunction(fourByte).name;
    } catch {
      // Intentionally empty
    }
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
async function readAddressAsContract(
  ethQuery: EthQuery,
  address?: string,
): Promise<{
  contractCode: string | null;
  isContractAddress: boolean;
}> {
  let contractCode;
  try {
    contractCode = await query(ethQuery, 'getCode', [address]);
    // Not used
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    contractCode = null;
  }

  const isContractAddress = contractCode
    ? contractCode !== '0x' &&
      contractCode !== '0x0' &&
      !contractCode.startsWith(DELEGATION_PREFIX)
    : false;
  return { contractCode, isContractAddress };
}
