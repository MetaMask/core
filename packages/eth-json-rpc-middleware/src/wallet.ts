import * as sigUtil from '@metamask/eth-sig-util';
import type {
  JsonRpcMiddleware,
  MiddlewareContext,
  MiddlewareParams,
} from '@metamask/json-rpc-engine/v2';
import { createScaffoldMiddleware } from '@metamask/json-rpc-engine/v2';
import type { MessageRequest } from '@metamask/message-manager';
import { rpcErrors } from '@metamask/rpc-errors';
import { isValidHexAddress } from '@metamask/utils';
import type { JsonRpcRequest, Json, Hex } from '@metamask/utils';

import { createWalletGetGrantedExecutionPermissionsHandler } from './methods/wallet-get-granted-execution-permissions';
import type { ProcessGetGrantedExecutionPermissionsHook } from './methods/wallet-get-granted-execution-permissions';
import { createWalletGetSupportedExecutionPermissionsHandler } from './methods/wallet-get-supported-execution-permissions';
import type { ProcessGetSupportedExecutionPermissionsHook } from './methods/wallet-get-supported-execution-permissions';
import { createWalletRequestExecutionPermissionsHandler } from './methods/wallet-request-execution-permissions';
import type { ProcessRequestExecutionPermissionsHook } from './methods/wallet-request-execution-permissions';
import { createWalletRevokeExecutionPermissionHandler } from './methods/wallet-revoke-execution-permission';
import type { ProcessRevokeExecutionPermissionHook } from './methods/wallet-revoke-execution-permission';
import { stripArrayTypeIfPresent } from './utils/common';
import { normalizeTypedMessage, parseTypedMessage } from './utils/normalize';
import {
  resemblesAddress,
  validateAndNormalizeKeyholder as validateKeyholder,
  validateTypedDataForPrototypePollution,
  validateTypedDataV1ForPrototypePollution,
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
  getAccounts: (origin: string) => Promise<string[]>;
  processDecryptMessage?: (
    msgParams: MessageParams,
    req: MessageRequest,
  ) => Promise<string>;
  processEncryptionPublicKey?: (
    address: string,
    req: MessageRequest,
  ) => Promise<string>;
  processPersonalMessage?: (
    msgParams: MessageParams,
    req: JsonRpcRequest,
    context: WalletMiddlewareContext,
  ) => Promise<string>;
  processTransaction?: (
    txParams: TransactionParams,
    req: JsonRpcRequest,
    context: WalletMiddlewareContext,
  ) => Promise<string>;
  processSignTransaction?: (
    txParams: TransactionParams,
    req: JsonRpcRequest,
    context: WalletMiddlewareContext,
  ) => Promise<string>;
  processTypedMessage?: (
    msgParams: TypedMessageV1Params,
    req: JsonRpcRequest,
    context: WalletMiddlewareContext,
    version: string,
  ) => Promise<string>;
  processTypedMessageV3?: (
    msgParams: TypedMessageParams,
    req: JsonRpcRequest,
    context: WalletMiddlewareContext,
    version: string,
  ) => Promise<string>;
  processTypedMessageV4?: (
    msgParams: TypedMessageParams,
    req: JsonRpcRequest,
    context: WalletMiddlewareContext,
    version: string,
  ) => Promise<string>;
  processRequestExecutionPermissions?: ProcessRequestExecutionPermissionsHook;
  processRevokeExecutionPermission?: ProcessRevokeExecutionPermissionHook;
  processGetGrantedExecutionPermissions?: ProcessGetGrantedExecutionPermissionsHook;
  processGetSupportedExecutionPermissions?: ProcessGetSupportedExecutionPermissionsHook;
};

export type WalletMiddlewareKeyValues = {
  networkClientId: string;
  origin: string;
  securityAlertResponse?: Record<string, Json>;
  traceContext?: unknown;
};

export type WalletMiddlewareContext =
  MiddlewareContext<WalletMiddlewareKeyValues>;

export type WalletMiddlewareParams = MiddlewareParams<
  JsonRpcRequest,
  WalletMiddlewareContext
>;

/**
 * Creates a JSON-RPC middleware that handles "wallet"-related JSON-RPC methods.
 * "Wallet" may have had a specific meaning at some point in the distant past,
 * but at this point it's just an arbitrary label.
 *
 * @param options - The options for the middleware.
 * @param options.getAccounts - The function to get the accounts for the origin.
 * @param options.processDecryptMessage - The function to process the decrypt message request.
 * @param options.processEncryptionPublicKey - The function to process the encryption public key request.
 * @param options.processPersonalMessage - The function to process the personal message request.
 * @param options.processTransaction - The function to process the transaction request.
 * @param options.processSignTransaction - The function to process the sign transaction request.
 * @param options.processTypedMessage - The function to process the typed message request.
 * @param options.processTypedMessageV3 - The function to process the typed message v3 request.
 * @param options.processTypedMessageV4 - The function to process the typed message v4 request.
 * @param options.processRequestExecutionPermissions - The function to process the request execution permissions request.
 * @param options.processRevokeExecutionPermission - The function to process the revoke execution permission request.
 * @param options.processGetGrantedExecutionPermissions - The function to process the get granted execution permissions request.
 * @param options.processGetSupportedExecutionPermissions - The function to process the get supported execution permissions request.
 * @returns A JSON-RPC middleware that handles wallet-related JSON-RPC methods.
 */
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
  processGetGrantedExecutionPermissions,
  processGetSupportedExecutionPermissions,
}: WalletMiddlewareOptions): JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  WalletMiddlewareContext
> {
  if (!getAccounts) {
    throw new Error('opts.getAccounts is required');
  }

  return createScaffoldMiddleware<WalletMiddlewareContext>({
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
    wallet_getGrantedExecutionPermissions:
      createWalletGetGrantedExecutionPermissionsHandler({
        processGetGrantedExecutionPermissions,
      }),
    wallet_getSupportedExecutionPermissions:
      createWalletGetSupportedExecutionPermissionsHandler({
        processGetSupportedExecutionPermissions,
      }),
  });

  //
  // account lookups
  //

  /**
   * Gets the accounts for the origin.
   *
   * @param options - Options bag.
   * @param options.context - The context of the request.
   * @returns The accounts for the origin.
   */
  async function lookupAccounts({
    context,
  }: WalletMiddlewareParams): Promise<Json> {
    return await getAccounts(context.assertGet('origin'));
  }

  /**
   * Gets the default account (i.e. first in the list) for the origin.
   *
   * @param options - Options bag.
   * @param options.context - The context of the request.
   * @returns The default account for the origin.
   */
  async function lookupDefaultAccount({
    context,
  }: WalletMiddlewareParams): Promise<Json> {
    const accounts = await getAccounts(context.assertGet('origin'));
    return accounts[0] || null;
  }

  //
  // transaction signatures
  //

  /**
   * Sends a transaction.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The transaction hash.
   */
  async function sendTransaction({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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
      // Not using nullish coalescing, since `params` may be `null`.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      from: await validateAndNormalizeKeyholder(params?.from || '', context),
    };
    return await processTransaction(txParams, request, context);
  }

  /**
   * Signs a transaction.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The signed transaction.
   */
  async function signTransaction({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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
      // Not using nullish coalescing, since `params` may be `null`.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      from: await validateAndNormalizeKeyholder(params?.from || '', context),
    };
    return await processSignTransaction(txParams, request, context);
  }

  //
  // message signatures
  //

  /**
   * Signs a `eth_signTypedData` message.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The signed message.
   */
  async function signTypedData({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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
    const address = await validateAndNormalizeKeyholder(params[1], context);
    const version = 'V1';
    validateTypedDataV1ForPrototypePollution(message);
    // Not using nullish coalescing, since `params` may be `null`.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const extraParams = params[2] || {};
    const msgParams: TypedMessageV1Params = {
      ...extraParams,
      from: address,
      data: message,
      signatureMethod: 'eth_signTypedData',
      version,
    };

    return await processTypedMessage(msgParams, request, context, version);
  }

  /**
   * Signs a `eth_signTypedData_v3` message.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The signed message.
   */
  async function signTypedDataV3({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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

    const address = await validateAndNormalizeKeyholder(params[0], context);
    const message = normalizeTypedMessage(params[1]);
    validatePrimaryType(message);
    validateVerifyingContract(message);
    validateTypedDataForPrototypePollution(message);
    const version = 'V3';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
      signatureMethod: 'eth_signTypedData_v3',
    };

    return await processTypedMessageV3(msgParams, request, context, version);
  }

  /**
   * Signs a `eth_signTypedData_v4` message.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The signed message.
   */
  async function signTypedDataV4({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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

    const address = await validateAndNormalizeKeyholder(params[0], context);
    const message = normalizeTypedMessage(params[1]);
    validatePrimaryType(message);
    validateVerifyingContract(message);
    validateTypedDataForPrototypePollution(message);
    const version = 'V4';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
      signatureMethod: 'eth_signTypedData_v4',
    };

    return await processTypedMessageV4(msgParams, request, context, version);
  }

  /**
   * Signs a `personal_sign` message.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The signed message.
   */
  async function personalSign({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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
    // Not using nullish coalescing, since `params` may be `null`.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    address = await validateAndNormalizeKeyholder(address, context);

    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
      signatureMethod: 'personal_sign',
    };

    return await processPersonalMessage(msgParams, request, context);
  }

  /**
   * Recovers the signer address from a `personal_sign` message.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @returns The recovered signer address.
   */
  async function personalRecover({
    request,
  }: WalletMiddlewareParams): Promise<Json> {
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

  /**
   * Gets the encryption public key for an address.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The encryption public key.
   */
  async function encryptionPublicKey({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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

    const address = await validateAndNormalizeKeyholder(params[0], context);

    return await processEncryptionPublicKey(address, {
      id: request.id as string | number,
      origin: context.assertGet('origin'),
      securityAlertResponse: context.get('securityAlertResponse'),
    });
  }

  /**
   * Decrypts a message.
   *
   * @param options - Options bag.
   * @param options.request - The request.
   * @param options.context - The context of the request.
   * @returns The decrypted message.
   */
  async function decryptMessage({
    request,
    context,
  }: WalletMiddlewareParams): Promise<Json> {
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
      context,
    );
    // Not using nullish coalescing, since `params` may be `null`.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const extraParams = params[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: ciphertext,
    };

    return await processDecryptMessage(msgParams, {
      id: request.id as string | number,
      origin: context.assertGet('origin'),
      securityAlertResponse: context.get('securityAlertResponse'),
    });
  }

  //
  // utility
  //

  /**
   * Validates the keyholder address, and returns a normalized (i.e. lowercase)
   * copy of it.
   *
   * @param address - The address to validate and normalize.
   * @param context - The context of the request.
   * @returns The normalized address, if valid. Otherwise, throws
   * an error
   */
  async function validateAndNormalizeKeyholder(
    address: string,
    context: WalletMiddlewareContext,
  ): Promise<string> {
    return validateKeyholder(address as Hex, context, { getAccounts });
  }
}

/**
 * Validates primary of typedSignMessage, to ensure that it's type definition is present in message.
 *
 * @param data - The data passed in typedSign request.
 */
function validatePrimaryType(data: string): void {
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
function validateVerifyingContract(data: string): void {
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
