import type { Eip1193Provider } from 'ethers';

export type Snap = {
  permissionName: string;
  id: string;
  version: string;
  initialPermissions: Record<string, unknown>;
};
export type GetSnapsResponse = Record<string, Snap>;

export const SNAP_ORIGIN = 'npm:@metamask/message-signing-snap';

const foundSnap = (snap: Snap) => snap.id === SNAP_ORIGIN;

/**
 * Requests Connection to the Message Signing Snap
 *
 * @param provider - MetaMask Wallet Provider
 * @returns snap connect result
 */
export async function connectSnap(provider: Eip1193Provider): Promise<string> {
  const result: string = await provider.request({
    method: 'wallet_requestSnaps',
    params: {
      [SNAP_ORIGIN]: {},
    },
  });

  return result;
}

/**
 * Gets Snaps from a MetaMask Wallet
 *
 * @param provider - MetaMask Wallet Provider
 * @returns All currently installed snaps.
 */
export async function getSnaps(
  provider: Eip1193Provider,
): Promise<GetSnapsResponse> {
  const result: GetSnapsResponse = await provider.request({
    method: 'wallet_getSnaps',
  });

  return result;
}

/**
 * Will return the message signing snap if installed
 * @param provider - MetaMask Wallet Provider
 */
export async function getSnap(
  provider: Eip1193Provider,
): Promise<Snap | undefined> {
  try {
    const snaps = await getSnaps(provider);
    return Object.values(snaps ?? {}).find((snap) => foundSnap(snap));
  } catch (e) {
    console.error('Failed to obtain installed snap', e);
    return undefined;
  }
}

export const MESSAGE_SIGNING_SNAP = {
  async getPublicKey(provider: Eip1193Provider) {
    const publicKey: string = await provider.request({
      method: 'wallet_invokeSnap',
      params: { snapId: SNAP_ORIGIN, request: { method: 'getPublicKey' } },
    });

    return publicKey;
  },

  async signMessage(provider: Eip1193Provider, message: `metamask:${string}`) {
    const signedMessage: string = await provider?.request({
      method: 'wallet_invokeSnap',
      params: {
        snapId: SNAP_ORIGIN,
        request: { method: 'signMessage', params: { message } },
      },
    });

    return signedMessage;
  },
};
