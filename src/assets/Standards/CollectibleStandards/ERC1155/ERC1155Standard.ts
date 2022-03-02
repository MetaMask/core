import { abiERC1155 } from '@metamask/metamask-eth-abis';
import {
  ERC1155,
  ERC1155_INTERFACE_ID,
  ERC1155_METADATA_URI_INTERFACE_ID,
  ERC1155_TOKEN_RECEIVER_INTERFACE_ID,
} from '../../../../constants';
import {
  getFormattedIpfsUrl,
  timeoutFetch,
} from '../../../../util';
import { Web3 } from '../../standards-types';

export class ERC1155Standard {
  private web3: Web3;

  constructor(web3: Web3) {
    this.web3 = web3;
  }

  /**
   * Query if contract implements ERC1155 URI Metadata interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
   */
  contractSupportsURIMetadataInterface = async (
    address: string,
  ): Promise<boolean> => {
    return this.contractSupportsInterface(
      address,
      ERC1155_METADATA_URI_INTERFACE_ID,
    );
  };

  /**
   * Query if contract implements ERC1155 Token Receiver interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
   */
  contractSupportsTokenReceiverInterface = async (
    address: string,
  ): Promise<boolean> => {
    return this.contractSupportsInterface(
      address,
      ERC1155_TOKEN_RECEIVER_INTERFACE_ID,
    );
  };

  /**
   * Query if contract implements ERC1155 interface.
   *
   * @param address - ERC1155 asset contract address.
   * @returns Promise resolving to whether the contract implements the base ERC1155 interface.
   */
  contractSupportsBase1155Interface = async (
    address: string,
  ): Promise<boolean> => {
    return this.contractSupportsInterface(address, ERC1155_INTERFACE_ID);
  };

  /**
   * Query for tokenURI for a given asset.
   *
   * @param address - ERC1155 asset contract address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  getTokenURI = async (address: string, tokenId: string): Promise<string> => {
    const contract = this.web3.eth.contract(abiERC1155).at(address);
    return new Promise<string>((resolve, reject) => {
      contract.uri(tokenId, (error: Error, result: string) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  };

  /**
   * Query for balance of a given ERC1155 token.
   *
   * @param contractAddress - ERC1155 asset contract address.
   * @param address - Wallet public address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'balanceOf'.
   */
  getBalanceOf = async (
    contractAddress: string,
    address: string,
    tokenId: string,
  ): Promise<number> => {
    const contract = this.web3.eth.contract(abiERC1155).at(contractAddress);
    return new Promise<number>((resolve, reject) => {
      contract.balanceOf(address, tokenId, (error: Error, result: number) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  };

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
  transferSingle = async (
    operator: string,
    from: string,
    to: string,
    id: string,
    value: string,
  ): Promise<void> => {
    const contract = this.web3.eth.contract(abiERC1155).at(operator);
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
  };

  /**
   * Query if a contract implements an interface.
   *
   * @param address - ERC1155 asset contract address.
   * @param interfaceId - Interface identifier.
   * @returns Promise resolving to whether the contract implements `interfaceID`.
   */
  private contractSupportsInterface = async (
    address: string,
    interfaceId: string,
  ): Promise<boolean> => {
    const contract = this.web3.eth.contract(abiERC1155).at(address);
    return new Promise<boolean>((resolve, reject) => {
      contract.supportsInterface(
        interfaceId,
        (error: Error, result: boolean) => {
          /* istanbul ignore if */
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        },
      );
    });
  };

  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param ipfsGateway - The user's preferred IPFS gateway.
   * @param tokenId - tokenId of a given token in the contract.
   * @returns Promise resolving an object containing the standard, tokenURI, symbol and name of the given contract/tokenId pair.
   */
  getDetails = async (
    address: string,
    ipfsGateway: string,
    tokenId?: string,
  ): Promise<{
    standard: string;
    tokenURI: string | undefined;
    image: string | undefined;
  }> => {
    const isERC1155 = await this.contractSupportsBase1155Interface(address);
    let tokenURI, image;

    if (tokenId) {
      tokenURI = await this.getTokenURI(address, tokenId);
      if (tokenURI.startsWith('ipfs://')) {
        tokenURI = getFormattedIpfsUrl(ipfsGateway, tokenURI, true);
      }

      try {
        const response = await timeoutFetch(tokenURI);
        const object = await response.json();
        image = object?.image;
        if (image?.startsWith('ipfs://')) {
          image = getFormattedIpfsUrl(ipfsGateway, image, true);
        }
      } catch {
        // ignore
      }
    }

    // TODO consider querying to the metadata to get name.
    if (isERC1155) {
      return {
        standard: ERC1155,
        tokenURI,
        image,
      };
    }

    throw new Error("This isn't a valid ERC1155 contract");
  };
}
