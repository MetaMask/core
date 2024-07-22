import type { Eip1193Provider } from 'ethers';
export type AnnounceProviderEventDetail = {
    info?: {
        rdns?: string;
    };
    provider?: Eip1193Provider;
};
export type AnnounceProviderEvent = CustomEvent<AnnounceProviderEventDetail>;
export declare const metamaskClientsRdns: {
    main: string;
    flask: string;
    institutional: string;
};
export type MetamaskClientRdnsKey = keyof typeof metamaskClientsRdns;
type MetaMaskClientType = 'any' | MetamaskClientRdnsKey;
/**
 * This uses EIP6963 to find all metamask accounts and returns the first matching provider
 * the consumer requests (main, flask, institutional, or any)
 *
 * @param type - the MetaMask Wallet type (main, flask, institutional, or any)
 * @returns a ethers provider so you can make requests to that specific wallet
 */
export declare function getMetaMaskProviderEIP6963(type?: MetaMaskClientType): Promise<Eip1193Provider | null>;
export {};
//# sourceMappingURL=eip-6963-metamask-provider.d.ts.map