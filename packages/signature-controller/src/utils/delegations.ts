import type {
  DecodedPermission,
  DelegationDetails,
} from '@metamask/gator-permissions-controller';
import { isHexAddress, isStrictHexString } from '@metamask/utils';

import type { SignatureControllerMessenger } from '../SignatureController';
import type {
  MessageParamsTypedData,
  MessageParamsTypedDataWithMetadata,
} from '../types';

const DELEGATION_PRIMARY_TYPE = 'Delegation';

/**
 * Determines whether the provided EIP-712 typed data represents a Delegation request.
 *
 * Accepts either a pre-parsed typed data object or a JSON string. If a string is
 * provided, it is parsed. Returns true when the `primaryType` is "Delegation".
 *
 * @param data - EIP-712 typed data object or its JSON string representation.
 *
 * @returns True if the typed message is a Delegation request; otherwise false.
 */
export function isDelegationRequest(data: MessageParamsTypedData): boolean {
  const { primaryType } = data;

  return primaryType === DELEGATION_PRIMARY_TYPE;
}

/**
 * Decodes a permission from a Delegation EIP-712 request using the permissions controller.
 *
 * Parses the typed data from `messageParams`, validates and extracts `metadata.origin`
 * and `metadata.justification`, determines the `chainId`, and forwards the delegation
 * context to the permissions controller via the supplied messenger.
 *
 * @param params - Wrapper object for parameters.
 * @param params.messenger - Messenger used to call the permissions controller.
 * @param params.origin - The origin of the request.
 * @param params.data - The typed data to decode.
 *
 * @returns A decoded permission, or `undefined` if no permission can be derived.
 * @throws {Error} If required metadata (origin or justification) is missing or invalid.
 */
export function decodePermissionFromRequest({
  origin,
  data,
  messenger,
}: {
  origin: string;
  data: MessageParamsTypedDataWithMetadata;
  messenger: SignatureControllerMessenger;
}): DecodedPermission | undefined {
  const {
    metadata: { origin: specifiedOrigin, justification },
  } = data;

  if (typeof data.domain.chainId !== 'number') {
    throw new Error('Invalid chainId');
  }

  const { chainId } = data.domain;

  const { delegate, delegator, authority, caveats } =
    data.message as DelegationDetails;

  if (
    !(
      // isHexAddress requires a lowercase hex string
      (
        isHexAddress(delegate?.toLowerCase()) &&
        isHexAddress(delegator?.toLowerCase()) &&
        isStrictHexString(authority) &&
        caveats
      )
    )
  ) {
    return undefined;
  }

  const decodedPermission = messenger.call(
    'GatorPermissionsController:decodePermissionFromPermissionContextForOrigin',
    {
      origin,
      chainId,
      delegation: { delegate, delegator, caveats, authority },
      metadata: { justification, origin: specifiedOrigin },
    },
  );

  return decodedPermission;
}

/**
 * Validates the provided MessageParamsTypedData contains valid EIP-7715
 * execution permissions metadata.
 *
 * @param data - The typed data to validate.
 * @throws {Error} If the metadata is invalid.
 */
export function validateExecutionPermissionMetadata(
  data: MessageParamsTypedData,
): asserts data is MessageParamsTypedDataWithMetadata {
  if (!('metadata' in data)) {
    throw new Error('Invalid metadata');
  }
  const { metadata } = data as MessageParamsTypedDataWithMetadata;
  if (
    !metadata ||
    !(typeof metadata.origin === 'string') ||
    !(typeof metadata.justification === 'string')
  ) {
    throw new Error('Invalid metadata');
  }
}
