import { abiERC20 } from '@metamask/metamask-eth-abis';
import { BN, stripHexPrefix, toUtf8 } from 'ethereumjs-util';
import { ERC20 } from '../../constants';
import { Web3 } from './standards-types';

export class ERC20Standard {
  private web3: Web3;

  constructor(web3: Web3) {
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
    const contract = this.web3.eth.contract(abiERC20).at(address);
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
   * @param address - ERC20 asset contract string.
   * @returns Promise resolving to the 'decimals'.
   */
  async getTokenDecimals(address: string): Promise<string> {
    const contract = this.web3.eth.contract(abiERC20).at(address);
    return new Promise<string>((resolve, reject) => {
      contract.decimals((error: Error, result: BN | string) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        resolve(result.toString());
      });
    });
  }

  /**
   * Query for symbol for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getTokenSymbol(address: string): Promise<string> {
    const payload = { to: address, data: '0x95d89b41' }
    return new Promise<string>((resolve, reject) => {
      this.web3.eth.call(payload, undefined, (error: Error, result: string) => {
        /* istanbul ignore if */
        if (error) {
          reject(error);
          return;
        }
        // Parse as string
        try {
          const stripped = stripHexPrefix(result);
          const stringLength = new BN(stripped.slice(64, 128), 16).toNumber();
          const stringValue = stripped.slice(128, 128 + (stringLength * 2));
          if (stringValue.length > 0) {
            resolve(toUtf8(stringValue));
            return;
          }
        } catch {
        }

        try {
          // Parse as bytes
          const utf8 = toUtf8(result);
          resolve(utf8);
          return;
        } catch {
        }

        reject(new Error('Failed to parse token symbol'));
      });
    });
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
