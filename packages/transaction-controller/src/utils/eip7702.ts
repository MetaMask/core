import { defaultAbiCoder } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { toHex } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import { createModuleLogger, add0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { ABI_IERC7821 } from '../constants';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  BatchTransactionParams,
  Authorization,
  AuthorizationList,
  TransactionMeta,
} from '../types';
import {
  getEIP7702ContractAddresses,
  getEIP7702SupportedChains,
} from './feature-flags';
import { rpcRequest } from './provider';

export const DELEGATION_PREFIX = '0xef0100';
export const BATCH_FUNCTION_NAME = 'execute';
export const CALLS_SIGNATURE = '(address,uint256,bytes)[]';
export const ERROR_MESSGE_PUBLIC_KEY = 'EIP-7702 public key not specified';

/**
 * ERC-7579 ModeCode encoding for the ERC-7821 `execute` function.
 *
 * Layout: | CallType (1 byte) | ExecType (1 byte) | Unused (4 bytes) | ModeSelector (4 bytes) | ModePayload (22 bytes) |
 *
 * - CallType 0x01 = batch
 * - ExecType 0x00 = default (revert on failure)
 * - ExecType 0x01 = try (skip on failure)
 */
const ERC7579_CALL_TYPE_BATCH = '01';
const ERC7579_EXEC_TYPE_DEFAULT = '00';
const ERC7579_EXEC_TYPE_TRY = '01';

const log = createModuleLogger(projectLogger, 'eip-7702');

/**
 * Determine if a chain supports EIP-7702 using LaunchDarkly feature flag.
 *
 * @param chainId - Hexadecimal ID of the chain.
 * @param messenger - Messenger instance.
 * @returns True if the chain supports EIP-7702.
 */
export function doesChainSupportEIP7702(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
): boolean {
  const supportedChains = getEIP7702SupportedChains(messenger);

  return supportedChains.some(
    (supportedChainId) =>
      supportedChainId.toLowerCase() === chainId.toLowerCase(),
  );
}

/**
 * Retrieve the delegation address for an account.
 *
 * @param address - The address to check.
 * @param messenger - The TransactionController messenger.
 * @param networkClientId - The network client ID to use.
 * @returns  The delegation address if it exists.
 */
export async function getDelegationAddress(
  address: Hex,
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
): Promise<Hex | undefined> {
  const code = (await rpcRequest({
    messenger,
    networkClientId,
    method: 'eth_getCode',
    params: [address, 'latest'],
  })) as string;
  const normalizedCode = add0x(code?.toLowerCase?.() ?? '');

  const hasDelegation =
    code?.length === 48 && normalizedCode.startsWith(DELEGATION_PREFIX);

  return hasDelegation
    ? add0x(normalizedCode.slice(DELEGATION_PREFIX.length))
    : undefined;
}

/**
 * Determine if an account has been upgraded to a supported EIP-7702 contract.
 *
 * @param address - The EOA address to check.
 * @param chainId - The chain ID.
 * @param publicKey - Public key used to validate EIP-7702 contract signatures in feature flags.
 * @param messenger - The messenger instance.
 * @param networkClientId - The network client ID to use.
 * @returns An object with the results of the check.
 */
export async function isAccountUpgradedToEIP7702(
  address: Hex,
  chainId: Hex,
  publicKey: Hex,
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
): Promise<{
  delegationAddress: Hex | undefined;
  isSupported: boolean;
}> {
  const contractAddresses = getEIP7702ContractAddresses(
    chainId,
    messenger,
    publicKey,
  );

  const delegationAddress = await getDelegationAddress(
    address,
    messenger,
    networkClientId,
  );

  const isSupported = Boolean(
    delegationAddress &&
    contractAddresses.some(
      (contract) => contract.toLowerCase() === delegationAddress.toLowerCase(),
    ),
  );

  return {
    delegationAddress,
    isSupported,
  };
}

/**
 * Generate an EIP-7702 batch transaction.
 *
 * @param from - The sender address.
 * @param transactions - The transactions to batch.
 * @param options - Options bag.
 * @param options.atomic - Whether the batch should be atomic. Defaults to `true`.
 * When `true`, uses ERC-7579 ExecType `default` and all calls revert together.
 * When `false`, uses ERC-7579 ExecType `try` and individual calls can fail independently.
 * @returns The batch transaction.
 */
export function generateEIP7702BatchTransaction(
  from: Hex,
  transactions: BatchTransactionParams[],
  options?: { atomic?: boolean },
): BatchTransactionParams {
  const atomic = options?.atomic ?? true;
  const erc7821Contract = Contract.getInterface(ABI_IERC7821);

  const calls = transactions.map((transaction) => {
    const { data, to, value } = transaction;

    return [
      to ?? '0x0000000000000000000000000000000000000000',
      value ?? '0x0',
      data ?? '0x',
    ];
  });

  const execType = atomic ? ERC7579_EXEC_TYPE_DEFAULT : ERC7579_EXEC_TYPE_TRY;
  const mode = `0x${ERC7579_CALL_TYPE_BATCH}${execType}`.padEnd(66, '0');

  const callData = defaultAbiCoder.encode([CALLS_SIGNATURE], [calls]);

  const data = erc7821Contract.encodeFunctionData(BATCH_FUNCTION_NAME, [
    mode,
    callData,
  ]) as Hex;

  log('Transaction data', data);

  return {
    data,
    to: from,
  };
}

/**
 * Sign an authorization list.
 *
 * @param options - Options bag.
 * @param options.authorizationList - The authorization list to sign.
 * @param options.messenger - The controller messenger.
 * @param options.transactionMeta - The transaction metadata.
 * @returns The signed authorization list.
 */
export async function signAuthorizationList({
  authorizationList,
  messenger,
  transactionMeta,
}: {
  authorizationList?: AuthorizationList;
  messenger: TransactionControllerMessenger;
  transactionMeta: TransactionMeta;
}): Promise<Required<AuthorizationList | undefined>> {
  if (!authorizationList) {
    return undefined;
  }

  const signedAuthorizationList: Required<AuthorizationList> = [];
  let index = 0;

  for (const authorization of authorizationList) {
    const signedAuthorization = await signAuthorization(
      authorization,
      transactionMeta,
      messenger,
      index,
    );

    signedAuthorizationList.push(signedAuthorization);
    index += 1;
  }

  return signedAuthorizationList;
}

/**
 * Signs an authorization.
 *
 * @param authorization - The authorization to sign.
 * @param transactionMeta - The associated transaction metadata.
 * @param messenger - The messenger to use for signing.
 * @param index - The index of the authorization in the list.
 * @returns The signed authorization.
 */
async function signAuthorization(
  authorization: Authorization,
  transactionMeta: TransactionMeta,
  messenger: TransactionControllerMessenger,
  index: number,
): Promise<Required<Authorization>> {
  const finalAuthorization = prepareAuthorization(
    authorization,
    transactionMeta,
    index,
  );

  const { txParams } = transactionMeta;
  const { from } = txParams;
  const { address, chainId, nonce } = finalAuthorization;
  const chainIdDecimal = parseInt(chainId, 16);
  const nonceDecimal = parseInt(nonce, 16);

  const signature = await messenger.call(
    'KeyringController:signEip7702Authorization',
    {
      chainId: chainIdDecimal,
      contractAddress: address,
      from,
      nonce: nonceDecimal,
    },
  );

  // eslint-disable-next-line id-length
  const r = signature.slice(0, 66) as Hex;
  // eslint-disable-next-line id-length
  const s = add0x(signature.slice(66, 130));
  // eslint-disable-next-line id-length
  const v = parseInt(signature.slice(130, 132), 16);
  const yParity = toHex(v - 27 === 0 ? 0 : 1);

  const result: Required<Authorization> = {
    address,
    chainId,
    nonce,
    r,
    s,
    yParity,
  };

  log('Signed authorization', result);

  return result;
}

/**
 * Prepares an authorization for signing by populating the chainId and nonce.
 *
 * @param authorization - The authorization to prepare.
 * @param transactionMeta - The associated transaction metadata.
 * @param index - The index of the authorization in the list.
 * @returns The prepared authorization.
 */
function prepareAuthorization(
  authorization: Authorization,
  transactionMeta: TransactionMeta,
  index: number,
): Authorization & { chainId: Hex; nonce: Hex } {
  const { chainId: existingChainId, nonce: existingNonce } = authorization;
  const { txParams, chainId: transactionChainId } = transactionMeta;
  const { nonce: transactionNonce } = txParams;

  const chainId = existingChainId ?? transactionChainId;
  let nonce = existingNonce;

  nonce ??= toHex(parseInt(transactionNonce as string, 16) + 1 + index);

  const result = {
    ...authorization,
    chainId,
    nonce,
  };

  log('Prepared authorization', result);

  return result;
}
