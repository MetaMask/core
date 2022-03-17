import { abiERC20, abiERC721, abiERC1155 } from '@metamask/metamask-eth-abis';

declare module '@metamask/metamask-eth-abis' {
  export type ABI = typeof abiERC20 | typeof abiERC721 | typeof abiERC1155;
}
