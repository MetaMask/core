/* eslint-disable jsdoc/require-jsdoc */

import { AddressZero } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import { stripHexPrefix } from 'ethereumjs-util';

import { ENTRYPOINT } from '../../constants';
import { projectLogger, createModuleLogger } from '../../logger';
import EntrypointABI from './abi/Entrypoint.json';
import SimpleAccountABI from './abi/SimpleAccount.json';
import SimpleAccountFactoryABI from './abi/SimpleAccountFactory.json';
import { DUMMY_SIGNATURE } from './constants';

const log = createModuleLogger(projectLogger, 'simple-account');

const SIMPLE_ACCOUNT_FACTORY_ADDRESS =
  '0x9406Cc6185a346906296840746125a0E44976454';

export function getInitCode(owner: string, salt: string): string {
  const SimpleAccountFactoryContract = new Contract(
    SIMPLE_ACCOUNT_FACTORY_ADDRESS,
    SimpleAccountFactoryABI,
  );

  const initCode =
    SIMPLE_ACCOUNT_FACTORY_ADDRESS +
    stripHexPrefix(
      SimpleAccountFactoryContract.interface.encodeFunctionData(
        'createAccount',
        [owner, salt],
      ),
    );

  log('Generated init code', {
    initCode,
    owner,
    salt,
  });

  return initCode;
}

export async function getSender(
  initCode: string,
  provider: Web3Provider,
): Promise<string> {
  const entrypointContract = new Contract(ENTRYPOINT, EntrypointABI, provider);

  const sender = await entrypointContract.callStatic
    .getSenderAddress(initCode)
    .catch((error) => error.errorArgs.sender);

  log('Determined sender', sender);

  return sender;
}

export function getCallData(
  to: string | undefined,
  value: string | undefined,
  data: string | undefined,
  sender: string,
): string {
  const simpleAccountContract = new Contract(sender, SimpleAccountABI);

  return simpleAccountContract.interface.encodeFunctionData('execute', [
    to ?? AddressZero,
    value ?? '0x0',
    data ?? '0x',
  ]);
}

export async function getNonce(
  sender: string,
  isDeployed: boolean,
  provider: Web3Provider,
): Promise<string> {
  const simpleAccountContract = new Contract(
    sender,
    SimpleAccountABI,
    provider,
  );

  const nonce = isDeployed
    ? (await simpleAccountContract.getNonce()).toHexString()
    : '0x0';

  if (isDeployed) {
    log('Retrieved nonce from smart contract', nonce);
  }

  return nonce;
}

export function getDummySignature(): string {
  return DUMMY_SIGNATURE;
}
