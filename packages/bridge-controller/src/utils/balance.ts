import { getAddress } from '@ethersproject/address';
import type { BigNumber } from '@ethersproject/bignumber';
import { AddressZero } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

export const fetchTokenBalance = async (
  address: string,
  userAddress: string,
  provider: Provider,
): Promise<BigNumber | undefined> => {
  const ethersProvider = new Web3Provider(provider);
  const tokenContract = new Contract(address, abiERC20, ethersProvider);
  const tokenBalancePromise =
    typeof tokenContract?.balanceOf === 'function'
      ? tokenContract.balanceOf(userAddress)
      : Promise.resolve(undefined);
  return await tokenBalancePromise;
};

export const calcLatestSrcBalance = async (
  provider: Provider,
  selectedAddress: string,
  tokenAddress: string,
  chainId: Hex,
): Promise<BigNumber | undefined> => {
  if (tokenAddress && chainId) {
    if (tokenAddress === AddressZero) {
      const ethersProvider = new Web3Provider(provider);
      return await ethersProvider.getBalance(getAddress(selectedAddress));
    }
    return await fetchTokenBalance(tokenAddress, selectedAddress, provider);
  }
  return undefined;
};

export const hasSufficientBalance = async (
  provider: Provider,
  selectedAddress: string,
  tokenAddress: string,
  fromTokenAmount: string,
  chainId: Hex,
) => {
  const srcTokenBalance = await calcLatestSrcBalance(
    provider,
    selectedAddress,
    tokenAddress,
    chainId,
  );

  return srcTokenBalance ? srcTokenBalance.gte(fromTokenAmount) : false;
};
