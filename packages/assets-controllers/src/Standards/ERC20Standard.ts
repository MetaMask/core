import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import { decodeSingle } from '@metamask/abi-utils';
import { ERC20 } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { assertIsStrictHexString } from '@metamask/utils';
import type * as BN from 'bn.js';
import { toUtf8 } from 'ethereumjs-util';

import { ethersBigNumberToBN } from '../assetsUtil';

export class ERC20Standard {
  private readonly provider: Web3Provider;

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
    const contract = new Contract(address, abiERC20, this.provider);
    try {
      const decimals = await contract.decimals();
      return decimals.toString();
    } catch (err) {
      // Mirror previous implementation
      if (
        err instanceof Error &&
        err.message.includes('call revert exception')
      ) {
        throw new Error('Failed to parse token decimals');
      }
      throw err;
    }
  }

  /**
   * Query for the name for a given ERC20 asset.
   *
   * @param address - ERC20 asset contract string.
   * @returns Promise resolving to the 'name'.
   */
  async getTokenName(address: string): Promise<string> {
    const contract = new Contract(address, abiERC20, this.provider);
    try {
      const name = await contract.name();
      return name.toString();
    } catch (err) {
      // Mirror previous implementation
      if (
        err instanceof Error &&
        err.message.includes('call revert exception')
      ) {
        throw new Error('Failed to parse token name');
      }
      throw err;
    }
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
    assertIsStrictHexString(result);
    // Parse as string - treat empty string as failure
    try {
      const decoded = decodeSingle('string', result);
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
    const [decimals, symbol, balance] = await Promise.all([
      this.getTokenDecimals(address),
      this.getTokenSymbol(address),
      userAddress ? this.getBalanceOf(address, userAddress) : undefined,
    ]);
    return {
      decimals,
      symbol,
      balance,
      standard: ERC20,
    };
  }
}
