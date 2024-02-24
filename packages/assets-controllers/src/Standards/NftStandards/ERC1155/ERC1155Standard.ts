import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import {
  ERC1155,
  ERC1155_INTERFACE_ID,
  ERC1155_METADATA_URI_INTERFACE_ID,
  ERC1155_TOKEN_RECEIVER_INTERFACE_ID,
  safelyExecute,
  timeoutFetch,
} from '@metamask/controller-utils';
import { abiERC1155 } from '@metamask/metamask-eth-abis';
import type * as BN from 'bn.js';

import { getFormattedIpfsUrl, ethersBigNumberToBN } from '../../../assetsUtil';

export class ERC1155Standard {
  private readonly provider: Web3Provider;

  constructor(provider: Web3Provider) {
    this.provider = provider;
  }

  /**
   * Query if contract implements ERC1155 URI Metadata interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
   */
  async contractSupportsURIMetadataInterface(
    address: string,
  ): Promise<boolean> {
    return this.contractSupportsInterface(
      address,
      ERC1155_METADATA_URI_INTERFACE_ID,
    );
  }

  /**
   * Query if contract implements ERC1155 Token Receiver interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
   */
  async contractSupportsTokenReceiverInterface(
    address: string,
  ): Promise<boolean> {
    return this.contractSupportsInterface(
      address,
      ERC1155_TOKEN_RECEIVER_INTERFACE_ID,
    );
  }

  /**
   * Query if contract implements ERC1155 interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements the base ERC1155 interface.
   */
  async contractSupportsBase1155Interface(address: string): Promise<boolean> {
    return this.contractSupportsInterface(address, ERC1155_INTERFACE_ID);
  }

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  async getTokenURI(address: string, tokenId: string): Promise<string> {
    const contract = new Contract(address, abiERC1155, this.provider);
    return contract.uri(tokenId);
  }

  /**
   * Query for balance of a given ERC1155 token.
   *
   * @param contractAddress - ERC1155 asset contract address.
   * @param address - Wallet public address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'balanceOf'.
   */
  async getBalanceOf(
    contractAddress: string,
    address: string,
    tokenId: string,
  ): Promise<BN> {
    const contract = new Contract(contractAddress, abiERC1155, this.provider);
    const balance = await contract.balanceOf(address, tokenId);
    return ethersBigNumberToBN(balance);
  }

  /**
   * Transfer single ERC1155 token.
   * When minting/creating tokens, the from arg MUST be set to 0x0 (i.e. zero address).
   * When burning/destroying tokens, the to arg MUST be set to 0x0 (i.e. zero address).
   *
   * @param operator - ERC1155 token address.
   * @param from - ERC1155 token holder.
   * @param to - ERC1155 token recipient.
   * @param id - ERC1155 token id.
   * @param value - Number of tokens to be sent.
   * @returns Promise resolving to the 'transferSingle'.
   */
  async transferSingle(
    operator: string,
    from: string,
    to: string,
    id: string,
    value: string,
  ): Promise<void> {
    const contract = new Contract(operator, abiERC1155, this.provider);
    return new Promise<void>((resolve, reject) => {
      contract.transferSingle(
        operator,
        from,
        to,
        id,
        value,
        (error: Error, result: void) => {
          /* istanbul ignore if */
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        },
      );
    });
  }

  /**
   * Query for symbol for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getAssetSymbol(address: string): Promise<string> {
    const contract = new Contract(
      address,
      // Contract ABI fragment containing only the symbol method to fetch the symbol of the contract.
      [
        {
          inputs: [],
          name: 'symbol',
          outputs: [{ name: '_symbol', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
          payable: false,
        },
      ],
      this.provider,
    );
    return contract.symbol();
  }

  /**
   * Query for name for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to the 'name'.
   */
  async getAssetName(address: string): Promise<string> {
    const contract = new Contract(
      address,
      // Contract ABI fragment containing only the name method to fetch the name of the contract.
      [
        {
          inputs: [],
          name: 'name',
          outputs: [{ name: '_name', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
          payable: false,
        },
      ],
      this.provider,
    );
    return contract.name();
  }

  /**
   * Query if a contract implements an interface.
   *
   * @param address - ERC1155 asset contract address.
   * @param interfaceId - Interface identifier.
   * @returns Promise resolving to whether the contract implements `interfaceID`.
   */
  private async contractSupportsInterface(
    address: string,
    interfaceId: string,
  ): Promise<boolean> {
    const contract = new Contract(address, abiERC1155, this.provider);
    return contract.supportsInterface(interfaceId);
  }

  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
   */
  async getDetails(
    address: string,
    ipfsGateway: string,
    tokenId?: string,
  ): Promise<{
    standard: string;
    tokenURI: string | undefined;
    image: string | undefined;
    name: string | undefined;
    symbol: string | undefined;
  }> {
    const isERC1155 = await this.contractSupportsBase1155Interface(address);

    if (!isERC1155) {
      throw new Error("This isn't a valid ERC1155 contract");
    }

    let image;

    const [symbol, name, tokenURI] = await Promise.all([
      safelyExecute(() => this.getAssetSymbol(address)),
      safelyExecute(() => this.getAssetName(address)),
      tokenId
        ? safelyExecute(() =>
            this.getTokenURI(address, tokenId).then((uri) =>
              uri.startsWith('ipfs://')
                ? getFormattedIpfsUrl(ipfsGateway, uri, true)
                : uri,
            ),
          )
        : undefined,
    ]);

    if (tokenURI) {
      try {
        const response = await timeoutFetch(tokenURI);
        const object = await response.json();
        image = object?.image;
        if (image?.startsWith('ipfs://')) {
          image = getFormattedIpfsUrl(ipfsGateway, image, true);
        }
      } catch {
        // Catch block should be kept empty to ignore exceptions, and
        // pass as much information as possible to the return statement
      }
    }

    // TODO consider querying to the metadata to get name.
    return {
      standard: ERC1155,
      tokenURI,
      image,
      symbol,
      name,
    };
  }
}
