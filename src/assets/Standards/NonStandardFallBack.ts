import { BN } from 'ethereumjs-util';
import { UNKNOWN_STANDARD } from '../../constants';
import { ERC721Standard } from './CollectibleStandards/ERC721/ERC721Standard';
import { ERC20Standard } from './ERC20Standard';

export class NonStandardFallback {
  private erc20Standard: ERC20Standard;

  private erc721Standard: ERC721Standard;

  constructor({
    erc20Standard,
    erc721Standard,
  }: {
    erc20Standard: ERC20Standard;
    erc721Standard: ERC721Standard;
  }) {
    this.erc20Standard = erc20Standard;
    this.erc721Standard = erc721Standard;
  }

  /**
   * Query for useful values if a contract does not fully implement one of the three major token interfaces we support (ERC20, ERC721, ERC1155).
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param userAddress - The public address for the currently active user's account.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, decimals, symbol and balance of the given contract/userAddress pair.
   */
  async getDetails(
    address: string,
    ipfsGateway: string,
    userAddress?: string,
    tokenId?: string,
  ): Promise<{
    standard: string;
    symbol: string | undefined;
    decimals: string | undefined;
    balance: BN | undefined;
    name: string | undefined;
    tokenURI: string | undefined;
    image: string | undefined;
  }> {
    let decimals, symbol, balance, name, image, tokenURI;

    try {
      decimals = await this.erc20Standard.getTokenDecimals(address);
    } catch {
      // ignore
    }

    try {
      decimals = await this.erc20Standard.getTokenSymbol(address);
    } catch {
      // ignore
    }

    if (userAddress) {
      try {
        balance = await this.erc20Standard.getBalanceOf(address, userAddress);
      } catch {
        // ignore
      }
    }

    try {
      name = await this.erc721Standard.getAssetName(address);
    } catch {
      // ignore
    }

    if (tokenId) {
      ({ tokenURI, image } = await this.erc721Standard.getTokenURIAndImage(
        address,
        ipfsGateway,
        tokenId,
      ));
    }

    return {
      standard: UNKNOWN_STANDARD,
      decimals,
      symbol,
      balance,
      name,
      tokenURI,
      image,
    };
  }
}
