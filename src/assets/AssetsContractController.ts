import { BN } from 'ethereumjs-util';
import Web3 from 'web3';
import abiERC20 from 'human-standard-token-abi';
import abiERC721 from 'human-standard-collectible-abi';
import abiERC1155 from 'human-standard-multi-collectible-abi';
import abiSingleCallBalancesContract from 'single-call-balance-checker-abi';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import { ERC721Standard } from './CollectibleStandards/ERC721/ERC721Standard';
import { ERC1155Standard } from './CollectibleStandards/ERC1155/ERC1155Standard';

const SINGLE_CALL_BALANCES_ADDRESS =
  '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39';

/**
 * @type AssetsContractConfig
 *
 * Assets Contract controller configuration
 * @property provider - Provider used to create a new web3 instance
 */
export interface AssetsContractConfig extends BaseConfig {
  provider: any;
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
  private web3: any;

  private erc721Standard: ERC721Standard = new ERC721Standard();

  private erc1155Standard: ERC1155Standard = new ERC1155Standard();

  /**
   * Name of this controller used during composition
   */
  name = 'AssetsContractController';

  /**
   * Creates a AssetsContractController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    config?: Partial<AssetsContractConfig>,
    state?: Partial<BaseState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      provider: undefined,
    };
    this.initialize();
  }

  /**
   * Sets a new provider.
   *
   * TODO: Replace this wth a method.
   *
   * @property provider - Provider used to create a new underlying Web3 instance
   */
  set provider(provider: any) {
    this.web3 = new Web3(provider);
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
  async getBalanceOf(address: string, selectedAddress: string): Promise<BN> {
    const contract = new this.web3.eth.Contract(abiERC20, address);
    return new Promise<BN>((resolve, reject) => {
      contract.balanceOf(selectedAddress, (error: Error, result: BN) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Query for name for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @returns Promise resolving to the 'decimals'.
   */
  async getTokenDecimals(address: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC20, address);
    return new Promise<string>((resolve, reject) => {
      contract.decimals((error: Error, result: string) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Enumerate assets assigned to an owner.
   *
   * @param address - ERC721 asset contract address.
   * @param selectedAddress - Current account public address.
   * @param index - A collectible counter less than `balanceOf(selectedAddress)`.
   * @returns Promise resolving to token identifier for the 'index'th asset assigned to 'selectedAddress'.
   */
  getCollectibleTokenId(
    address: string,
    selectedAddress: string,
    index: number,
  ): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return this.erc721Standard.getCollectibleTokenId(
      contract,
      selectedAddress,
      index,
    );
  }

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getCollectibleTokenURI(
    address: string,
    tokenId: string,
  ): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return this.erc721Standard.getCollectibleTokenURI(contract, tokenId);
  }

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  async getAssetName(address: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return this.erc721Standard.getAssetName(contract);
  }

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC721 or ERC20 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getAssetSymbol(address: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return this.erc721Standard.getAssetSymbol(contract);
  }

  /**
   * Query for owner for a given ERC721 asset.
   *
   * @param address - ERC721 asset contract address.
   * @param tokenId - ERC721 asset identifier.
   * @returns Promise resolving to the owner address.
   */
  async getOwnerOf(address: string, tokenId: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC721, address);
    return this.erc721Standard.getOwnerOf(contract, tokenId);
  }

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async uriERC1155Collectible(
    address: string,
    tokenId: string,
  ): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC1155, address);
    return this.erc1155Standard.uri(contract, tokenId);
  }

  /**
   * Query for balance of a given ERC 1155 token.
   *
   * @param userAddress - Wallet public address.
   * @param collectibleAddress - ERC1155 asset contract address.
   * @param collectibleId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'balanceOf'.
   */
  async balanceOfERC1155Collectible(
    userAddress: string,
    collectibleAddress: string,
    collectibleId: string,
  ): Promise<number> {
    const contract = new this.web3.eth.Contract(abiERC1155, collectibleAddress);
    return await this.erc1155Standard.getBalanceOf(
      contract,
      userAddress,
      collectibleId,
    );
  }

  /**
   * Transfer single ERC1155 token.
   *
   * @param collectibleAddress - ERC1155 token address.
   * @param senderAddress - ERC1155 token sender.
   * @param recipientAddress - ERC1155 token recipient.
   * @param collectibleId - ERC1155 token id.
   * @param qty - Quantity of tokens to be sent.
   * @returns Promise resolving to the 'transferSingle' ERC1155 token.
   */
  async transferSingleERC1155Collectible(
    collectibleAddress: string,
    senderAddress: string,
    recipientAddress: string,
    collectibleId: string,
    qty: string,
  ): Promise<void> {
    const contract = new this.web3.eth.Contract(abiERC1155, collectibleAddress);
    return await this.erc1155Standard.transferSingle(
      contract,
      collectibleAddress,
      senderAddress,
      recipientAddress,
      collectibleId,
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
    const contract = new this.web3.eth.Contract(
      abiSingleCallBalancesContract,
      SINGLE_CALL_BALANCES_ADDRESS,
    );
    return new Promise<BalanceMap>((resolve, reject) => {
      contract.balances(
        [selectedAddress],
        tokensToDetect,
        (error: Error, result: BN[]) => {
          /* istanbul ignore if */
          if (error) {
            reject(error);
            return;
          }
          const nonZeroBalances: BalanceMap = {};
          /* istanbul ignore else */
          if (result.length > 0) {
            tokensToDetect.forEach((tokenAddress, index) => {
              const balance: BN = result[index];
              /* istanbul ignore else */
              if (!balance.isZero()) {
                nonZeroBalances[tokenAddress] = balance;
              }
            });
          }
          resolve(nonZeroBalances);
        },
      );
    });
  }
}

export default AssetsContractController;
