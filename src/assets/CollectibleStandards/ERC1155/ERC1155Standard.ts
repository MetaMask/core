const ERC1155_METADATA_URI_INTERFACE_ID = '0x0e89341c';
const ERC1155_TOKEN_RECEIVER_INTERFACE_ID = '0x4e2312e0';

export class ERC1155Standard {
  /**
   * Query if contract implements ERC1155 URI Metadata interface.
   *
   * @param contract - ERC1155 asset contract.
   * @returns Promise resolving to whether the contract implements ERC1155 URI Metadata interface.
   */
  contractSupportsURIMetadataInterface = async (
    contract: any,
  ): Promise<boolean> => {
    return this.contractSupportsInterface(
      contract,
      ERC1155_METADATA_URI_INTERFACE_ID,
    );
  };

  /**
   * Query if contract implements ERC1155 Token Receiver interface.
   *
   * @param contract - ERC1155 asset contract.
   * @returns Promise resolving to whether the contract implements ERC1155 Token Receiver interface.
   */
  contractSupportsTokenReceiverInterface = async (
    contract: any,
  ): Promise<boolean> => {
    return this.contractSupportsInterface(
      contract,
      ERC1155_TOKEN_RECEIVER_INTERFACE_ID,
    );
  };

  /**
   * Query for tokenURI for a given asset.
   *
   * @param contract - ERC1155 asset contract.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'tokenURI'.
   */
  getCollectibleURI = async (
    contract: any,
    tokenId: string,
  ): Promise<string> => {
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
   * @param contract - ERC1155 asset contract.
   * @param address - Wallet public address.
   * @param tokenId - ERC1155 asset identifier.
   * @returns Promise resolving to the 'balanceOf'.
   */
  getBalanceOf = async (
    contract: any,
    address: string,
    tokenId: string,
  ): Promise<number> => {
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
   * Query if a contract implements an interface.
   *
   * @param contract - ERC1155 asset contract.
   * @param interfaceId - Interface identifier.
   * @returns Promise resolving to whether the contract implements `interfaceID`.
   */
  private contractSupportsInterface = async (
    contract: any,
    interfaceId: string,
  ): Promise<boolean> => {
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
}
