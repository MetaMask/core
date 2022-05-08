import { abiERC20, abiERC1155, abiERC721 } from '@metamask/metamask-eth-abis';
declare type Contract = {
    at(address: string): any;
};
export declare type Web3 = {
    eth: {
        contract(abi: typeof abiERC20 | typeof abiERC721 | typeof abiERC1155): Contract;
    };
};
export {};
