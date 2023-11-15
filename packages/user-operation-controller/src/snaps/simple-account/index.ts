/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable n/no-process-env */

import { Web3Provider } from '@ethersproject/providers';
import { createModuleLogger } from '@metamask/utils';

import { ENTRYPOINT } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  OnPaymasterHandler,
  OnUserOperationHandler,
  OnUserOperationSignatureHandler,
} from '../types';
import { BUNDLER_URL_BY_CHAIN_ID } from './constants';
import { signUserOperation } from './ecdsa';
import {
  getCallData,
  getDummySignature,
  getInitCode,
  getNonce,
  getSender,
} from './SimpleAccount';
import {
  getDummyPaymasterAndData,
  getPaymasterAndData,
} from './VerifyingPaymaster';

const log = createModuleLogger(projectLogger, 'simple-account-snap');

const onUserOperationRequest: OnUserOperationHandler = async (request) => {
  log('Received user operation request');

  const { chainId, data, ethereum, to, value } = request;

  const provider = new Web3Provider(ethereum as any);

  const potentialInitCode = getInitCode(
    process.env.SIMPLE_ACCOUNT_OWNER!,
    process.env.SIMPLE_ACCOUNT_SALT!,
  );

  const sender = await getSender(potentialInitCode, provider);
  const callData = getCallData(to, value, data, sender);
  const code = await provider.getCode(sender);
  const isDeployed = Boolean(code) && code !== '0x';
  const initCode = isDeployed ? '0x' : potentialInitCode;
  const nonce = await getNonce(sender, isDeployed, provider);
  const bundler = getBundler(chainId);
  const dummySignature = getDummySignature();
  const dummyPaymasterAndData = getDummyPaymasterAndData();

  return {
    bundler,
    callData,
    dummyPaymasterAndData,
    dummySignature,
    initCode,
    nonce,
    sender,
  };
};

const onPaymasterRequest: OnPaymasterHandler = async (request) => {
  log('Received paymaster request', {
    paymasterAddress: process.env.PAYMASTER_ADDRESS,
  });

  const { userOperation, ethereum, privateKey } = request;
  const provider = new Web3Provider(ethereum as any);
  const paymasterAddress = process.env.PAYMASTER_ADDRESS;

  const paymasterAndData = paymasterAddress
    ? await getPaymasterAndData(
        paymasterAddress,
        0,
        0,
        userOperation,
        privateKey,
        provider,
      )
    : '0x';

  if (!paymasterAddress) {
    log('Skipping paymaster');
  }

  return { paymasterAndData };
};

const onUserOperationSignatureRequest: OnUserOperationSignatureHandler = async (
  request,
) => {
  log('Received user operation signature request');

  const { chainId, privateKey, userOperation } = request;

  const signature = await signUserOperation(
    userOperation,
    ENTRYPOINT,
    chainId,
    privateKey,
  );

  return {
    signature,
  };
};

function getBundler(chainId: string): string | undefined {
  return (BUNDLER_URL_BY_CHAIN_ID as any)[chainId];
}

export default {
  onUserOperationRequest,
  onPaymasterRequest,
  onUserOperationSignatureRequest,
};
