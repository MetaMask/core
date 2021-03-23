import {
  createAsyncMiddleware,
  createScaffoldMiddleware,
  JsonRpcMiddleware,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import * as sigUtil from 'eth-sig-util';
import { ethErrors } from 'eth-rpc-errors';
import { Block } from './cache-utils';

interface TransactionParams {
  from: string;
}

interface MessageParams extends TransactionParams {
  data: string;
}

interface TypedMessageParams extends MessageParams {
  version: string;
}

interface WalletMiddlewareOptions {
  getAccounts: (req: JsonRpcRequest<unknown>) => Promise<string[]>;
  processDecryptMessage?: (msgParams: MessageParams, req: JsonRpcRequest<unknown>) => Promise<Record<string, unknown>>;
  processEncryptionPublicKey?: (address: string, req: JsonRpcRequest<unknown>) => Promise<Record<string, unknown>>;
  processEthSignMessage?: (msgParams: MessageParams, req: JsonRpcRequest<unknown>) => Promise<Record<string, unknown>>;
  processPersonalMessage?: (msgParams: MessageParams, req: JsonRpcRequest<unknown>) => Promise<Record<string, unknown>>;
  processTransaction?: (txParams: TransactionParams, req: JsonRpcRequest<unknown>) => Promise<Record<string, unknown>>;
  processTypedMessage?: (msgParams: MessageParams, req: JsonRpcRequest<unknown>, version: string) => Promise<Record<string, unknown>>;
  processTypedMessageV3?: (msgParams: TypedMessageParams, req: JsonRpcRequest<unknown>, version: string) => Promise<Record<string, unknown>>;
  processTypedMessageV4?: (msgParams: TypedMessageParams, req: JsonRpcRequest<unknown>, version: string) => Promise<Record<string, unknown>>;
}

export = createWalletMiddleware;

function createWalletMiddleware(
  {
    getAccounts,
    processDecryptMessage,
    processEncryptionPublicKey,
    processEthSignMessage,
    processPersonalMessage,
    processTransaction,
    processTypedMessage,
    processTypedMessageV3,
    processTypedMessageV4,
  }: WalletMiddlewareOptions
): JsonRpcMiddleware<string, Block> {
  if (!getAccounts) {
    throw new Error('opts.getAccounts is required');
  }

  return createScaffoldMiddleware({
    // account lookups
    'eth_accounts': createAsyncMiddleware(lookupAccounts),
    'eth_coinbase': createAsyncMiddleware(lookupDefaultAccount),
    // tx signatures
    'eth_sendTransaction': createAsyncMiddleware(sendTransaction),
    // message signatures
    'eth_sign': createAsyncMiddleware(ethSign),
    'eth_signTypedData': createAsyncMiddleware(signTypedData),
    'eth_signTypedData_v3': createAsyncMiddleware(signTypedDataV3),
    'eth_signTypedData_v4': createAsyncMiddleware(signTypedDataV4),
    'personal_sign': createAsyncMiddleware(personalSign),
    'eth_getEncryptionPublicKey': createAsyncMiddleware(encryptionPublicKey),
    'eth_decrypt': createAsyncMiddleware(decryptMessage),
    'personal_ecRecover': createAsyncMiddleware(personalRecover),
  });

  //
  // account lookups
  //

  async function lookupAccounts(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {
    res.result = await getAccounts(req);
  }

  async function lookupDefaultAccount(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {
    const accounts = await getAccounts(req);
    res.result = accounts[0] || null;
  }

  //
  // transaction signatures
  //

  async function sendTransaction(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    if (!processTransaction) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const txParams: TransactionParams = (req.params as TransactionParams[])[0] || {};
    txParams.from = await validateAndNormalizeKeyholder((txParams.from as string), req);
    res.result = await processTransaction(txParams, req);
  }

  //
  // message signatures
  //

  async function ethSign(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    if (!processEthSignMessage) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const address: string = await validateAndNormalizeKeyholder((req.params as string[])[0], req);
    const message: string = (req.params as string[])[1];
    const extraParams: Record<string, unknown> = (req.params as Record<string, unknown>[])[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
    };

    res.result = await processEthSignMessage(msgParams, req);
  }

  async function signTypedData(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    if (!processTypedMessage) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const message: string = (req.params as string[])[0];
    const address: string = await validateAndNormalizeKeyholder((req.params as string[])[1], req);
    const version = 'V1';
    const extraParams: Record<string, unknown> = (req.params as Record<string, unknown>[])[2] || {};
    const msgParams: MessageParams = {
      ...extraParams,
      from: address,
      data: message,
    };

    res.result = await processTypedMessage(msgParams, req, version);
  }

  async function signTypedDataV3(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    if (!processTypedMessageV3) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const address: string = await validateAndNormalizeKeyholder((req.params as string[])[0], req);
    const message: string = (req.params as string[])[1];
    const version = 'V3';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
    };

    res.result = await processTypedMessageV3(msgParams, req, version);
  }

  async function signTypedDataV4(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    if (!processTypedMessageV4) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const address: string = await validateAndNormalizeKeyholder((req.params as string[])[0], req);
    const message: string = (req.params as string)[1];
    const version = 'V4';
    const msgParams: TypedMessageParams = {
      data: message,
      from: address,
      version,
    };

    res.result = await processTypedMessageV4(msgParams, req, version);
  }

  async function personalSign(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {
    if (!processPersonalMessage) {
      throw ethErrors.rpc.methodNotSupported();
    }

    // process normally
    const firstParam: string = (req.params as string[])[0];
    const secondParam: string = (req.params as string[])[1];
    // non-standard "extraParams" to be appended to our "msgParams" obj
    const extraParams: Record<string, unknown> = (req.params as Record<string, unknown>[])[2] || {};

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

  async function personalRecover(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    const message: string = (req.params as string)[0];
    const signature: string = (req.params as string)[1];
    const extraParams: Record<string, unknown> = (req.params as Record<string, unknown>[])[2] || {};
    const msgParams: sigUtil.SignedMessageData<unknown> = {
      ...extraParams,
      sig: signature,
      data: message,
    };
    const signerAddress: string = sigUtil.recoverPersonalSignature(msgParams);

    res.result = signerAddress;
  }

  async function encryptionPublicKey(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {
    if (!processEncryptionPublicKey) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const address: string = await validateAndNormalizeKeyholder((req.params as string)[0], req);

    res.result = await processEncryptionPublicKey(address, req);
  }

  async function decryptMessage(req: JsonRpcRequest<unknown>, res: PendingJsonRpcResponse<unknown>): Promise<void> {

    if (!processDecryptMessage) {
      throw ethErrors.rpc.methodNotSupported();
    }

    const ciphertext: string = (req.params as string)[0];
    const address: string = await validateAndNormalizeKeyholder((req.params as string)[1], req);
    const extraParams: Record<string, unknown> = (req.params as Record<string, unknown>[])[2] || {};
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
   * @param {string} address - The address to validate and normalize.
   * @param {Object} req - The request object.
   * @returns {string} - The normalized address, if valid. Otherwise, throws
   * an error
   */
  async function validateAndNormalizeKeyholder(address: string, req: JsonRpcRequest<unknown>): Promise<string> {

    if (typeof address === 'string' && address.length > 0) {

      // ensure address is included in provided accounts
      const accounts: string[] = await getAccounts(req);
      const normalizedAccounts: string[] = accounts.map((_address) => _address.toLowerCase());
      const normalizedAddress: string = address.toLowerCase();

      if (normalizedAccounts.includes(normalizedAddress)) {
        return normalizedAddress;
      }
    }
    throw ethErrors.rpc.invalidParams({
      message: `Invalid parameters: must provide an Ethereum address.`,
    });
  }
}

function resemblesAddress(str: string): boolean {
  // hex prefix 2 + 20 bytes
  return str.length === (2 + (20 * 2));
}
