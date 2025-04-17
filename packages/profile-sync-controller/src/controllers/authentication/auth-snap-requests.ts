/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';

type SnapRPCRequest = Parameters<HandleSnapRequest['handler']>[0];

const snapId = 'npm:@metamask/message-signing-snap' as SnapId;

/**
 * Constructs Request to Message Signing Snap to get Public Key
 *
 * @returns Snap Public Key Request
 */
export function createSnapPublicKeyRequest(): SnapRPCRequest {
  return {
    snapId,
    origin: 'metamask',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'getPublicKey',
    },
  };
}

/**
 * Constructs Request to get Message Signing Snap to sign a message.
 *
 * @param message - message to sign
 * @returns Snap Sign Message Request
 */
export function createSnapSignMessageRequest(
  message: `metamask:${string}`,
): SnapRPCRequest {
  return {
    snapId,
    origin: 'metamask',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'signMessage',
      params: { message },
    },
  };
}

/**
 * Constructs Request to Message Signing Snap to get Public Key
 *
 * @returns Snap getEncryptionPublicKey Key Request
 */
export function createSnapEncryptionPublicKeyRequest(): SnapRPCRequest {
  return {
    snapId,
    origin: '',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'getEncryptionPublicKey',
    },
  };
}

/**
 * Constructs Request to Message Signing Snap to Decrypt a message
 *
 * @param ciphertext - The encrypted text to decrypt
 * @returns Snap decryptMessage Request
 */
export function createSnapDecryptMessageRequest(
  ciphertext: string,
): SnapRPCRequest {
  return {
    snapId,
    origin: '',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'decryptMessage',
      params: {
        data: JSON.parse(ciphertext),
      },
    },
  };
}
