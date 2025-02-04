import { Web3Provider } from '@ethersproject/providers';
import type { Provider } from '@metamask/network-controller';
import { Hex } from '@metamask/utils';
import { Contract } from '@ethersproject/contracts';
import { zeroAddress } from 'ethereumjs-util';
import { getAddress } from 'ethers/lib/utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { BigNumber } from 'ethers';

export async function fetchTokenBalance(
  address: string,
  userAddress: string,
  provider: Provider,
): Promise<BigNumber> {
  const ethersProvider = new Web3Provider(provider);
  const tokenContract = new Contract(address, abiERC20, ethersProvider);
  const tokenBalancePromise = tokenContract
    ? tokenContract.balanceOf(userAddress)
    : Promise.resolve();
  return await tokenBalancePromise;
}

export const calcLatestSrcBalance = async (
  provider: Provider,
  selectedAddress: string,
  tokenAddress: string,
  chainId: Hex,
): Promise<BigNumber | undefined> => {
  if (tokenAddress && chainId) {
    if (tokenAddress === zeroAddress()) {
      const ethersProvider = new Web3Provider(provider);
      return await ethersProvider.getBalance(getAddress(selectedAddress))
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

  return (
    srcTokenBalance?.gte(fromTokenAmount) ?? false
  );
};
