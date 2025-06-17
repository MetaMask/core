/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';

type SnapRPCRequest = Parameters<HandleSnapRequest['handler']>[0];

const snapId = 'npm:@metamask/message-signing-snap' as SnapId;

/**
 * Constructs Request to Message Signing Snap to get Public Key
 *
 * @param entropySourceId - The source of entropy to use for key generation,
 * when multiple sources are available (Multi-SRP).
 * @returns Snap Public Key Request
 */
export function createSnapPublicKeyRequest(
  entropySourceId?: string,
): SnapRPCRequest {
  return {
    snapId,
    origin: 'metamask',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'getPublicKey',
      ...(entropySourceId ? { params: { entropySourceId } } : {}),
    },
  };
}

/**
 * Constructs Request to Message Signing Snap to get [EntropySourceId, PublicKey][]
 *
 * @returns Snap getAllPublicKeys Request
 */
export function createSnapAllPublicKeysRequest(): SnapRPCRequest {
  return {
    snapId,
    origin: 'metamask',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'getAllPublicKeys',
    },
  };
}

/**
 * Constructs Request to get Message Signing Snap to sign a message.
 *
 * @param message - message to sign
 * @param entropySourceId - The source of entropy to use for key generation,
 * when multiple sources are available (Multi-SRP).
 * @returns Snap Sign Message Request
 */
export function createSnapSignMessageRequest(
  message: `metamask:${string}`,
  entropySourceId?: string,
): SnapRPCRequest {
  return {
    snapId,
    origin: 'metamask',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'signMessage',
      params: { message, ...(entropySourceId ? { entropySourceId } : {}) },
    },
  };
}
