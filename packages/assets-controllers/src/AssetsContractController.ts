import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { IPFS_DEFAULT_GATEWAY_URL } from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerNetworkDidChangeEvent,
  Provider,
} from '@metamask/network-controller';
import type { PreferencesControllerStateChangeEvent } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';
import abiSingleCallBalancesContract from 'single-call-balance-checker-abi';

import { SupportedTokenDetectionNetworks } from './assetsUtil';
import { ERC20Standard } from './Standards/ERC20Standard';
import { ERC1155Standard } from './Standards/NftStandards/ERC1155/ERC1155Standard';
import { ERC721Standard } from './Standards/NftStandards/ERC721/ERC721Standard';

/**
 * Check if token detection is enabled for certain networks
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export const SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID: Record<Hex, string> = {
  [SupportedTokenDetectionNetworks.mainnet]:
    '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
  [SupportedTokenDetectionNetworks.bsc]:
    '0x2352c63A83f9Fd126af8676146721Fa00924d7e4',
  [SupportedTokenDetectionNetworks.polygon]:
    '0x2352c63A83f9Fd126af8676146721Fa00924d7e4',
  [SupportedTokenDetectionNetworks.avax]:
    '0xD023D153a0DFa485130ECFdE2FAA7e612EF94818',
  [SupportedTokenDetectionNetworks.aurora]:
    '0x1286415D333855237f89Df27D388127181448538',
  [SupportedTokenDetectionNetworks.linea_goerli]:
    '0x10dAd7Ca3921471f616db788D9300DC97Db01783',
  [SupportedTokenDetectionNetworks.linea_mainnet]:
    '0xF62e6a41561b3650a69Bb03199C735e3E3328c0D',
  [SupportedTokenDetectionNetworks.arbitrum]:
    '0x151E24A486D7258dd7C33Fb67E4bB01919B7B32c',
  [SupportedTokenDetectionNetworks.optimism]:
    '0xB1c568e9C3E6bdaf755A60c7418C269eb11524FC',
  [SupportedTokenDetectionNetworks.base]:
    '0x6AA75276052D96696134252587894ef5FFA520af',
  [SupportedTokenDetectionNetworks.zksync]:
    '0x458fEd3144680a5b8bcfaa0F9594aa19B4Ea2D34',
  [SupportedTokenDetectionNetworks.cronos]:
    '0x768ca200f0fc702ac9ea502498c18f5eff176378',
  [SupportedTokenDetectionNetworks.celo]:
    '0x6aa75276052d96696134252587894ef5ffa520af',
  [SupportedTokenDetectionNetworks.gnosis]:
    '0x6aa75276052d96696134252587894ef5ffa520af',
  [SupportedTokenDetectionNetworks.fantom]:
    '0x6aa75276052d96696134252587894ef5ffa520af',
  [SupportedTokenDetectionNetworks.polygon_zkevm]:
    '0x6aa75276052d96696134252587894ef5ffa520af',
  [SupportedTokenDetectionNetworks.moonbeam]:
    '0x6aa75276052d96696134252587894ef5ffa520af',
  [SupportedTokenDetectionNetworks.moonriver]:
    '0x6aa75276052d96696134252587894ef5ffa520af',
};

export const MISSING_PROVIDER_ERROR =
  'AssetsContractController failed to set the provider correctly. A provider must be set for this method to be available';

/**
 * @type BalanceMap
 *
 * Key value object containing the balance for each tokenAddress
 * @property [tokenAddress] - Address of the token
 */
export type BalanceMap = {
  [tokenAddress: string]: BN;
};

export const name = 'AssetsContractController';

export type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

export type AllowedEvents =
  | PreferencesControllerStateChangeEvent
  | NetworkControllerNetworkDidChangeEvent;

export type AssetsContractControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  AllowedActions,
  AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that interacts with contracts on mainnet through web3
 */
export class AssetsContractController {
  protected messagingSystem: AssetsContractControllerMessenger;

  #provider: Provider | undefined;

  ipfsGateway: string;

  chainId: Hex;

  /**
   * Creates a AssetsContractController instance.
   *
   * @param options - The controller options.
   * @param options.messenger -
   * @param options.chainId - The chain ID of the current network.
   */
  constructor({
    messenger,
    chainId: initialChainId,
  }: {
    messenger: AssetsContractControllerMessenger;
    chainId: Hex;
  }) {
    this.chainId = initialChainId;
    this.#provider = undefined;
    this.ipfsGateway = IPFS_DEFAULT_GATEWAY_URL;
    this.messagingSystem = messenger;

    this.messagingSystem.subscribe(
      `PreferencesController:stateChange`,
      ({ ipfsGateway }) => {
        this.ipfsGateway = ipfsGateway;
      },
    );

    this.messagingSystem.subscribe(
      `NetworkController:networkDidChange`,
      ({ selectedNetworkClientId }) => {
        const {
          configuration: { chainId },
        } = this.messagingSystem.call(
          `NetworkController:getNetworkClientById`,
          selectedNetworkClientId,
        );

        if (this.chainId !== chainId) {
          this.chainId = chainId;
        }
      },
    );
  }

  /**
   * Sets a new provider.
   *
   * TODO: Replace this wth a method.
   *
   * @property provider - Provider used to create a new underlying Web3 instance
   */
  set provider(provider: Provider | undefined) {
    this.#provider = provider;
  }

  get provider() {
    throw new Error('Property only used for setting');
  }

  /**
   * Get the relevant provider instance.
   *
   * @param networkClientId - Network Client ID.
   * @returns Web3Provider instance.
   */
  getProvider(networkClientId?: NetworkClientId): Web3Provider {
    const provider = networkClientId
      ? this.messagingSystem.call(
          `NetworkController:getNetworkClientById`,
          networkClientId,
        ).provider
      : this.#provider;

    if (provider === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }

    // @ts-expect-error TODO: remove this annotation once the `Eip1193Provider` class is released
    return new Web3Provider(provider);
  }

  /**
   * Get the relevant chain ID.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns Hex chain ID.
   */
  getChainId(networkClientId?: NetworkClientId): Hex {
    return networkClientId
      ? this.messagingSystem.call(
          `NetworkController:getNetworkClientById`,
          networkClientId,
        ).configuration.chainId
      : this.chainId;
  }

  /**
   * Get a ERC20Standard instance using the relevant provider instance.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns ERC20Standard instance.
   */
  getERC20Standard(networkClientId?: NetworkClientId): ERC20Standard {
    const provider = this.getProvider(networkClientId);
    return new ERC20Standard(provider);
  }

  /**
   * Get a ERC721Standard instance using the relevant provider instance.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns ERC721Standard instance.
   */
  getERC721Standard(networkClientId?: NetworkClientId): ERC721Standard {
    const provider = this.getProvider(networkClientId);
    return new ERC721Standard(provider);
  }

  /**
   * Get a ERC1155Standard instance using the relevant provider instance.
   *
   * @param networkClientId - Network Client ID used to get the provider.
   * @returns ERC1155Standard instance.
   */
  getERC1155Standard(networkClientId?: NetworkClientId): ERC1155Standard {
    const provider = this.getProvider(networkClientId);
    return new ERC1155Standard(provider);
  }

  /**
   * Get balance or count for current account on specific asset contract.
   *
   * @param address - Asset ERC20 contract address.
   * @param selectedAddress - Current account public address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
   */
  async getERC20BalanceOf(
    address: string,
    selectedAddress: string,
    networkClientId?: NetworkClientId,
  ): Promise<BN> {
    const erc20Standard = this.getERC20Standard(networkClientId);
    return erc20Standard.getBalanceOf(address, selectedAddress);
  }

  /**
   * Query for the decimals for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'decimals'.
   */
  async getERC20TokenDecimals(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc20Standard = this.getERC20Standard(networkClientId);
    return erc20Standard.getTokenDecimals(address);
  }

  /**
   * Query for the name for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'decimals'.
   */
  async getERC20TokenName(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc20Standard = this.getERC20Standard(networkClientId);
    return erc20Standard.getTokenName(address);
  }

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param address - ERC721 asset contract address.
   * @param selectedAddress - Current account public address.
   * @param index - An NFT counter less than `balanceOf(selectedAddress)`.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  getERC721NftTokenId(
    address: string,
    selectedAddress: string,
    index: number,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getNftTokenId(address, selectedAddress, index);
  }

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param tokenAddress - ERC721 asset contract address.
   * @param userAddress - Current account public address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to an object containing the token standard and a set of details which depend on which standard the token supports.
   */
  async getTokenStandardAndDetails(
    tokenAddress: string,
    userAddress?: string,
    tokenId?: string,
    networkClientId?: NetworkClientId,
  ): Promise<{
    standard: string;
    tokenURI?: string | undefined;
    symbol?: string | undefined;
    name?: string | undefined;
    decimals?: string | undefined;
    balance?: BN | undefined;
  }> {
    // Asserts provider is available
    this.getProvider(networkClientId);

    // ERC721
    try {
      const erc721Standard = this.getERC721Standard(networkClientId);
      return {
        ...(await erc721Standard.getDetails(
          tokenAddress,
          this.ipfsGateway,
          tokenId,
        )),
      };
    } catch {
      // Ignore
    }

    // ERC1155
    try {
      const erc1155Standard = this.getERC1155Standard(networkClientId);
      return {
        ...(await erc1155Standard.getDetails(
          tokenAddress,
          this.ipfsGateway,
          tokenId,
        )),
      };
    } catch {
      // Ignore
    }

    // ERC20
    try {
      const erc20Standard = this.getERC20Standard(networkClientId);
      return {
        ...(await erc20Standard.getDetails(tokenAddress, userAddress)),
      };
    } catch {
      // Ignore
    }

    throw new Error('Unable to determine contract standard');
  }

  /**
   * Query for tokenURI for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getERC721TokenURI(
    address: string,
    tokenId: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getTokenURI(address, tokenId);
  }

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'name'.
   */
  async getERC721AssetName(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getAssetName(address);
  }

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'symbol'.
   */
  async getERC721AssetSymbol(
    address: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getAssetSymbol(address);
  }

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the owner address.
   */
  async getERC721OwnerOf(
    address: string,
    tokenId: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc721Standard = this.getERC721Standard(networkClientId);
    return erc721Standard.getOwnerOf(address, tokenId);
  }

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getERC1155TokenURI(
    address: string,
    tokenId: string,
    networkClientId?: NetworkClientId,
  ): Promise<string> {
    const erc1155Standard = this.getERC1155Standard(networkClientId);
    return erc1155Standard.getTokenURI(address, tokenId);
  }

  /**
   * Query for balance of a given ERC 1155 token.
   *
   * @param userAddress - Wallet public address.
   * @param nftAddress - ERC1155 asset contract address.
   * @param nftId - ERC1155 asset identifier.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns Promise resolving to the 'balanceOf'.
   */
  async getERC1155BalanceOf(
    userAddress: string,
    nftAddress: string,
    nftId: string,
    networkClientId?: NetworkClientId,
  ): Promise<BN> {
    const erc1155Standard = this.getERC1155Standard(networkClientId);
    return erc1155Standard.getBalanceOf(nftAddress, userAddress, nftId);
  }

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
  async transferSingleERC1155(
    nftAddress: string,
    senderAddress: string,
    recipientAddress: string,
    nftId: string,
    qty: string,
    networkClientId?: NetworkClientId,
  ): Promise<void> {
    const erc1155Standard = this.getERC1155Standard(networkClientId);
    return erc1155Standard.transferSingle(
      nftAddress,
      senderAddress,
      recipientAddress,
      nftId,
      qty,
    );
  }

  /**
   * Get the token balance for a list of token addresses in a single call. Only non-zero balances
   * are returned.
   *
   * @param selectedAddress - The address to check token balances for.
   * @param tokensToDetect - The token addresses to detect balances for.
   * @param networkClientId - Network Client ID to fetch the provider with.
   * @returns The list of non-zero token balances.
   */
  async getBalancesInSingleCall(
    selectedAddress: string,
    tokensToDetect: string[],
    networkClientId?: NetworkClientId,
  ) {
    const chainId = this.getChainId(networkClientId);
    const provider = this.getProvider(networkClientId);
    if (!(chainId in SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID)) {
      // Only fetch balance if contract address exists
      return {};
    }
    const contractAddress = SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID[chainId];

    const contract = new Contract(
      contractAddress,
      abiSingleCallBalancesContract,
      provider,
    );
    const result = await contract.balances([selectedAddress], tokensToDetect);
    const nonZeroBalances: BalanceMap = {};
    /* istanbul ignore else */
    if (result.length > 0) {
      tokensToDetect.forEach((tokenAddress, index) => {
        const balance: BN = result[index];
        /* istanbul ignore else */
        if (String(balance) !== '0') {
          nonZeroBalances[tokenAddress] = balance;
        }
      });
    }
    return nonZeroBalances;
  }
}

export default AssetsContractController;
