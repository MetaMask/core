import type { Eip1193Provider } from 'ethers';
export type Snap = {
    permissionName: string;
    id: string;
    version: string;
    initialPermissions: Record<string, unknown>;
};
export type GetSnapsResponse = Record<string, Snap>;
export declare const SNAP_ORIGIN = "npm:@metamask/message-signing-snap";
/**
 * Requests Connection to the Message Signing Snap
 *
 * @param provider - MetaMask Wallet Provider
 * @returns snap connect result
 */
export declare function connectSnap(provider: Eip1193Provider): Promise<string>;
/**
 * Gets Snaps from a MetaMask Wallet
 *
 * @param provider - MetaMask Wallet Provider
 * @returns All currently installed snaps.
 */
export declare function getSnaps(provider: Eip1193Provider): Promise<GetSnapsResponse>;
/**
 * Will return the message signing snap if installed
 * @param provider - MetaMask Wallet Provider
 */
export declare function getSnap(provider: Eip1193Provider): Promise<Snap | undefined>;
export declare const MESSAGE_SIGNING_SNAP: {
    getPublicKey(provider: Eip1193Provider): Promise<string>;
    signMessage(provider: Eip1193Provider, message: `metamask:${string}`): Promise<string>;
};
//# sourceMappingURL=messaging-signing-snap-requests.d.ts.map