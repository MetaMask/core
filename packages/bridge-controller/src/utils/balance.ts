import { getAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';

import { isNativeAddress } from './bridge';

const fetchTokenBalance = async (
  address: string,
  userAddress: string,
  ethersProvider: JsonRpcProvider,
): Promise<BigNumber | undefined> => {
  const tokenContract = new Contract(address, abiERC20, ethersProvider);
  const tokenBalancePromise =
    typeof tokenContract?.balanceOf === 'function'
      ? tokenContract.balanceOf(userAddress)
      : Promise.resolve(undefined);
  return await tokenBalancePromise;
};

/**
 * Calculates the latest balance of a token for a given address.
 *
 * @param providerRpcUrl - The RPC URL of the provider.
 * @param selectedAddress - The address to calculate the balance for.
 * @param tokenAddress - The address of the token to calculate the balance for.
 * @returns The stringified balance of the token for the given address.
 */
export const calcLatestSrcBalance = async (
  providerRpcUrl: string,
  selectedAddress: string,
  tokenAddress: string,
): Promise<string | undefined> => {
  const provider = new JsonRpcProvider(providerRpcUrl);
  if (tokenAddress) {
    if (isNativeAddress(tokenAddress)) {
      return (
        await provider.getBalance(getAddress(selectedAddress))
      ).toString();
    }
    return (
      await fetchTokenBalance(tokenAddress, selectedAddress, provider)
    )?.toString();
  }
  return undefined;
};
// TODO add to changelog

export const hasSufficientBalance = async (
  providerRpcUrl: string,
  selectedAddress: string,
  tokenAddress: string,
  fromTokenAmount: string,
) => {
  const srcTokenBalance = await calcLatestSrcBalance(
    providerRpcUrl,
    selectedAddress,
    tokenAddress,
  );

  return srcTokenBalance
    ? BigNumber.from(srcTokenBalance).gte(fromTokenAmount)
    : false;
};
