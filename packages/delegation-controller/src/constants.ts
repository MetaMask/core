import { SIGNABLE_DELEGATION_TYPED_DATA as SDK_SIGNABLE_DELEGATION_TYPED_DATA } from './sdk';

const EIP712Domain = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

export const SIGNABLE_DELEGATION_TYPED_DATA = {
  EIP712Domain,
  ...SDK_SIGNABLE_DELEGATION_TYPED_DATA,
};
