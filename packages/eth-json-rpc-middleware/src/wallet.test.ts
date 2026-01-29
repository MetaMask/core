import { MessageTypes, TypedMessage } from '@metamask/eth-sig-util';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';

import type {
  MessageParams,
  TransactionParams,
  TypedMessageParams,
  TypedMessageV1Params,
} from '.';
import { createWalletMiddleware } from '.';
import { DANGEROUS_PROTOTYPE_PROPERTIES } from './utils/validation';
import { createHandleParams, createRequest } from '../test/util/helpers';

const testAddresses = [
  '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
  '0x1234362ef32bcd26d3dd18ca749378213625ba0b',
];
const testUnkownAddress = '0xbadbadbadbadbadbadbadbadbadbadbadbadbad6';
const testTxHash =
  '0xceb3240213640d89419829f3e8011d015af7a7ab3b54c14fdf125620ce5b8697';
const testMsgSig =
  '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c';

describe('wallet', () => {
  describe('accounts', () => {
    it('returns null for coinbase when no accounts', async () => {
      const getAccounts = async (): Promise<never[]> => [];
      const engine = JsonRpcEngineV2.create({
        middleware: [createWalletMiddleware({ getAccounts })],
      });
      const coinbaseResult = await engine.handle(
        ...createHandleParams({
          method: 'eth_coinbase',
        }),
      );
      expect(coinbaseResult).toBeNull();
    });

    it('should return the correct value from getAccounts', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const engine = JsonRpcEngineV2.create({
        middleware: [createWalletMiddleware({ getAccounts })],
      });
      const coinbaseResult = await engine.handle(
        ...createHandleParams({
          method: 'eth_coinbase',
        }),
      );
      expect(coinbaseResult).toStrictEqual(testAddresses[0]);
    });

    it('should return the correct value from getAccounts with multiple accounts', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const engine = JsonRpcEngineV2.create({
        middleware: [createWalletMiddleware({ getAccounts })],
      });
      const coinbaseResult = await engine.handle(
        ...createHandleParams({
          method: 'eth_coinbase',
        }),
      );
      expect(coinbaseResult).toStrictEqual(testAddresses[0]);
    });
  });

  describe('transactions', () => {
    it('processes transaction with valid address', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTransaction }),
        ],
      });
      const txParams = {
        from: testAddresses[0],
      };
      const payload = { method: 'eth_sendTransaction', params: [txParams] };

      const sendTxResult = await engine.handle(...createHandleParams(payload));
      expect(sendTxResult).toBeDefined();
      expect(sendTxResult).toStrictEqual(testTxHash);
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });

    it('throws when provided an invalid address', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTransaction }),
        ],
      });
      const txParams = {
        from: '0x3d',
      };

      const payload = createRequest({
        method: 'eth_sendTransaction',
        params: [txParams],
      });
      await expect(engine.handle(payload)).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('throws unauthorized for unknown addresses', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTransaction }),
        ],
      });
      const txParams = {
        from: testUnkownAddress,
      };
      const payload = {
        method: 'eth_sendTransaction',
        params: [txParams],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });

    it('should not override other request params', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTransaction }),
        ],
      });
      const txParams = {
        from: testAddresses[0],
        to: testAddresses[1],
      };
      const payload = {
        method: 'eth_sendTransaction',
        params: [txParams],
      };

      await engine.handle(...createHandleParams(payload));
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });
  });

  describe('signTransaction', () => {
    it('should process sign transaction when provided a valid address', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processSignTransaction }),
        ],
      });
      const txParams = {
        from: testAddresses[0],
      };
      const payload = { method: 'eth_signTransaction', params: [txParams] };

      expect(await engine.handle(...createHandleParams(payload))).toStrictEqual(
        testTxHash,
      );
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });

    it('should not override other request params', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processSignTransaction }),
        ],
      });
      const txParams = {
        from: testAddresses[0],
        to: testAddresses[1],
      };
      const payload = { method: 'eth_signTransaction', params: [txParams] };

      await engine.handle(...createHandleParams(payload));
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });

    it('should throw when provided invalid address', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processSignTransaction }),
        ],
      });
      const txParams = {
        from: '0x3',
      };
      const payload = { method: 'eth_signTransaction', params: [txParams] };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('should throw when provided unknown address', async () => {
      const getAccounts = async (): Promise<string[]> =>
        testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (
        _txParams: TransactionParams,
      ): Promise<string> => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processSignTransaction }),
        ],
      });
      const txParams = {
        from: testUnkownAddress,
      };
      const payload = { method: 'eth_signTransaction', params: [txParams] };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });
  });

  describe('signTypedData', () => {
    it('should sign with a valid address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageV1Params[] = [];
      const processTypedMessage = async (
        msgParams: TypedMessageV1Params,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessage }),
        ],
      });
      const message = [
        {
          type: 'string',
          name: 'message',
          value: 'Hi, Alice!',
        },
      ];

      const payload = {
        method: 'eth_signTypedData',
        params: [message, testAddresses[0]],
      };
      const signMsgResult = await engine.handle(...createHandleParams(payload));

      expect(signMsgResult).toBeDefined();
      expect(signMsgResult).toStrictEqual(testMsgSig);
      expect(witnessedMsgParams).toHaveLength(1);
      expect(witnessedMsgParams[0]).toStrictEqual({
        from: testAddresses[0],
        data: message,
        signatureMethod: 'eth_signTypedData',
        version: 'V1',
      });
    });

    it('should throw with invalid address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageV1Params[] = [];
      const processTypedMessage = async (
        msgParams: TypedMessageV1Params,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessage }),
        ],
      });
      const message = [
        {
          type: 'string',
          name: 'message',
          value: 'Hi, Alice!',
        },
      ];

      const payload = {
        method: 'eth_signTypedData',
        params: [message, '0x3d'],
      };
      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('should throw with unknown address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageV1Params[] = [];
      const processTypedMessage = async (
        msgParams: TypedMessageV1Params,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessage }),
        ],
      });
      const message = [
        {
          type: 'string',
          name: 'message',
          value: 'Hi, Alice!',
        },
      ];
      const payload = {
        method: 'eth_signTypedData',
        params: [message, testUnkownAddress],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });
  });

  describe('signTypedDataV3', () => {
    it('should sign data and normalizes verifyingContract', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV3 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
        ],
      });

      const message = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
        },
        primaryType: 'EIP712Domain',
        domain: {
          verifyingContract: '0Xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        },
        message: {},
      };

      const stringifiedMessage = JSON.stringify(message);
      const expectedStringifiedMessage = JSON.stringify({
        ...message,
        domain: {
          verifyingContract: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        },
      });

      const payload = {
        method: 'eth_signTypedData_v3',
        params: [testAddresses[0], stringifiedMessage], // Assuming testAddresses[0] is a valid address from your setup
      };

      const signTypedDataV3Result = await engine.handle(
        ...createHandleParams(payload),
      );

      expect(signTypedDataV3Result).toBeDefined();
      expect(signTypedDataV3Result).toStrictEqual(testMsgSig);
      expect(witnessedMsgParams).toHaveLength(1);
      expect(witnessedMsgParams[0]).toMatchObject({
        from: testAddresses[0],
        data: expectedStringifiedMessage,
        version: 'V3',
        signatureMethod: 'eth_signTypedData_v3',
      });
    });

    it('should throw if verifyingContract is invalid hex value', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV3 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
        ],
      });

      const message = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
        },
        primaryType: 'EIP712Domain',
        domain: {
          verifyingContract: '917551056842671309452305380979543736893630245704',
        },
        message: {},
      };

      const stringifiedMessage = JSON.stringify(message);

      const payload = {
        method: 'eth_signTypedData_v3',
        params: [testAddresses[0], stringifiedMessage], // Assuming testAddresses[0] is a valid address from your setup
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow('Invalid input.');
    });

    it('should not throw if verifyingContract is undefined', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV3 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
        ],
      });

      const message = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
        },
        primaryType: 'EIP712Domain',
        message: {},
      };

      const stringifiedMessage = JSON.stringify(message);

      const payload = {
        method: 'eth_signTypedData_v3',
        params: [testAddresses[0], stringifiedMessage], // Assuming testAddresses[0] is a valid address from your setup
      };

      const result = await engine.handle(...createHandleParams(payload));
      expect(result).toBe(
        '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      );
    });
  });

  describe('signTypedDataV4', () => {
    const getMsgParams = (
      verifyingContract?: string,
    ): TypedMessage<MessageTypes> => ({
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      domain: {
        name: 'MyToken',
        version: '1',
        verifyingContract:
          verifyingContract ?? '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        // TODO: Investigate this further.
        // @ts-expect-error: This expects a number, but hex string is used in
        // practice.
        chainId: '0x1',
      },
      message: {
        owner: testAddresses[0],
        spender: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
        value: 3000,
        nonce: 0,
        deadline: 50000000000,
      },
    });

    it('should not throw if request is permit with valid hex value for verifyingContract address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
        ],
      });

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [testAddresses[0], JSON.stringify(getMsgParams())],
      };

      const result = await engine.handle(...createHandleParams(payload));
      expect(result).toBe(
        '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      );
    });

    it('should throw if request is permit with invalid hex value for verifyingContract address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
        ],
      });

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [
          testAddresses[0],
          JSON.stringify(
            getMsgParams('917551056842671309452305380979543736893630245704'),
          ),
        ],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow('Invalid input.');
    });

    it('should not throw if request is permit with undefined value for verifyingContract address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
        ],
      });

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [testAddresses[0], JSON.stringify(getMsgParams())],
      };

      const result = await engine.handle(...createHandleParams(payload));
      expect(result).toBe(
        '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      );
    });

    it('should not throw if request is permit with verifyingContract address equal to "cosmos"', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
        ],
      });

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [testAddresses[0], JSON.stringify(getMsgParams('cosmos'))],
      };

      const result = await engine.handle(...createHandleParams(payload));
      expect(result).toBe(
        '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      );
    });

    it('should throw if message does not have types defined', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
        ],
      });

      const messageParams = getMsgParams();
      const payload = {
        method: 'eth_signTypedData_v4',
        params: [
          testAddresses[0],
          JSON.stringify({ ...messageParams, types: undefined }),
        ],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow('Invalid input.');
    });

    it('should throw if type of primaryType is not defined', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (
        msgParams: TypedMessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
        ],
      });

      const messageParams = getMsgParams();
      const payload = {
        method: 'eth_signTypedData_v4',
        params: [
          testAddresses[0],
          JSON.stringify({
            ...messageParams,
            types: { ...messageParams.types, Permit: undefined },
          }),
        ],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow('Invalid input.');
    });
  });

  describe('sign', () => {
    it('should sign with a valid address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processPersonalMessage = async (
        msgParams: MessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processPersonalMessage }),
        ],
      });

      const message = 'haay wuurl';
      const payload = {
        method: 'personal_sign',
        params: [message, testAddresses[0]],
      };
      const signMsgResult = await engine.handle(...createHandleParams(payload));

      expect(signMsgResult).toBeDefined();
      expect(signMsgResult).toStrictEqual(testMsgSig);
      expect(witnessedMsgParams).toHaveLength(1);
      expect(witnessedMsgParams[0]).toStrictEqual({
        data: message,
        from: testAddresses[0],
        signatureMethod: 'personal_sign',
      });
    });

    it('should error when provided invalid address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processPersonalMessage = async (
        msgParams: MessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processPersonalMessage }),
        ],
      });

      const message = 'haay wuurl';
      const payload = {
        method: 'personal_sign',
        params: [message, '0x3d'],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('should error when provided unknown address', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processPersonalMessage = async (
        msgParams: MessageParams,
      ): Promise<string> => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createWalletMiddleware({ getAccounts, processPersonalMessage }),
        ],
      });

      const message = 'haay wuurl';
      const payload = {
        method: 'personal_sign',
        params: [message, testUnkownAddress],
      };

      await expect(
        engine.handle(...createHandleParams(payload)),
      ).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });
  });

  describe('personalRecover', () => {
    it('should recover with "geth kumavis manual recover"', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const signParams = {
        testLabel: 'geth kumavis manual I recover',
        // "hello world"
        message: '0x68656c6c6f20776f726c64',
        signature:
          '0xce909e8ea6851bc36c007a0072d0524b07a3ff8d4e623aca4c71ca8e57250c4d0a3fc38fa8fbaaa81ead4b9f6bd03356b6f8bf18bccad167d78891636e1d69561b',
        addressHex: '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
      };

      const engine = JsonRpcEngineV2.create({
        middleware: [createWalletMiddleware({ getAccounts })],
      });

      const payload = {
        method: 'personal_ecRecover',
        params: [signParams.message, signParams.signature],
      };
      const ecrecoverResult = await engine.handle(
        ...createHandleParams(payload),
      );
      expect(ecrecoverResult).toBeDefined();
      expect(ecrecoverResult).toStrictEqual(signParams.addressHex);
    });

    it('should recover with "geth kumavis manual recover II"', async () => {
      const getAccounts = async (): Promise<string[]> => testAddresses.slice();
      const signParams = {
        testLabel: 'geth kumavis manual II recover',
        // message from parity's test - note result is different than what they are testing against
        // https://github.com/ethcore/parity/blob/5369a129ae276d38f3490abb18c5093b338246e0/rpc/src/v1/tests/mocked/eth.rs#L301-L317
        message:
          '0x0cc175b9c0f1b6a831c399e26977266192eb5ffee6ae2fec3ad71c777531578f',
        signature:
          '0x9ff8350cc7354b80740a3580d0e0fd4f1f02062040bc06b893d70906f8728bb5163837fd376bf77ce03b55e9bd092b32af60e86abce48f7b8d3539988ee5a9be1c',
        addressHex: '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
      };

      const engine = JsonRpcEngineV2.create({
        middleware: [createWalletMiddleware({ getAccounts })],
      });

      const payload = {
        method: 'personal_ecRecover',
        params: [signParams.message, signParams.signature],
      };
      const ecrecoverResult = await engine.handle(
        ...createHandleParams(payload),
      );
      expect(ecrecoverResult).toBeDefined();
      expect(ecrecoverResult).toStrictEqual(signParams.addressHex);
    });
  });

  describe('prototype pollution validation', () => {
    describe('signTypedData (V1)', () => {
      DANGEROUS_PROTOTYPE_PROPERTIES.forEach((dangerousProperty) => {
        it(`should throw if value contains nested ${dangerousProperty}`, async () => {
          const getAccounts = async (): Promise<string[]> =>
            testAddresses.slice();
          const processTypedMessage = async (): Promise<string> => testMsgSig;
          const engine = JsonRpcEngineV2.create({
            middleware: [
              createWalletMiddleware({ getAccounts, processTypedMessage }),
            ],
          });

          const value = {};
          Object.defineProperty(value, dangerousProperty, {
            value: 'malicious',
            enumerable: true,
          });
          const message = [{ type: 'object', name: 'data', value }];
          const payload = {
            method: 'eth_signTypedData',
            params: [message, testAddresses[0]],
          };

          await expect(
            engine.handle(...createHandleParams(payload)),
          ).rejects.toThrow('Invalid input.');
        });
      });
    });

    describe('signTypedDataV3', () => {
      DANGEROUS_PROTOTYPE_PROPERTIES.forEach((dangerousProperty) => {
        it(`should throw if message contains ${dangerousProperty}`, async () => {
          const getAccounts = async (): Promise<string[]> =>
            testAddresses.slice();
          const processTypedMessageV3 = async (): Promise<string> => testMsgSig;
          const engine = JsonRpcEngineV2.create({
            middleware: [
              createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
            ],
          });

          const msgObj = {};
          Object.defineProperty(msgObj, dangerousProperty, {
            value: 'malicious',
            enumerable: true,
          });
          const message = {
            types: {
              EIP712Domain: [{ name: 'name', type: 'string' }],
            },
            primaryType: 'EIP712Domain',
            domain: {},
            message: msgObj,
          };

          const payload = {
            method: 'eth_signTypedData_v3',
            params: [testAddresses[0], JSON.stringify(message)],
          };

          await expect(
            engine.handle(...createHandleParams(payload)),
          ).rejects.toThrow('Invalid input.');
        });
      });
    });

    describe('signTypedDataV4', () => {
      DANGEROUS_PROTOTYPE_PROPERTIES.forEach((dangerousProperty) => {
        it(`should throw if message contains ${dangerousProperty}`, async () => {
          const getAccounts = async (): Promise<string[]> =>
            testAddresses.slice();
          const processTypedMessageV4 = async (): Promise<string> => testMsgSig;
          const engine = JsonRpcEngineV2.create({
            middleware: [
              createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
            ],
          });

          const msgObj = {};
          Object.defineProperty(msgObj, dangerousProperty, {
            value: 'malicious',
            enumerable: true,
          });
          const message = {
            types: {
              EIP712Domain: [{ name: 'name', type: 'string' }],
              Permit: [{ name: 'owner', type: 'address' }],
            },
            primaryType: 'Permit',
            domain: {},
            message: msgObj,
          };

          const payload = {
            method: 'eth_signTypedData_v4',
            params: [testAddresses[0], JSON.stringify(message)],
          };

          await expect(
            engine.handle(...createHandleParams(payload)),
          ).rejects.toThrow('Invalid input.');
        });
      });
    });
  });
});
