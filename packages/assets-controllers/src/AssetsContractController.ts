import { BN } from 'ethereumjs-util';
import abiSingleCallBalancesContract from 'single-call-balance-checker-abi';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import { IPFS_DEFAULT_GATEWAY_URL } from '@metamask/controller-utils';
import { NetworkState } from '@metamask/network-controller';
import { SupportedTokenDetectionNetworks } from './assetsUtil';
import { ERC721Standard } from './Standards/NftStandards/ERC721/ERC721Standard';
import { ERC1155Standard } from './Standards/NftStandards/ERC1155/ERC1155Standard';
import { ERC20Standard } from './Standards/ERC20Standard';

/**
 * Check if token detection is enabled for certain networks
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export const SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID: Record<string, string> = {
  [SupportedTokenDetectionNetworks.mainnet]:
    '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
  [SupportedTokenDetectionNetworks.bsc]:
    '0x2352c63A83f9Fd126af8676146721Fa00924d7e4',
  [SupportedTokenDetectionNetworks.polygon]:
    '0x2352c63A83f9Fd126af8676146721Fa00924d7e4',
  [SupportedTokenDetectionNetworks.avax]:
    '0xD023D153a0DFa485130ECFdE2FAA7e612EF94818',
};

export const MISSING_PROVIDER_ERROR =
  'AssetsContractController failed to set the provider correctly. A provider must be set for this method to be available';

/**
 * @type AssetsContractConfig
 *
 * Assets Contract controller configuration
 * @property provider - Provider used to create a new web3 instance
 */
export interface AssetsContractConfig extends BaseConfig {
  provider: any;
  ipfsGateway: string;
  chainId: string;
}

/**
 * @type BalanceMap
 *
 * Key value object containing the balance for each tokenAddress
 * @property [tokenAddress] - Address of the token
 */
export interface BalanceMap {
  [tokenAddress: string]: BN;
}

/**
 * Controller that interacts with contracts on mainnet through web3
 */
export class AssetsContractController extends BaseController<
  AssetsContractConfig,
  BaseState
> {
  private _provider?: Web3Provider;

  private erc721Standard?: ERC721Standard;

  private erc1155Standard?: ERC1155Standard;

  private erc20Standard?: ERC20Standard;

  /**
   * Name of this controller used during composition
   */
  override name = 'AssetsContractController';

  /**
   * Creates a AssetsContractController instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      onNetworkStateChange,
    }: {
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
    },
    config?: Partial<AssetsContractConfig>,
    state?: Partial<BaseState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      provider: undefined,
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      chainId: SupportedTokenDetectionNetworks.mainnet,
    };
    this.initialize();

    onPreferencesStateChange(({ ipfsGateway }) => {
      this.configure({ ipfsGateway });
    });

    onNetworkStateChange((networkState) => {
      if (this.config.chainId !== networkState.providerConfig.chainId) {
        this.configure({
          chainId: networkState.providerConfig.chainId,
        });
      }
    });
  }

  /**
   * Sets a new provider.
   *
   * TODO: Replace this wth a method.
   *
   * @property provider - Provider used to create a new underlying Web3 instance
   */
  set provider(provider: any) {
    this._provider = new Web3Provider(provider);
    this.erc721Standard = new ERC721Standard(this._provider);
    this.erc1155Standard = new ERC1155Standard(this._provider);
    this.erc20Standard = new ERC20Standard(this._provider);
  }

  get provider() {
    throw new Error('Property only used for setting');
  }

  /**
   * Get balance or count for current account on specific asset contract.
   *
   * @param address - Asset ERC20 contract address.
   * @param selectedAddress - Current account public address.
   * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
   */
  async getERC20BalanceOf(
    address: string,
    selectedAddress: string,
  ): Promise<BN> {
    if (!this.erc20Standard) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc20Standard.getBalanceOf(address, selectedAddress);
  }

  /**
   * Query for the decimals for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @returns Promise resolving to the 'decimals'.
   */
  async getERC20TokenDecimals(address: string): Promise<string> {
    if (this.erc20Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return await this.erc20Standard.getTokenDecimals(address);
  }

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param address - ERC721 asset contract address.
   * @param selectedAddress - Current account public address.
   * @param index - An NFT counter less than `balanceOf(selectedAddress)`.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  getERC721NftTokenId(
    address: string,
    selectedAddress: string,
    index: number,
  ): Promise<string> {
    if (this.erc721Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc721Standard.getNftTokenId(address, selectedAddress, index);
  }

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param tokenAddress - ERC721 asset contract address.
   * @param userAddress - Current account public address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to an object containing the token standard and a set of details which depend on which standard the token supports.
   */
  async getTokenStandardAndDetails(
    tokenAddress: string,
    userAddress?: string,
    tokenId?: string,
  ): Promise<{
    standard: string;
    tokenURI?: string | undefined;
    symbol?: string | undefined;
    name?: string | undefined;
    decimals?: string | undefined;
    balance?: BN | undefined;
  }> {
    if (
      this.erc721Standard === undefined ||
      this.erc1155Standard === undefined ||
      this.erc20Standard === undefined
    ) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }

    const { ipfsGateway } = this.config;

    // ERC721
    try {
      return {
        ...(await this.erc721Standard.getDetails(
          tokenAddress,
          ipfsGateway,
          tokenId,
        )),
      };
    } catch {
      // Ignore
    }

    // ERC1155
    try {
      return {
        ...(await this.erc1155Standard.getDetails(
          tokenAddress,
          ipfsGateway,
          tokenId,
        )),
      };
    } catch {
      // Ignore
    }

    // ERC20
    try {
      return {
        ...(await this.erc20Standard.getDetails(tokenAddress, userAddress)),
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
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getERC721TokenURI(address: string, tokenId: string): Promise<string> {
    if (this.erc721Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc721Standard.getTokenURI(address, tokenId);
  }

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  async getERC721AssetName(address: string): Promise<string> {
    if (this.erc721Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc721Standard.getAssetName(address);
  }

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getERC721AssetSymbol(address: string): Promise<string> {
    if (this.erc721Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc721Standard.getAssetSymbol(address);
  }

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the owner address.
   */
  async getERC721OwnerOf(address: string, tokenId: string): Promise<string> {
    if (this.erc721Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc721Standard.getOwnerOf(address, tokenId);
  }

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getERC1155TokenURI(address: string, tokenId: string): Promise<string> {
    if (this.erc1155Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return this.erc1155Standard.getTokenURI(address, tokenId);
  }

  /**
   * Query for balance of a given ERC 1155 token.
   *
   * @param userAddress - Wallet public address.
   * @param nftAddress - ERC1155 asset contract address.
   * @param nftId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'balanceOf'.
   */
  async getERC1155BalanceOf(
    userAddress: string,
    nftAddress: string,
    nftId: string,
  ): Promise<BN> {
    if (this.erc1155Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return await this.erc1155Standard.getBalanceOf(
      nftAddress,
      userAddress,
      nftId,
    );
  }

  /**
   * Transfer single ERC1155 token.
   *
   * @param nftAddress - ERC1155 token address.
   * @param senderAddress - ERC1155 token sender.
   * @param recipientAddress - ERC1155 token recipient.
   * @param nftId - ERC1155 token id.
   * @param qty - Quantity of tokens to be sent.
   * @returns Promise resolving to the 'transferSingle' ERC1155 token.
   */
  async transferSingleERC1155(
    nftAddress: string,
    senderAddress: string,
    recipientAddress: string,
    nftId: string,
    qty: string,
  ): Promise<void> {
    if (this.erc1155Standard === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR);
    }
    return await this.erc1155Standard.transferSingle(
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
   * @returns The list of non-zero token balances.
   */
  async getBalancesInSingleCall(
    selectedAddress: string,
    tokensToDetect: string[],
  ) {
    if (!(this.config.chainId in SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID)) {
      // Only fetch balance if contract address exists
      return {};
    }
    const contractAddress =
      SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID[this.config.chainId];

    const contract = new Contract(
      contractAddress,
      abiSingleCallBalancesContract,
      this._provider,
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
