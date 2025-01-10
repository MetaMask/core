/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Eip1024EncryptedData } from '@metamask/utils';

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
    origin: '',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'getPublicKey',
    },
  };
}

/**
 * Constructs Request to Message Signing Snap to get the Encryption Public Key
 *
 * @returns Snap Encryption Public Key Request
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
    origin: '',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'signMessage',
      params: { message },
    },
  };
}

/**
 * Constructs Request to get Message Signing Snap to decrypt a message.
 *
 * @param data - message to decrypt
 * @returns Snap Sign Message Request
 */
export function createSnapDecryptMessageRequest(
  data: Eip1024EncryptedData,
): SnapRPCRequest {
  return {
    snapId,
    origin: '',
    handler: 'onRpcRequest' as any,
    request: {
      method: 'decryptMessage',
      params: { data },
    },
  };
}
