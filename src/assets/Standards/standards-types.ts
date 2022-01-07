import { abiERC20, abiERC1155, abiERC721 } from '@metamask/metamask-eth-abis';

type Address = `0x${string}`;
type Contract = {
  at: Address;
};

export type Web3 = {
  eth: {
    contract(
      abi: typeof abiERC20 | typeof abiERC721 | typeof abiERC1155,
    ): Contract;
  };
};
