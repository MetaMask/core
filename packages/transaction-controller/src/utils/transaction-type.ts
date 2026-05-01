import { Interface } from '@ethersproject/abi';
import type { TransactionDescription } from '@ethersproject/abi';
import {
  abiERC721,
  abiERC20,
  abiERC1155,
  abiFiatTokenV2,
} from '@metamask/metamask-eth-abis';
import type { NetworkClientId } from '@metamask/network-controller';

import type { TransactionControllerMessenger } from '../TransactionController';
import type { InferTransactionTypeResult, TransactionParams } from '../types';
import { TransactionType } from '../types';
import { DELEGATION_PREFIX } from './eip7702';
import { rpcRequest } from './provider';

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
 * @param options - Optional messenger and network client ID to query the network.
 * @param options.messenger - The TransactionController messenger.
 * @param options.networkClientId - The network client ID to use.
 * @returns A object with the transaction type and the contract code response in Hex.
 */
export async function determineTransactionType(
  txParams: TransactionParams,
  options?: {
    messenger: TransactionControllerMessenger;
    networkClientId: NetworkClientId;
  },
): Promise<InferTransactionTypeResult> {
  const { data, to } = txParams;

  if (data && !to) {
    return { type: TransactionType.deployContract, getCodeResponse: undefined };
  }

  let getCodeResponse;
  let isContractAddress = Boolean(data?.length);

  if (options) {
    const { messenger, networkClientId } = options;
    const response = await readAddressAsContract(
      messenger,
      networkClientId,
      to,
    );

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
  ].find((methodName) => methodName.toLowerCase() === name.toLowerCase());

  if (tokenMethodName) {
    return { type: tokenMethodName, getCodeResponse };
  }

  return contractInteractionResult;
}

/**
 * Parses transaction data using ABIs for three different token standards: ERC20, ERC721, ERC1155 and USDC.
 * The data will decode correctly if the transaction is an interaction with a contract that matches one of these
 * contract standards
 *
 * @param data - Encoded transaction data.
 * @param options - Options bag.
 * @param options.getMethodName - Whether to get the method name.
 * @returns A representation of an ethereum contract call.
 */
export function decodeTransactionData(
  data: string,
  options?: {
    getMethodName?: boolean;
  },
): undefined | TransactionDescription | string {
  if (!data || data.length < 10) {
    return undefined;
  }

  const fourByte = data.substring(0, 10).toLowerCase();

  for (const iface of [
    ERC20Interface,
    ERC721Interface,
    ERC1155Interface,
    USDCInterface,
  ]) {
    try {
      if (options?.getMethodName) {
        return iface.getFunction(fourByte)?.name;
      }
      return iface.parseTransaction({ data });
    } catch {
      // Intentionally empty
    }
  }

  return undefined;
}

/**
 * Attempts to get the method name from the given transaction data.
 *
 * @param data - Encoded transaction data.
 * @returns The method name.
 */
function getMethodName(data?: string): string | undefined {
  return decodeTransactionData(data as string, {
    getMethodName: true,
  }) as string | undefined;
}

/**
 * Reads an Ethereum address and determines if it is a contract address.
 *
 * @param messenger - The TransactionController messenger.
 * @param networkClientId - The network client ID to use.
 * @param address - The Ethereum address.
 * @returns An object containing the contract code and a boolean indicating if it is a contract address.
 */
async function readAddressAsContract(
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
  address?: string,
): Promise<{
  contractCode: string | null;
  isContractAddress: boolean;
}> {
  let contractCode;
  try {
    contractCode = (await rpcRequest({
      messenger,
      networkClientId,
      method: 'eth_getCode',
      params: [address as string, 'latest'],
    })) as string;
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
