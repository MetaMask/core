import type { Eip1193Provider } from 'ethers';

// We can isolate and create a metamask function/closure
export type AnnounceProviderEventDetail = {
  info?: { rdns?: string };
  provider?: Eip1193Provider;
};
export type AnnounceProviderEvent = CustomEvent<AnnounceProviderEventDetail>;

export const metamaskClientsRdns = {
  main: 'io.metamask',
  flask: 'io.metamask.flask',
  institutional: 'io.metamask.mmi',
};

export type MetamaskClientRdnsKey = keyof typeof metamaskClientsRdns;

type MetaMaskClientType = 'any' | MetamaskClientRdnsKey;

// Cache, as when the function is recalled, we can reuse instead of continue waiting
const providerCache: Partial<Record<MetaMaskClientType, Eip1193Provider>> = {};

/**
 * This uses EIP6963 to find all metamask accounts and returns the first matching provider
 * the consumer requests (main, flask, institutional, or any)
 *
 * @param type - the MetaMask Wallet type (main, flask, institutional, or any)
 * @returns a ethers provider so you can make requests to that specific wallet
 */
export function getMetaMaskProviderEIP6963(
  type: MetaMaskClientType = 'any',
): Promise<Eip1193Provider | null> {
  return new Promise<Eip1193Provider | null>((res) => {
    if (type !== 'any' && metamaskClientsRdns[type] === undefined) {
      res(null);
      return;
    }

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
