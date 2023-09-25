import * as sigUtil from '@metamask/eth-sig-util';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import {
  createAsyncMiddleware,
  createScaffoldMiddleware,
} from '@metamask/json-rpc-engine';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type { Block } from './types';

/*
export type TransactionParams = {
  [prop: string]: Json;
  from: string;
}
*/

/*
export type TransactionParams = JsonRpcParams & {
  from: string;
}
*/

export type TransactionParams = {
  from: string;
};

export type MessageParams = TransactionParams & {
  data: string;
};

export type TypedMessageParams = MessageParams & {
  version: string;
};

export interface WalletMiddlewareOptions {
  getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
  processDecryptMessage?: (
    msgParams: MessageParams,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processEncryptionPublicKey?: (
    address: string,
    req: JsonRpcRequest,
  ) => Promise<string>;
  processEthSignMessage?: (
    msgParams: MessageParams,
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
    msgParams: MessageParams,
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
}

export function createWalletMiddleware({
  getAccounts,
  processDecryptMessage,
  processEncryptionPublicKey,
  processEthSignMessage,
  processPersonalMessage,
  processTransaction,
  processSignTransaction,
  processTypedMessage,
  processTypedMessageV3,
  processTypedMessageV4,
}: // }: WalletMiddlewareOptions): JsonRpcMiddleware<string, Block> {
WalletMiddlewareOptions): JsonRpcMiddleware<any, Block> {
  if (!getAccounts) {
    throw new Error('opts.getAccounts is required');
  }

  return createScaffoldMiddleware({
    // account lookups
    eth_accounts: createAsyncMiddleware(lookupAccounts),
    eth_coinbase: createAsyncMiddleware(lookupDefaultAccount),
    // tx signatures
    eth_sendTransaction: createAsyncMiddleware(sendTransaction),
    eth_signTransaction: createAsyncMiddleware(signTransaction),
    // message signatures
    eth_sign: createAsyncMiddleware(ethSign),
    eth_signTypedData: createAsyncMiddleware(signTypedData),
    eth_signTypedData_v3: createAsyncMiddleware(signTypedDataV3),
    eth_signTypedData_v4: createAsyncMiddleware(signTypedDataV4),
    personal_sign: createAsyncMiddleware(personalSign),
    eth_getEncryptionPublicKey: createAsyncMiddleware(encryptionPublicKey),
    eth_decrypt: createAsyncMiddleware(decryptMessage),
    personal_ecRecover: createAsyncMiddleware(personalRecover),
  });

  //
  // account lookups
  //

  async function lookupAccounts(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    res.result = await getAccounts(req);
  }

  async function lookupDefaultAccount(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    const accounts = await getAccounts(req);
    res.result = accounts[0] || null;
  }

  //
  // transaction signatures
  //

  async function sendTransaction(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processTransaction) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [TransactionParams?];
    const txParams: TransactionParams = {
      from: await validateAndNormalizeKeyholder(params[0]?.from || '', req),
    };
    res.result = await processTransaction(txParams, req);
  }

  async function signTransaction(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processSignTransaction) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [TransactionParams?];
    const txParams: TransactionParams = {
      from: await validateAndNormalizeKeyholder(params[0]?.from || '', req),
    };
    res.result = await processSignTransaction(txParams, req);
  }

  //
  // message signatures
  //

  async function ethSign(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processEthSignMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string, string, Record<string, string>?];
    const address: string = await validateAndNormalizeKeyholder(params[0], req);
    const message = params[1];
    const extraParams = params[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
    };

    res.result = await processEthSignMessage(msgParams, req);
  }

  async function signTypedData(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processTypedMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string, string, Record<string, string>?];
    const message = params[0];
    const address = await validateAndNormalizeKeyholder(params[1], req);
    const version = 'V1';
    const extraParams = params[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
    };

    res.result = await processTypedMessage(msgParams, req, version);
  }

  async function signTypedDataV3(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processTypedMessageV3) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string, string];

    const address = await validateAndNormalizeKeyholder(params[0], req);
    const message = params[1];
    const version = 'V3';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
    };

    res.result = await processTypedMessageV3(msgParams, req, version);
  }

  async function signTypedDataV4(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processTypedMessageV4) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string, string];

    const address = await validateAndNormalizeKeyholder(params[0], req);
    const message = params[1];
    const version = 'V4';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
    };

    res.result = await processTypedMessageV4(msgParams, req, version);
  }

  async function personalSign(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processPersonalMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string, string, TransactionParams?];

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
      let warning = `The eth_personalSign method requires params ordered `;
      warning += `[message, address]. This was previously handled incorrectly, `;
      warning += `and has been corrected automatically. `;
      warning += `Please switch this param order for smooth behavior in the future.`;
      (res as any).warning = warning;

      address = firstParam;
      message = secondParam;
    } else {
      message = firstParam;
      address = secondParam;
    }
    address = await validateAndNormalizeKeyholder(address, req);

    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
    };

    // eslint-disable-next-line require-atomic-updates
    res.result = await processPersonalMessage(msgParams, req);
  }

  async function personalRecover(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 2)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string, string];
    const message = params[0];
    const signature = params[1];
    const signerAddress = sigUtil.recoverPersonalSignature({
      data: message,
      signature,
    });

    res.result = signerAddress;
  }

  async function encryptionPublicKey(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processEncryptionPublicKey) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }

    const params = req.params as [string];

    const address = await validateAndNormalizeKeyholder(params[0], req);

    res.result = await processEncryptionPublicKey(address, req);
  }

  async function decryptMessage(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
  ): Promise<void> {
    if (!processDecryptMessage) {
      throw rpcErrors.methodNotSupported();
    }
    if (
      !req?.params ||
      !Array.isArray(req.params) ||
      !(req.params.length >= 1)
    ) {
      throw rpcErrors.invalidInput();
    }
    const params = req.params as [string, string, Record<string, Json>?];

    const ciphertext: string = params[0];
    const address: string = await validateAndNormalizeKeyholder(params[1], req);
    const extraParams = params[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: ciphertext,
    };

    res.result = await processDecryptMessage(msgParams, req);
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
   * @returns {string} - The normalized address, if valid. Otherwise, throws
   * an error
   */
  async function validateAndNormalizeKeyholder(
    address: string,
    req: JsonRpcRequest,
  ): Promise<string> {
    if (
      typeof address === 'string' &&
      address.length > 0 &&
      resemblesAddress(address)
    ) {
      // Ensure that an "unauthorized" error is thrown if the requester does not have the `eth_accounts`
      // permission.
      const accounts = await getAccounts(req);
      const normalizedAccounts: string[] = accounts.map((_address) =>
        _address.toLowerCase(),
      );
      const normalizedAddress: string = address.toLowerCase();

      if (normalizedAccounts.includes(normalizedAddress)) {
        return normalizedAddress;
      }
      throw providerErrors.unauthorized();
    }
    throw rpcErrors.invalidParams({
      message: `Invalid parameters: must provide an Ethereum address.`,
    });
  }
}

function resemblesAddress(str: string): boolean {
  // hex prefix 2 + 20 bytes
  return str.length === 2 + 20 * 2;
}
