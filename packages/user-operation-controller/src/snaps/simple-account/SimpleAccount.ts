import { Web3Provider } from '@ethersproject/providers';
import { OnUserOperationHandler } from '../types';
import SimpleAccountABI from './abi/SimpleAccount.json';
import SimpleAccountFactoryABI from './abi/SimpleAccountFactory.json';
import EntrypointABI from './abi/Entrypoint.json';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';
import { ENTRYPOINT } from '../../constants';
import { projectLogger, createModuleLogger } from '../../logger';
import { stripHexPrefix } from 'ethereumjs-util';

const log = createModuleLogger(projectLogger, 'simple-account-snap');

const SIMPLE_ACCOUNT_FACTORY_ADDRESS =
  '0x9406Cc6185a346906296840746125a0E44976454';

export const onUserOperationRequest: OnUserOperationHandler = async (
  request,
) => {
  const { data, ethereum, to, value } = request;

  const SimpleAccountFactoryContract = new Contract(
    SIMPLE_ACCOUNT_FACTORY_ADDRESS,
    SimpleAccountFactoryABI,
  );

  const potentialInitCode =
    SIMPLE_ACCOUNT_FACTORY_ADDRESS +
    stripHexPrefix(
      SimpleAccountFactoryContract.interface.encodeFunctionData(
        'createAccount',
        [process.env.SIMPLE_ACCOUNT_OWNER, process.env.SIMPLE_ACCOUNT_SALT],
      ),
    );

  log('Generated init code', {
    potentialInitCode,
    owner: process.env.SIMPLE_ACCOUNT_OWNER,
    salt: process.env.SIMPLE_ACCOUNT_SALT,
  });

  const provider = new Web3Provider(ethereum as any);
  const entrypointContract = new Contract(ENTRYPOINT, EntrypointABI, provider);

  const sender = await entrypointContract.callStatic
    .getSenderAddress(potentialInitCode)
    .catch((error) => error.errorArgs.sender);

  log('Determined sender', sender);

  const simpleAccountContract = new Contract(
    sender,
    SimpleAccountABI,
    provider,
  );

  const code = await provider.getCode(sender);
  const isDeployed = code && code !== '0x';
  const initCode = isDeployed ? '0x' : potentialInitCode;

  if (!isDeployed) {
    log('Adding init code as contract not deployed');
  }

  const callData = simpleAccountContract.interface.encodeFunctionData(
    'execute',
    [to ?? AddressZero, value ?? '0x0', data ?? '0x'],
  );

  const nonce = isDeployed
    ? (await simpleAccountContract.getNonce()).toHexString()
    : '0x0';

  if (isDeployed) {
    log('Retrieved nonce from smart contract', nonce);
  }

  // Paymaster not supported
  const paymasterAndData = '0x';

  return {
    callData,
    initCode,
    nonce,
    paymasterAndData,
    sender,
  };
};
