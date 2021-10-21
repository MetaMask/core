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
  uri = async (contract: any, tokenId: string): Promise<string> => {
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
   * Transfer single ERC1155 token.
   * When minting/creating tokens, the from arg MUST be set to 0x0 (i.e. zero address).
   * When burning/destroying tokens, the to arg MUST be set to 0x0 (i.e. zero address).
   *
   * @param contract - ERC1155 asset contract.
   * @param operator - ERC1155 token address.
   * @param from - ERC1155 token holder.
   * @param to - ERC1155 token recipient.
   * @param id - ERC1155 token id.
   * @param value - Number of tokens to be sent.
   * @returns Promise resolving to the 'transferSingle'.
   */
  transferSingle = async (
    contract: any,
    operator: string,
    from: string,
    to: string,
    id: string,
    value: string,
  ): Promise<void> => {
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
