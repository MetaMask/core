import type { ActionConstraint, RestrictedControllerMessenger } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerGetNetworkConfigurationByNetworkClientId, NetworkControllerGetSelectedNetworkClientAction, NetworkControllerGetStateAction, NetworkControllerNetworkDidChangeEvent, Provider } from '@metamask/network-controller';
import type { PreferencesControllerStateChangeEvent } from '@metamask/preferences-controller';
import { type Hex } from '@metamask/utils';
import type BN from 'bn.js';
import { ERC20Standard } from './Standards/ERC20Standard';
import { ERC1155Standard } from './Standards/NftStandards/ERC1155/ERC1155Standard';
import { ERC721Standard } from './Standards/NftStandards/ERC721/ERC721Standard';
/**
 * Check if token detection is enabled for certain networks
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export declare const SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID: {
    readonly "0x1": "0xb1f8e55c7f64d203c1400b9d8555d050f94adf39";
    readonly "0x38": "0x2352c63A83f9Fd126af8676146721Fa00924d7e4";
    readonly "0x89": "0x2352c63A83f9Fd126af8676146721Fa00924d7e4";
    readonly "0xa86a": "0xD023D153a0DFa485130ECFdE2FAA7e612EF94818";
    readonly "0x4e454152": "0x1286415D333855237f89Df27D388127181448538";
    readonly "0xe704": "0x10dAd7Ca3921471f616db788D9300DC97Db01783";
    readonly "0xe708": "0xF62e6a41561b3650a69Bb03199C735e3E3328c0D";
    readonly "0xa4b1": "0x151E24A486D7258dd7C33Fb67E4bB01919B7B32c";
    readonly "0xa": "0xB1c568e9C3E6bdaf755A60c7418C269eb11524FC";
    readonly "0x2105": "0x6AA75276052D96696134252587894ef5FFA520af";
    readonly "0x144": "0x458fEd3144680a5b8bcfaa0F9594aa19B4Ea2D34";
    readonly "0x19": "0x768ca200f0fc702ac9ea502498c18f5eff176378";
    readonly "0xa4ec": "0x6aa75276052d96696134252587894ef5ffa520af";
    readonly "0x64": "0x6aa75276052d96696134252587894ef5ffa520af";
    readonly "0xfa": "0x6aa75276052d96696134252587894ef5ffa520af";
    readonly "0x44d": "0x6aa75276052d96696134252587894ef5ffa520af";
    readonly "0x504": "0x6aa75276052d96696134252587894ef5ffa520af";
    readonly "0x505": "0x6aa75276052d96696134252587894ef5ffa520af";
};
export declare const MISSING_PROVIDER_ERROR = "AssetsContractController failed to set the provider correctly. A provider must be set for this method to be available";
/**
 * @type BalanceMap
 *
 * Key value object containing the balance for each tokenAddress
 * @property [tokenAddress] - Address of the token
 */
export type BalanceMap = {
    [tokenAddress: string]: BN;
};
/**
 * The name of the {@link AssetsContractController}
 */
declare const name = "AssetsContractController";
/**
 * A utility type that derives the public method names of a given messenger consumer class,
 * and uses it to generate the class's internal messenger action types.
 * @template Controller - A messenger consumer class.
 */
type ControllerActionsMap<Controller> = {
    [ClassMethod in keyof Controller as Controller[ClassMethod] extends ActionConstraint['handler'] ? ClassMethod : never]: {
        type: `${typeof name}:${ClassMethod & string}`;
        handler: Controller[ClassMethod];
    };
};
type AssetsContractControllerActionsMap = ControllerActionsMap<AssetsContractController>;
/**
 * The union of all public class method names of {@link AssetsContractController}.
 */
type AssetsContractControllerMethodName = keyof AssetsContractControllerActionsMap;
/**
 * The union of all internal messenger actions available to the {@link AssetsContractControllerMessenger}.
 */
export type AssetsContractControllerActions = AssetsContractControllerActionsMap[AssetsContractControllerMethodName];
export type AssetsContractControllerGetERC20StandardAction = AssetsContractControllerActionsMap['getERC20Standard'];
export type AssetsContractControllerGetERC721StandardAction = AssetsContractControllerActionsMap['getERC721Standard'];
export type AssetsContractControllerGetERC1155StandardAction = AssetsContractControllerActionsMap['getERC1155Standard'];
export type AssetsContractControllerGetERC20BalanceOfAction = AssetsContractControllerActionsMap['getERC20BalanceOf'];
export type AssetsContractControllerGetERC20TokenDecimalsAction = AssetsContractControllerActionsMap['getERC20TokenDecimals'];
export type AssetsContractControllerGetERC20TokenNameAction = AssetsContractControllerActionsMap['getERC20TokenName'];
export type AssetsContractControllerGetERC721NftTokenIdAction = AssetsContractControllerActionsMap['getERC721NftTokenId'];
export type AssetsContractControllerGetERC721TokenURIAction = AssetsContractControllerActionsMap['getERC721TokenURI'];
export type AssetsContractControllerGetERC721AssetNameAction = AssetsContractControllerActionsMap['getERC721AssetName'];
export type AssetsContractControllerGetERC721AssetSymbolAction = AssetsContractControllerActionsMap['getERC721AssetSymbol'];
export type AssetsContractControllerGetERC721OwnerOfAction = AssetsContractControllerActionsMap['getERC721OwnerOf'];
export type AssetsContractControllerGetERC1155TokenURIAction = AssetsContractControllerActionsMap['getERC1155TokenURI'];
export type AssetsContractControllerGetERC1155BalanceOfAction = AssetsContractControllerActionsMap['getERC1155BalanceOf'];
export type AssetsContractControllerTransferSingleERC1155Action = AssetsContractControllerActionsMap['transferSingleERC1155'];
export type AssetsContractControllerGetTokenStandardAndDetailsAction = AssetsContractControllerActionsMap['getTokenStandardAndDetails'];
export type AssetsContractControllerGetBalancesInSingleCallAction = AssetsContractControllerActionsMap['getBalancesInSingleCall'];
/**
 * The union of all internal messenger events available to the {@link AssetsContractControllerMessenger}.
 */
export type AssetsContractControllerEvents = never;
/**
 * The union of all external messenger actions that must be allowed by the {@link AssetsContractControllerMessenger}.
 */
export type AllowedActions = NetworkControllerGetNetworkClientByIdAction | NetworkControllerGetNetworkConfigurationByNetworkClientId | NetworkControllerGetSelectedNetworkClientAction | NetworkControllerGetStateAction;
/**
 * The union of all external messenger event that must be allowed by the {@link AssetsContractControllerMessenger}.
 */
export type AllowedEvents = PreferencesControllerStateChangeEvent | NetworkControllerNetworkDidChangeEvent;
/**
 * The messenger of the {@link AssetsContractController}.
 */
export type AssetsContractControllerMessenger = RestrictedControllerMessenger<typeof name, AssetsContractControllerActions | AllowedActions, AssetsContractControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Controller that interacts with contracts on mainnet through web3
 */
export declare class AssetsContractController {
    #private;
    protected messagingSystem: AssetsContractControllerMessenger;
    /**
     * Creates a AssetsContractController instance.
     *
     * @param options - The controller options.
     * @param options.messenger - The controller messenger.
     * @param options.chainId - The chain ID of the current network.
     */
    constructor({ messenger, chainId: initialChainId, }: {
        messenger: AssetsContractControllerMessenger;
        chainId: Hex;
    });
    /**
     * Sets a new provider.
     *
     * @param provider - Provider used to create a new underlying Web3 instance
     */
    setProvider(provider: Provider | undefined): void;
    get ipfsGateway(): string;
    get chainId(): `0x${string}`;
    /**
     * Get a ERC20Standard instance using the relevant provider instance.
     *
     * @param networkClientId - Network Client ID used to get the provider.
     * @returns ERC20Standard instance.
     */
    getERC20Standard(networkClientId?: NetworkClientId): ERC20Standard;
    /**
     * Get a ERC721Standard instance using the relevant provider instance.
     *
     * @param networkClientId - Network Client ID used to get the provider.
     * @returns ERC721Standard instance.
     */
    getERC721Standard(networkClientId?: NetworkClientId): ERC721Standard;
    /**
     * Get a ERC1155Standard instance using the relevant provider instance.
     *
     * @param networkClientId - Network Client ID used to get the provider.
     * @returns ERC1155Standard instance.
     */
    getERC1155Standard(networkClientId?: NetworkClientId): ERC1155Standard;
    /**
     * Get balance or count for current account on specific asset contract.
     *
     * @param address - Asset ERC20 contract address.
     * @param selectedAddress - Current account public address.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
     */
    getERC20BalanceOf(address: string, selectedAddress: string, networkClientId?: NetworkClientId): Promise<BN>;
    /**
     * Query for the decimals for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'decimals'.
     */
    getERC20TokenDecimals(address: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Query for the name for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'decimals'.
     */
    getERC20TokenName(address: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param address - ERC721 asset contract address.
     * @param selectedAddress - Current account public address.
     * @param index - An NFT counter less than `balanceOf(selectedAddress)`.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
     */
    getERC721NftTokenId(address: string, selectedAddress: string, index: number, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Enumerate assets assigned to an owner.
     *
     * @param tokenAddress - ERC721 asset contract address.
     * @param userAddress - Current account public address.
     * @param tokenId - ERC721 asset identifier.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to an object containing the token standard and a set of details which depend on which standard the token supports.
     */
    getTokenStandardAndDetails(tokenAddress: string, userAddress?: string, tokenId?: string, networkClientId?: NetworkClientId): Promise<{
        standard: string;
        tokenURI?: string | undefined;
        symbol?: string | undefined;
        name?: string | undefined;
        decimals?: string | undefined;
        balance?: BN | undefined;
    }>;
    /**
     * Query for tokenURI for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getERC721TokenURI(address: string, tokenId: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Query for name for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'name'.
     */
    getERC721AssetName(address: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Query for symbol for a given asset.
     *
     * @param address - ERC721 or ERC20 asset contract address.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'symbol'.
     */
    getERC721AssetSymbol(address: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Query for owner for a given ERC721 asset.
     *
     * @param address - ERC721 asset contract address.
     * @param tokenId - ERC721 asset identifier.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the owner address.
     */
    getERC721OwnerOf(address: string, tokenId: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Query for tokenURI for a given asset.
     *
     * @param address - ERC1155 asset contract address.
     * @param tokenId - ERC1155 asset identifier.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'tokenURI'.
     */
    getERC1155TokenURI(address: string, tokenId: string, networkClientId?: NetworkClientId): Promise<string>;
    /**
     * Query for balance of a given ERC 1155 token.
     *
     * @param userAddress - Wallet public address.
     * @param nftAddress - ERC1155 asset contract address.
     * @param nftId - ERC1155 asset identifier.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'balanceOf'.
     */
    getERC1155BalanceOf(userAddress: string, nftAddress: string, nftId: string, networkClientId?: NetworkClientId): Promise<BN>;
    /**
     * Transfer single ERC1155 token.
     *
     * @param nftAddress - ERC1155 token address.
     * @param senderAddress - ERC1155 token sender.
     * @param recipientAddress - ERC1155 token recipient.
     * @param nftId - ERC1155 token id.
     * @param qty - Quantity of tokens to be sent.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns Promise resolving to the 'transferSingle' ERC1155 token.
     */
    transferSingleERC1155(nftAddress: string, senderAddress: string, recipientAddress: string, nftId: string, qty: string, networkClientId?: NetworkClientId): Promise<void>;
    /**
     * Get the token balance for a list of token addresses in a single call. Only non-zero balances
     * are returned.
     *
     * @param selectedAddress - The address to check token balances for.
     * @param tokensToDetect - The token addresses to detect balances for.
     * @param networkClientId - Network Client ID to fetch the provider with.
     * @returns The list of non-zero token balances.
     */
    getBalancesInSingleCall(selectedAddress: string, tokensToDetect: string[], networkClientId?: NetworkClientId): Promise<BalanceMap>;
}
export default AssetsContractController;
//# sourceMappingURL=AssetsContractController.d.ts.map