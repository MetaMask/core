import { ORIGIN_METAMASK } from '@metamask/approval-controller';
import { isValidHexAddress } from '@metamask/controller-utils';
import {
  TYPED_MESSAGE_SCHEMA,
  typedSignatureHash,
} from '@metamask/eth-sig-util';
import type { MessageTypeProperty } from '@metamask/eth-sig-util';
import type { DecodedPermission } from '@metamask/gator-permissions-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { hasProperty } from '@metamask/utils';
import type { Hex, Json } from '@metamask/utils';
import { validate } from 'jsonschema';

import type {
  MessageParamsPersonal,
  MessageParamsTyped,
  MessageParamsTypedData,
  OriginalRequest,
} from '../types.js';
import { isDelegationRequest } from './delegations.js';

export const PRIMARY_TYPE_DELEGATION = 'Delegation';
export const DELEGATOR_FIELD = 'delegator';

const EIP712_DOMAIN_TYPE = 'EIP712Domain';
const VERIFYING_CONTRACT_PATH = 'domain.verifyingContract';

/**
 * A `0x`-prefixed, 20-byte hex address in any letter case.
 */
const CANONICAL_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/u;

/**
 * Non-address `verifyingContract` values that are accepted by the wallet
 * middleware for compatibility with some Cosmos EVM adapters.
 */
const ALLOWED_NON_ADDRESS_VERIFYING_CONTRACTS: Json[] = ['', 'cosmos'];

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
 * @param options.decodedPermission - The decoded permission.
 */
export function validateTypedSignatureRequest({
  currentChainId,
  internalAccounts,
  messageData,
  request,
  version,
  decodedPermission,
}: {
  currentChainId: Hex | undefined;
  internalAccounts: Hex[];
  messageData: MessageParamsTyped;
  request: OriginalRequest;
  version: SignTypedDataVersion;
  decodedPermission?: DecodedPermission;
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
      decodedPermission,
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
 * @param options.decodedPermission - The decoded permission.
 */
function validateTypedSignatureRequestV3V4({
  currentChainId,
  internalAccounts,
  messageData,
  request,
  decodedPermission,
}: {
  currentChainId: Hex | undefined;
  internalAccounts: Hex[];
  messageData: MessageParamsTyped;
  request: OriginalRequest;
  decodedPermission?: DecodedPermission;
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

  let data: MessageParamsTypedData;
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

  let chainId = data.domain.chainId as number | string | undefined;
  if (chainId) {
    if (typeof chainId === 'string') {
      chainId = parseInt(chainId, chainId.startsWith('0x') ? 16 : 10);
    }

    const activeChainId = parseInt(currentChainId, 16);
    if (Number.isNaN(activeChainId)) {
      throw new Error(
        `Cannot sign messages for chainId "${chainId}", because MetaMask is switching networks.`,
      );
    }

    if (chainId !== activeChainId) {
      throw new Error(
        `Provided chainId "${chainId}" must match the active chainId "${activeChainId}"`,
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
    decodedPermission,
  });

  validateAddressFields({
    data,
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
 * @param options.decodedPermission - The decoded permission.
 */
function validateDelegation({
  data,
  internalAccounts,
  origin,
  decodedPermission,
}: {
  data: MessageParamsTypedData;
  internalAccounts: Hex[];
  origin: string | undefined;
  decodedPermission?: DecodedPermission;
}): void {
  if (!isDelegationRequest(data)) {
    return;
  }

  const hasDecodedPermission = decodedPermission !== undefined;
  const isOriginExternal = origin && origin !== ORIGIN_METAMASK;

  if (hasDecodedPermission || !isOriginExternal) {
    return;
  }

  const delegator = (data.message as Record<string, Json>)[DELEGATOR_FIELD];

  if (!isCanonicalAddress(delegator)) {
    throw new Error(
      `External signature requests must specify the delegator as a hex address.`,
    );
  }

  const isSignerInternal = internalAccounts.some(
    (internalAccount) =>
      internalAccount.toLowerCase() === delegator.toLowerCase(),
  );

  if (isSignerInternal) {
    throw new Error(
      `External signature requests cannot sign delegations for internal accounts.`,
    );
  }
}

/**
 * Validate that every `address` field in the domain and message of an
 * external typed signature request is a `0x`-prefixed, 20-byte hex string,
 * so validations compare the same address that is signed.
 *
 * @param options - Options bag.
 * @param options.data - The typed data to validate.
 * @param options.origin - The origin of the request.
 */
function validateAddressFields({
  data,
  origin,
}: {
  data: MessageParamsTypedData;
  origin: string | undefined;
}): void {
  const isOriginExternal = origin && origin !== ORIGIN_METAMASK;

  if (!isOriginExternal) {
    return;
  }

  const types = data.types as Record<string, MessageTypeProperty[]>;

  validateAddressFieldsOfType({
    type: EIP712_DOMAIN_TYPE,
    value: data.domain,
    types,
    path: 'domain',
  });

  validateAddressFieldsOfType({
    type: data.primaryType,
    value: data.message,
    types,
    path: 'message',
  });
}

/**
 * Recursively validate the `address` values of a typed data value, following
 * the same type resolution that is used to encode the value for signing.
 *
 * @param options - Options bag.
 * @param options.type - The EIP-712 type of the value.
 * @param options.value - The value to validate.
 * @param options.types - The EIP-712 type definitions.
 * @param options.path - The path of the value, used in the error message.
 */
function validateAddressFieldsOfType({
  type,
  value,
  types,
  path,
}: {
  type: string;
  value: Json | undefined;
  types: Record<string, MessageTypeProperty[]>;
  path: string;
}): void {
  // Missing and null values are not encoded as addresses.
  if (value === undefined || value === null) {
    return;
  }

  if (hasProperty(types, type)) {
    for (const field of types[type]) {
      validateAddressFieldsOfType({
        type: field.type,
        value: (value as Record<string, Json>)[field.name],
        types,
        path: `${path}.${field.name}`,
      });
    }
    return;
  }

  if (type === 'address') {
    const isAllowedVerifyingContract =
      path === VERIFYING_CONTRACT_PATH &&
      ALLOWED_NON_ADDRESS_VERIFYING_CONTRACTS.includes(value);

    if (!isCanonicalAddress(value) && !isAllowedVerifyingContract) {
      throw new Error(
        `External signature requests must specify "${path}" as a hex address.`,
      );
    }
    return;
  }

  if (type.endsWith(']') && Array.isArray(value)) {
    const itemType = type.slice(0, type.lastIndexOf('['));

    value.forEach((item, index) =>
      validateAddressFieldsOfType({
        type: itemType,
        value: item,
        types,
        path: `${path}[${index}]`,
      }),
    );
  }
}

/**
 * Check whether a value is a `0x`-prefixed, 20-byte hex address.
 *
 * @param value - The value to check.
 * @returns True if the value is a `0x`-prefixed, 20-byte hex address.
 */
function isCanonicalAddress(value: Json | undefined): value is Hex {
  return typeof value === 'string' && CANONICAL_ADDRESS_REGEX.test(value);
}
