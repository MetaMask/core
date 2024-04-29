export type Eip1193Provider = {
  /**
   * See [[link-eip-1193]] for details on this method.
   */
  request(request: {
    method: string;
    params?: unknown | Record<string, unknown>;
  }): Promise<unknown>;
};

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
 * Gets Snaps from a MetaMask Wallet
 *
 * @returns All currently installed snaps.
 */
export async function getSnaps(): Promise<GetSnapsResponse> {
  const provider = await getMetaMaskProviderEIP6963();
  const result: GetSnapsResponse = (await provider?.request({
    method: 'wallet_getSnaps',
  })) as GetSnapsResponse;

  return result;
}

/**
 * Requests Connection to the Message Signing Snap
 *
 * @returns snap connect result
 */
export async function connectSnap(): Promise<string> {
  const provider = await getMetaMaskProviderEIP6963();
  if (!provider) {
    throw new Error('No provider connected');
  }

  const result: string = (await provider.request({
    method: 'wallet_requestSnaps',
    params: {
      [SNAP_ORIGIN]: {},
    },
  })) as string;

  return result;
}

/**
 * Will return the message signing snap if installed
 */
export async function getSnap(): Promise<Snap | undefined> {
  try {
    const snaps = await getSnaps();
    return Object.values(snaps ?? {}).find((snap) => foundSnap(snap));
  } catch (e) {
    console.error('Failed to obtain installed snap', e);
    return undefined;
  }
}

export const MESSAGE_SIGNING_SNAP = {
  async getPublicKey() {
    const provider = await getMetaMaskProviderEIP6963();
    const publicKey: string = (await provider?.request({
      method: 'wallet_invokeSnap',
      params: { snapId: SNAP_ORIGIN, request: { method: 'getPublicKey' } },
    })) as string;

    return publicKey;
  },

  async signMessage(message: `metamask:${string}`) {
    const provider = await getMetaMaskProviderEIP6963();
    const signedMessage: string = (await provider?.request({
      method: 'wallet_invokeSnap',
      params: {
        snapId: SNAP_ORIGIN,
        request: { method: 'signMessage', params: { message } },
      },
    })) as string;

    return signedMessage;
  },
};

// We can isolate and create a metamask function/closure
type AnnounceProviderEventDetail = {
  info?: { rdns?: string };
  provider?: Eip1193Provider;
};

const metamaskClientsRdns = {
  main: 'io.metamask',
  flask: 'io.metamask.flask',
  institutional: 'io.metamask.mmi',
};

type MetaMaskClientType = 'any' | keyof typeof metamaskClientsRdns;

// Cache, as when the function is recalled, we can reuse instead of continue waiting
const providerCache: Partial<Record<MetaMaskClientType, Eip1193Provider>> = {};

/**
 * This uses EIP6963 to find all metamask accounts and returns the first matching provider
 * the consumer requests (main, flask, institutional, or any)
 *
 * @param type - the MetaMask Wallet type (main, flask, institutional, or any)
 * @returns a ethers provider so you can make requests to that specific wallet
 */
function getMetaMaskProviderEIP6963(
  type: MetaMaskClientType = 'any',
): Promise<Eip1193Provider | null> {
  return new Promise<Eip1193Provider | null>((res) => {
    const cachedProvider = providerCache[type];
    if (cachedProvider) {
      res(cachedProvider);
      return;
    }

    const providers: { rdns: string; provider: Eip1193Provider }[] = [];

    const handleProviderEvent = (event: unknown) => {
      const typedEvent = event as CustomEvent<AnnounceProviderEventDetail>;
      const providerDetail = typedEvent?.detail;
      if (providerDetail?.provider && providerDetail?.info?.rdns) {
        providers.push({
          rdns: providerDetail?.info?.rdns,
          provider: providerDetail?.provider,
        });
      }
    };

    window.addEventListener('eip6963:announceProvider', handleProviderEvent);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    /**
     * It may take some time for the events to be emitted from the different wallets.
     * So waiting a small period of time before we use the collected events.
     */
    setTimeout(() => {
      // remove attached listener
      window.removeEventListener(
        'eip6963:announceProvider',
        handleProviderEvent,
      );

      let provider: Eip1193Provider | null;
      if (type === 'any') {
        // return the first MM client we find
        const metamaskClients = Object.values(metamaskClientsRdns);
        provider =
          providers.find((p) => metamaskClients.includes(p.rdns))?.provider ??
          null;
      } else {
        const metamaskRdns = metamaskClientsRdns[type];
        provider =
          providers.find((p) => p.rdns === metamaskRdns)?.provider ?? null;
      }

      if (provider) {
        providerCache[type] = provider;
      }
      return res(provider);
    }, 100);
  });
}
