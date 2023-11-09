import { Web3Provider } from '@ethersproject/providers';
import { OnUserOperationHandler } from '../types';
import SimpleAccountABI from './abi.json';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';

export const onUserOperationRequest: OnUserOperationHandler = async (
  request,
) => {
  const { data, ethereum, sender, to, value } = request;

  const simpleAccountContract = new Contract(
    sender,
    SimpleAccountABI,
    new Web3Provider(ethereum as any),
  );

  const callData = simpleAccountContract.interface.encodeFunctionData(
    'execute',
    [to ?? AddressZero, value, data ?? '0x'],
  );

  const nonce = (await simpleAccountContract.getNonce()).toHexString();

  // Paymaster not supported
  const paymasterAndData = '0x';

  return {
    callData,
    nonce,
    paymasterAndData,
  };
};
