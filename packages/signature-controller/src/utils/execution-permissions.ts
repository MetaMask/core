import type { DecodedPermission } from '@metamask/gator-permissions-controller';
import { isHexAddress, isStrictHexString } from '@metamask/utils';

import type { DelegationDetails } from '../../../gator-permissions-controller/src/types';
import { projectLogger as log } from '../logger';
import type { SignatureControllerMessenger } from '../SignatureController';
import type {
  MessageParamsTyped,
  MessageParamsTypedData,
  MessageParamsTypedDataWithMetadata,
} from '../types';

/**
 * Determines whether the provided EIP-712 typed data represents a Delegation request.
 *
 * Accepts either a pre-parsed typed data object or a JSON string. If a string is
 * provided, it is parsed. Returns true when the `primaryType` is "Delegation".
 *
 * @param params - Wrapper object for parameters.
 * @param params.data - EIP-712 typed data object or its JSON string representation.
 * @returns True if the typed message is a Delegation request; otherwise false.
 * @throws {Error} If the `data` argument is a string that cannot be parsed as valid JSON.
 */
export function isDelegationRequest({
  data: messageData,
}: {
  data: MessageParamsTyped['data'];
}): boolean {
  let data: MessageParamsTypedData;
  if (typeof messageData === 'object') {
    data = messageData as MessageParamsTypedData;
  } else {
    try {
      data = JSON.parse(messageData) as MessageParamsTypedData;
    } catch (error) {
      log((error as Error).message);
      // if the data is not valid JSON, then it's not a delegation request
      return false;
    }
  }

  const { primaryType } = data;

  return primaryType === 'Delegation';
}

/**
 * Decodes a permission from a Delegation EIP-712 request using the permissions controller.
 *
 * Parses the typed data from `messageParams`, validates and extracts `metadata.origin`
 * and `metadata.justification`, determines the `chainId`, and forwards the delegation
 * context to the permissions controller via the supplied messenger.
 *
 * @param params - Wrapper object for parameters.
 * @param params.messageParams - The typed message parameters to decode.
 * @param params.messenger - Messenger used to call the permissions controller.
 * @param params.origin - The origin of the request.
 * @returns A decoded permission, or `undefined` if no permission can be derived.
 * @throws {Error} If required metadata (origin or justification) is missing or invalid.
 */
export async function decodePermissionFromRequest({
  origin,
  messageParams,
  messenger,
}: {
  origin: string;
  messageParams: MessageParamsTyped;
  messenger: SignatureControllerMessenger;
}): Promise<DecodedPermission | undefined> {
  const messageParamsData =
    typeof messageParams.data === 'string'
      ? (JSON.parse(messageParams.data) as MessageParamsTypedData)
      : (messageParams.data as MessageParamsTypedData);

  let specifiedOrigin: string | undefined;
  let justification: string | undefined;

  if ('metadata' in messageParamsData) {
    const { metadata } =
      messageParamsData as MessageParamsTypedDataWithMetadata;
    if (metadata && 'origin' in metadata && 'justification' in metadata) {
      specifiedOrigin = metadata.origin;
      justification = metadata.justification;
    }
  }
  if (!specifiedOrigin || !justification) {
    throw new Error('Invalid metadata');
  }

  const chainId = parseInt(messageParamsData.domain.chainId as string, 10);

  const { delegate, delegator, authority, caveats } =
    messageParamsData.message as DelegationDetails;

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
    throw new Error('Invalid delegation data');
  }

  const decodedPermission = await messenger.call(
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
