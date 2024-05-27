import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import { GET_PUBLIC_KEY, SIGN_MESSAGE } from './constants';

type SnapRPCRequest = Parameters<HandleSnapRequest['handler']>[0];

const snapId = 'npm:@metamask/message-signing-snap' as SnapId;

/**
 * Creates a SnapRPCRequest object for retrieving the public key from a Snap.
 *
 * @returns The SnapRPCRequest object.
 */
export function createSnapPublicKeyRequest(): SnapRPCRequest {
  return {
    snapId,
    origin: '',
    handler: HandlerType.OnRpcRequest,
    request: {
      method: GET_PUBLIC_KEY,
    },
  };
}

/**
 * Creates a SnapRPCRequest object for signing a message using a Snap.
 *
 * @param message - The message to be signed.
 * @returns The SnapRPCRequest object for signing the message.
 */
export function createSnapSignMessageRequest(
  message: `metamask:${string}`,
): SnapRPCRequest {
  return {
    snapId,
    origin: '',
    handler: HandlerType.OnRpcRequest,
    request: {
      method: SIGN_MESSAGE,
      params: { message },
    },
  };
}
