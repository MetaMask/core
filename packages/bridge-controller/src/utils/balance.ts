import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { zeroAddress } from 'ethereumjs-util';
import { BrowserProvider, Contract, getAddress } from 'ethers';

export const fetchTokenBalance = async (
  address: string,
  userAddress: string,
  provider: Provider,
): Promise<bigint> => {
  const ethersProvider = new BrowserProvider(provider);
  const tokenContract = new Contract(address, abiERC20, ethersProvider);
  const tokenBalancePromise = tokenContract
    ? tokenContract.balanceOf(userAddress)
    : Promise.resolve();
  return await tokenBalancePromise;
};

export const calcLatestSrcBalance = async (
  provider: Provider,
  selectedAddress: string,
  tokenAddress: string,
  chainId: Hex,
): Promise<bigint | undefined> => {
  if (tokenAddress && chainId) {
    if (tokenAddress === zeroAddress()) {
      const ethersProvider = new BrowserProvider(provider);
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

  return srcTokenBalance ? srcTokenBalance >= BigInt(fromTokenAmount) : false;
};
