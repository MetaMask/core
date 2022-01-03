import { BN } from 'ethereumjs-util';
import { ERC20 } from '../../constants';

export class ERC20Standard {
  /**
   * Get balance or count for current account on specific asset contract.
   *
   * @param contract - Asset ERC20 contract.
   * @param selectedAddress - Current account public address.
   * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
   */
  async getBalanceOf(contract: any, selectedAddress: string): Promise<BN> {
    // const contract = this.web3.eth.contract(abiERC20).at(address);
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
   * Query for the decimals for a given ERC20 asset.
   *
   * @param contract - ERC20 asset contract.
   * @returns Promise resolving to the 'decimals'.
   */
  async getTokenDecimals(contract: any): Promise<string> {
    // const contract = this.web3.eth.contract(abiERC20).at(address);
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
   * Query for symbol for a given ERC20 asset.
   *
   * @param contract - ERC20 asset contract.
   * @returns Promise resolving to the 'symbol'.
   */
  async getTokenSymbol(contract: any): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      contract.symbol((error: Error, result: string) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  async getDetails(contract: any, userAddress: string) {
    const [decimals, symbol, balance] = await Promise.all([
      this.getTokenDecimals(contract),
      this.getTokenSymbol(contract),
      this.getBalanceOf(contract, userAddress),
    ]);
    return {
      decimals,
      symbol,
      balance,
      standard: ERC20,
    };
  }
}
