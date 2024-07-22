import type { HandleSnapRequest } from '@metamask/snaps-controllers';
type SnapRPCRequest = Parameters<HandleSnapRequest['handler']>[0];
/**
 * Constructs Request to Message Signing Snap to get Public Key
 *
 * @returns Snap Public Key Request
 */
export declare function createSnapPublicKeyRequest(): SnapRPCRequest;
/**
 * Constructs Request to get Message Signing Snap to sign a message.
 *
 * @param message - message to sign
 * @returns Snap Sign Message Request
 */
export declare function createSnapSignMessageRequest(message: `metamask:${string}`): SnapRPCRequest;
export {};
//# sourceMappingURL=auth-snap-requests.d.ts.map