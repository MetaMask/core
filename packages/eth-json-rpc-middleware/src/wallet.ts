import * as sigUtil from '@metamask/eth-sig-util';
import type {
  JsonRpcMiddleware,
  MiddlewareParams,
} from '@metamask/json-rpc-engine/v2';
import { createScaffoldMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import { isValidHexAddress } from '@metamask/utils';
import type { JsonRpcRequest, Json, Hex } from '@metamask/utils';

import {
  createWalletRequestExecutionPermissionsHandler,
  type ProcessRequestExecutionPermissionsHook,
} from './methods/wallet-request-execution-permissions';
import {
  type ProcessRevokeExecutionPermissionHook,
  createWalletRevokeExecutionPermissionHandler,
} from './methods/wallet-revoke-execution-permission';
import { stripArrayTypeIfPresent } from './utils/common';
import { normalizeTypedMessage, parseTypedMessage } from './utils/normalize';
import {
  resemblesAddress,
  validateAndNormalizeKeyholder as validateKeyholder,
} from './utils/validation';

export type TransactionParams = {
  from: string;
};

export type MessageParams = TransactionParams & {
  data: string;
  signatureMethod?: string;
};

export type TypedMessageParams = MessageParams & {
  version: string;
};

export type TypedMessageV1Params = Omit<TypedMessageParams, 'data'> & {
  data: Record<string, unknown>[];
};

export type WalletMiddlewareOptions = {
  getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
  processDecryptMessage?: (
    msgParams: MessageParams,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processEncryptionPublicKey?: (
    address: string,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processPersonalMessage?: (
    msgParams: MessageParams,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processTransaction?: (
    txParams: TransactionParams,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processSignTransaction?: (
    txParams: TransactionParams,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processTypedMessage?: (
    msgParams: TypedMessageV1Params,
    req: JsonRpcRequest,
    version: string,
  ) => Promise<string>;
  processTypedMessageV3?: (
    msgParams: TypedMessageParams,
    req: JsonRpcRequest,
    version: string,
  ) => Promise<string>;
  processTypedMessageV4?: (
    msgParams: TypedMessageParams,
    req: JsonRpcRequest,
    version: string,
  ) => Promise<string>;
  processRequestExecutionPermissions?: ProcessRequestExecutionPermissionsHook;
  processRevokeExecutionPermission?: ProcessRevokeExecutionPermissionHook;
};

export function createWalletMiddleware({
  getAccounts,
  processDecryptMessage,
  processEncryptionPublicKey,
  processPersonalMessage,
  processTransaction,
  processSignTransaction,
  processTypedMessage,
  processTypedMessageV3,
  processTypedMessageV4,
  processRequestExecutionPermissions,
  processRevokeExecutionPermission,
}: WalletMiddlewareOptions): JsonRpcMiddleware<JsonRpcRequest, Json> {
  if (!getAccounts) {
    throw new Error('opts.getAccounts is required');
  }

  return createScaffoldMiddleware({
    // account lookups
    eth_accounts: lookupAccounts,
    eth_coinbase: lookupDefaultAccount,

    // tx signatures
    eth_sendTransaction: sendTransaction,
    eth_signTransaction: signTransaction,

    // message signatures
    eth_signTypedData: signTypedData,
    eth_signTypedData_v3: signTypedDataV3,
    eth_signTypedData_v4: signTypedDataV4,
    personal_sign: personalSign,
    eth_getEncryptionPublicKey: encryptionPublicKey,
    eth_decrypt: decryptMessage,
    personal_ecRecover: personalRecover,

    // EIP-7715
    wallet_requestExecutionPermissions:
      createWalletRequestExecutionPermissionsHandler({
        processRequestExecutionPermissions,
      }),
    wallet_revokeExecutionPermission:
      createWalletRevokeExecutionPermissionHandler({
        processRevokeExecutionPermission,
      }),
  });

  //
  // account lookups
  //

  async function lookupAccounts({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    return await getAccounts(request);
  }

  async function lookupDefaultAccount({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    const accounts = await getAccounts(request);
    return accounts[0] || null;
  }

  //
  // transaction signatures
  //

  async function sendTransaction({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processTransaction) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params[0] as TransactionParams | undefined;
    const txParams: TransactionParams = {
      ...params,
      from: await validateAndNormalizeKeyholder(params?.from || '', request),
    };
    return await processTransaction(txParams, request);
  }

  async function signTransaction({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processSignTransaction) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params[0] as TransactionParams | undefined;
    const txParams: TransactionParams = {
      ...params,
      from: await validateAndNormalizeKeyholder(params?.from || '', request),
    };
    return await processSignTransaction(txParams, request);
  }

  //
  // message signatures
  //

  async function signTypedData({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processTypedMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params as [
      Record<string, unknown>[],
      string,
      Record<string, string>?,
    ];
    const message = params[0];
    const address = await validateAndNormalizeKeyholder(params[1], request);
    const version = 'V1';
    const extraParams = params[2] || {};
    const msgParams: TypedMessageV1Params = {
      ...extraParams,
      from: address,
      data: message,
      signatureMethod: 'eth_signTypedData',
      version,
    };

    return await processTypedMessage(msgParams, request, version);
  }

  async function signTypedDataV3({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processTypedMessageV3) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params as [string, string];

    const address = await validateAndNormalizeKeyholder(params[0], request);
    const message = normalizeTypedMessage(params[1]);
    validatePrimaryType(message);
    validateVerifyingContract(message);
    const version = 'V3';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
      signatureMethod: 'eth_signTypedData_v3',
    };

    return await processTypedMessageV3(msgParams, request, version);
  }

  async function signTypedDataV4({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processTypedMessageV4) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params as [string, string];

    const address = await validateAndNormalizeKeyholder(params[0], request);
    const message = normalizeTypedMessage(params[1]);
    validatePrimaryType(message);
    validateVerifyingContract(message);
    const version = 'V4';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
      signatureMethod: 'eth_signTypedData_v4',
    };

    return await processTypedMessageV4(msgParams, request, version);
  }

  async function personalSign({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processPersonalMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params as [string, string, TransactionParams?];

    // process normally
    const firstParam = params[0];
    const secondParam = params[1];
    // non-standard "extraParams" to be appended to our "msgParams" obj
    const extraParams = params[2] || {};

    // We initially incorrectly ordered these parameters.
    // To gracefully respect users who adopted this API early,
    // we are currently gracefully recovering from the wrong param order
    // when it is clearly identifiable.
    //
    // That means when the first param is definitely an address,
    // and the second param is definitely not, but is hex.
    let address: string, message: string;
    if (resemblesAddress(firstParam) && !resemblesAddress(secondParam)) {
      address = firstParam;
      message = secondParam;
    } else {
      message = firstParam;
      address = secondParam;
    }
    address = await validateAndNormalizeKeyholder(address, request);

    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
      signatureMethod: 'personal_sign',
    };

    return await processPersonalMessage(msgParams, request);
  }

  async function personalRecover({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params as [string, string];
    const message = params[0];
    const signature = params[1];
    const signerAddress = sigUtil.recoverPersonalSignature({
      data: message,
      signature,
    });

    return signerAddress;
  }

  async function encryptionPublicKey({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processEncryptionPublicKey) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = request.params as [string];

    const address = await validateAndNormalizeKeyholder(params[0], request);

    return await processEncryptionPublicKey(address, request);
  }

  async function decryptMessage({
    request,
  }: MiddlewareParams<JsonRpcRequest>): Promise<Json> {
    if (!processDecryptMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !request.params ||
      !Array.isArray(request.params) ||
      !(request.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }
    const params = request.params as [string, string, Record<string, Json>?];

    const ciphertext: string = params[0];
    const address: string = await validateAndNormalizeKeyholder(
      params[1],
      request,
    );
    const extraParams = params[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: ciphertext,
    };

    return await processDecryptMessage(msgParams, request);
  }

  //
  // utility
  //

  /**
   * Validates the keyholder address, and returns a normalized (i.e. lowercase)
   * copy of it.
   *
   * @param address - The address to validate and normalize.
   * @param req - The request object.
   * @returns The normalized address, if valid. Otherwise, throws
   * an error
   */
  async function validateAndNormalizeKeyholder(
    address: string,
    req: JsonRpcRequest,
  ): Promise<string> {
    return validateKeyholder(address as Hex, req, { getAccounts });
  }
}

/**
 * Validates primary of typedSignMessage, to ensure that it's type definition is present in message.
 *
 * @param data - The data passed in typedSign request.
 */
function validatePrimaryType(data: string) {
  const { primaryType, types } = parseTypedMessage(data);
  if (!types) {
    throw rpcErrors.invalidInput();
  }

  // Primary type can be an array.
  const baseType = stripArrayTypeIfPresent(primaryType);

  // Return if the base type is not defined in the types
  const baseTypeDefinitions = types[baseType];
  if (!baseTypeDefinitions) {
    throw rpcErrors.invalidInput();
  }
}

/**
 * Validates verifyingContract of typedSignMessage.
 *
 * @param data - The data passed in typedSign request.
 * This function allows the verifyingContract to be either:
 * - A valid hex address
 * - The string "cosmos" (as it is hard-coded in some Cosmos ecosystem's EVM adapters)
 * - An empty string
 */
function validateVerifyingContract(data: string) {
  const { domain: { verifyingContract } = {} } = parseTypedMessage(data);
  // Explicit check for cosmos here has been added to address this issue
  // https://github.com/MetaMask/eth-json-rpc-middleware/issues/337
  if (
    verifyingContract &&
    (verifyingContract as string) !== 'cosmos' &&
    !isValidHexAddress(verifyingContract)
  ) {
    throw rpcErrors.invalidInput();
  }
}
