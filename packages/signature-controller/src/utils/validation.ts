import { ORIGIN_METAMASK } from '@metamask/approval-controller';
import { isValidHexAddress } from '@metamask/controller-utils';
import {
  TYPED_MESSAGE_SCHEMA,
  typedSignatureHash,
} from '@metamask/eth-sig-util';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Json } from '@metamask/utils';
import { type Hex } from '@metamask/utils';
import { validate } from 'jsonschema';

import type {
  MessageParamsPersonal,
  MessageParamsTyped,
  MessageParamsTypedData,
  OriginalRequest,
} from '../types';

export const PRIMARY_TYPE_DELEGATION = 'Delegation';
export const DELEGATOR_FIELD = 'delegator';

/**
 * Validate a personal signature request.
 *
 * @param messageData - The message data to validate.
 */
export function validatePersonalSignatureRequest(
  messageData: MessageParamsPersonal,
) {
  const { from, data } = messageData;

  validateAddress(from, 'from');

  if (!data || typeof data !== 'string') {
    throw new Error(`Invalid message "data": ${data} must be a valid string.`);
  }
}

/**
 * Validate a typed signature request.
 *
 * @param options - Options bag.
 * @param options.currentChainId - The current chain ID.
 * @param options.internalAccounts - The addresses of all internal accounts.
 * @param options.messageData - The message data to validate.
 * @param options.request - The original request.
 * @param options.version - The version of the typed signature request.
 */
export function validateTypedSignatureRequest({
  currentChainId,
  internalAccounts,
  messageData,
  request,
  version,
}: {
  currentChainId: Hex | undefined;
  internalAccounts: Hex[];
  messageData: MessageParamsTyped;
  request: OriginalRequest;
  version: SignTypedDataVersion;
}) {
  validateAddress(messageData.from, 'from');

  if (version === SignTypedDataVersion.V1) {
    validateTypedSignatureRequestV1(messageData);
  } else {
    validateTypedSignatureRequestV3V4({
      currentChainId,
      internalAccounts,
      messageData,
      request,
    });
  }
}

/**
 * Validate a V1 typed signature request.
 *
 * @param messageData - The message data to validate.
 */
function validateTypedSignatureRequestV1(messageData: MessageParamsTyped) {
  if (!messageData.data || !Array.isArray(messageData.data)) {
    throw new Error(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `Invalid message "data": ${messageData.data} must be a valid array.`,
    );
  }

  try {
    // typedSignatureHash will throw if the data is invalid.
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typedSignatureHash(messageData.data as any);
  } catch (e) {
    throw new Error(`Expected EIP712 typed data.`);
  }
}

/**
 * Validate a V3 or V4 typed signature request.
 *
 * @param options - Options bag.
 * @param options.currentChainId - The current chain ID.
 * @param options.internalAccounts - The addresses of all internal accounts.
 * @param options.messageData - The message data to validate.
 * @param options.request - The original request.
 */
function validateTypedSignatureRequestV3V4({
  currentChainId,
  internalAccounts,
  messageData,
  request,
}: {
  currentChainId: Hex | undefined;
  internalAccounts: Hex[];
  messageData: MessageParamsTyped;
  request: OriginalRequest;
}) {
  if (
    !messageData.data ||
    Array.isArray(messageData.data) ||
    (typeof messageData.data !== 'object' &&
      typeof messageData.data !== 'string')
  ) {
    throw new Error(
      `Invalid message "data": Must be a valid string or object.`,
    );
  }

  let data;
  if (typeof messageData.data === 'object') {
    data = messageData.data;
  } else {
    try {
      data = JSON.parse(messageData.data);
    } catch (e) {
      throw new Error('Data must be passed as a valid JSON string.');
    }
  }

  const validation = validate(data, TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw new Error(
      'Data must conform to EIP-712 schema. See https://git.io/fNtcx.',
    );
  }

  if (!currentChainId) {
    throw new Error('Current chainId cannot be null or undefined.');
  }

  let { chainId } = data.domain;
  if (chainId) {
    if (typeof chainId === 'string') {
      chainId = parseInt(chainId, chainId.startsWith('0x') ? 16 : 10);
    }

    const activeChainId = parseInt(currentChainId, 16);
    if (Number.isNaN(activeChainId)) {
      throw new Error(
        `Cannot sign messages for chainId "${
          chainId as string
        }", because MetaMask is switching networks.`,
      );
    }

    if (chainId !== activeChainId) {
      throw new Error(
        `Provided chainId "${
          chainId as string
        }" must match the active chainId "${activeChainId}"`,
      );
    }
  }

  const origin = request?.origin ?? messageData?.origin;

  validateVerifyingContract({
    data,
    internalAccounts,
    origin,
  });

  validateDelegation({
    data,
    internalAccounts,
    origin,
  });
}

/**
 * Validate an Ethereum address.
 *
 * @param address - The address to validate.
 * @param propertyName - The name of the property source to use in the error message.
 */
function validateAddress(address: string, propertyName: string) {
  if (!address || typeof address !== 'string' || !isValidHexAddress(address)) {
    throw new Error(
      `Invalid "${propertyName}" address: ${address} must be a valid string.`,
    );
  }
}

/**
 * Validate the verifying contract from a typed signature request.
 *
 * @param options - Options bag.
 * @param options.data - The typed data to validate.
 * @param options.internalAccounts - The internal accounts.
 * @param options.origin - The origin of the request.
 */
function validateVerifyingContract({
  data,
  internalAccounts,
  origin,
}: {
  data: MessageParamsTypedData;
  internalAccounts: Hex[];
  origin: string | undefined;
}) {
  const verifyingContract = data?.domain?.verifyingContract;
  const isExternal = origin && origin !== ORIGIN_METAMASK;

  if (
    verifyingContract &&
    typeof verifyingContract === 'string' &&
    isExternal &&
    internalAccounts.some(
      (internalAccount) =>
        internalAccount.toLowerCase() === verifyingContract.toLowerCase(),
    )
  ) {
    throw new Error(
      `External signature requests cannot use internal accounts as the verifying contract.`,
    );
  }
}

/**
 * Validate a delegation signature request.
 *
 * @param options - Options bag.
 * @param options.data - The typed data to validate.
 * @param options.internalAccounts - The internal accounts.
 * @param options.origin - The origin of the request.
 */
function validateDelegation({
  data,
  internalAccounts,
  origin,
}: {
  data: MessageParamsTypedData;
  internalAccounts: Hex[];
  origin: string | undefined;
}) {
  const { primaryType } = data;

  if (primaryType !== PRIMARY_TYPE_DELEGATION) {
    return;
  }

  const isExternal = origin && origin !== ORIGIN_METAMASK;
  const delegator = (data.message as Record<string, Json>)?.[
    DELEGATOR_FIELD
  ] as Hex;

  if (
    isExternal &&
    internalAccounts.some(
      (internalAccount) =>
        internalAccount.toLowerCase() === delegator?.toLowerCase(),
    )
  ) {
    throw new Error(
      `External signature requests cannot sign delegations for internal accounts.`,
    );
  }
}
