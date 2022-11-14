import { Contract } from '@ethersproject/contracts';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { BN, toUtf8 } from 'ethereumjs-util';
import { AbiCoder } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { ERC20, hexToBN } from '@metamask/controller-utils';
import { ethersBigNumberToBN } from '../assetsUtil';

export class ERC20Standard {
  private provider: Web3Provider;

  constructor(provider: Web3Provider) {
    this.provider = provider;
  }

  /**
   * Get balance or count for current account on specific asset contract.
   *
   * @param address - Asset ERC20 contract address.
   * @param selectedAddress - Current account public address.
   * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
   */
  async getBalanceOf(address: string, selectedAddress: string): Promise<BN> {
    const contract = new Contract(address, abiERC20, this.provider);
    const balance = await contract.balanceOf(selectedAddress);
    return ethersBigNumberToBN(balance);
  }

  /**
   * Query for the decimals for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract string.
   * @returns Promise resolving to the 'decimals'.
   */
  async getTokenDecimals(address: string): Promise<string> {
    // Signature for calling `decimals()`
    const payload = { to: address, data: '0x313ce567' };
    const result = await this.provider.call(payload);
    const resultString = hexToBN(result).toString();
    // We treat empty string or 0 as invalid
    if (resultString.length > 0 && resultString !== '0') {
      return resultString;
    }

    throw new Error('Failed to parse token decimals');
  }

  /**
   * Query for symbol for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract address.
   * @returns Promise resolving to the 'symbol'.
   */
  async getTokenSymbol(address: string): Promise<string> {
    // Signature for calling `symbol()`
    const payload = { to: address, data: '0x95d89b41' };
    const result = await this.provider.call(payload);

    const abiCoder = new AbiCoder();

    // Parse as string - treat empty string as failure
    try {
      const decoded = abiCoder.decode(['string'], result)[0];
      if (decoded?.length > 0) {
        return decoded;
      }
    } catch {
      // Ignore error
    }

    // Parse as bytes - treat empty string as failure
    try {
      const utf8 = toUtf8(result);
      if (utf8.length > 0) {
        return utf8;
      }
    } catch {
      // Ignore error
    }

    throw new Error('Failed to parse token symbol');
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
