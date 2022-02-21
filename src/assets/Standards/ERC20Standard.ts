import { abiERC20 } from '@metamask/metamask-eth-abis';
import { BN } from 'ethereumjs-util';
import { ERC20 } from '../../constants';

export class ERC20Standard {
  private web3: any;

  constructor(web3: any) {
    this.web3 = web3;
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
      contract.methods
        .balanceOf(selectedAddress)
        .call((error: Error, result: BN) => {
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
   * Query for the decimals for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract string.
   * @returns Promise resolving to the 'decimals'.
   */
  async getTokenDecimals(address: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC20, address);
    return await contract.methods.decimals().call();
  }

  /**
   * Query for symbol for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getTokenSymbol(address: string): Promise<string> {
    const contract = new this.web3.eth.Contract(abiERC20, address);
    return await contract.methods.symbol().call();
  }

  /**
   * Query if a contract implements an interface.
   *
   * @param address - Asset contract address.
   * @param userAddress - The public address for the currently active user's account.
   * @returns Promise resolving an object containing the standard, decimals, symbol and balance of the given contract/userAddress pair.
   */
  async getDetails(
    address: string,
    userAddress?: string,
  ): Promise<{
    standard: string;
    symbol: string | undefined;
    decimals: string | undefined;
    balance: BN | undefined;
  }> {
    const [decimals, symbol] = await Promise.all([
      this.getTokenDecimals(address),
      this.getTokenSymbol(address),
    ]);
    let balance;
    if (userAddress) {
      balance = await this.getBalanceOf(address, userAddress);
    }
    return {
      decimals,
      symbol,
      balance,
      standard: ERC20,
    };
  }
}
