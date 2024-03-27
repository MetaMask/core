import type { TransactionDescription } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import {
  abiERC721,
  abiERC20,
  abiERC1155,
  abiFiatTokenV2,
} from '@metamask/metamask-eth-abis';

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
  ethQuery: EthQuery,
): Promise<InferTransactionTypeResult> {
  const { data, to } = txParams;

  if (data && !to) {
    return { type: TransactionType.deployContract, getCodeResponse: undefined };
  }

  const { contractCode: getCodeResponse, isContractAddress } =
    await readAddressAsContract(ethQuery, to);

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

  const name = parseStandardTokenTransactionData(data)?.name;

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
function parseStandardTokenTransactionData(
  data?: string,
): TransactionDescription | undefined {
  if (!data) {
    return undefined;
  }

  try {
    return ERC20Interface.parseTransaction({ data });
  } catch {
    // ignore and next try to parse with erc721 ABI
  }

  try {
    return ERC721Interface.parseTransaction({ data });
  } catch {
    // ignore and next try to parse with erc1155 ABI
  }

  try {
    return ERC1155Interface.parseTransaction({ data });
  } catch {
    // ignore and return undefined
  }

  try {
    return USDCInterface.parseTransaction({ data });
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
  } catch (e) {
    contractCode = null;
  }

  const isContractAddress = contractCode
    ? contractCode !== '0x' && contractCode !== '0x0'
    : false;
  return { contractCode, isContractAddress };
}
