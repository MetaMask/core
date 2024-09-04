import { providerFromEngine } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import pify from 'pify';

import type {
  MessageParams,
  TransactionParams,
  TypedMessageParams,
  TypedMessageV1Params,
} from '.';
import { createWalletMiddleware } from '.';

const testAddresses = [
  '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
  '0x1234362ef32bcd26d3dd18ca749378213625ba0b',
];
const testUnkownAddress = '0xbadbadbadbadbadbadbadbadbadbadbadbadbad6';
const testTxHash =
  '0xceb3240213640d89419829f3e8011d015af7a7ab3b54c14fdf125620ce5b8697';
const testMsgSig =
  '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c';

function createTestSetup() {
  const engine = new JsonRpcEngine();
  const provider = providerFromEngine(engine);

  return { engine, provider };
}

describe('wallet', () => {
  describe('accounts', () => {
    it('returns null for coinbase when no accounts', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => [];
      engine.push(createWalletMiddleware({ getAccounts }));
      const coinbaseResult = await pify(engine.handle).call(engine, {
        method: 'eth_coinbase',
      });
      expect(coinbaseResult.result).toBeNull();
    });

    it('should return the correct value from getAccounts', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      engine.push(createWalletMiddleware({ getAccounts }));
      const coinbaseResult = await pify(engine.handle).call(engine, {
        method: 'eth_coinbase',
      });
      expect(coinbaseResult.result).toStrictEqual(testAddresses[0]);
    });

    it('should return the correct value from getAccounts with multiple accounts', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      engine.push(createWalletMiddleware({ getAccounts }));
      const coinbaseResult = await pify(engine.handle).call(engine, {
        method: 'eth_coinbase',
      });
      expect(coinbaseResult.result).toStrictEqual(testAddresses[0]);
    });
  });

  describe('transactions', () => {
    it('processes transaction with valid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      engine.push(createWalletMiddleware({ getAccounts, processTransaction }));
      const txParams = {
        from: testAddresses[0],
      };

      const payload = { method: 'eth_sendTransaction', params: [txParams] };
      const sendTxResponse = await pify(engine.handle).call(engine, payload);
      const sendTxResult = sendTxResponse.result;
      expect(sendTxResult).toBeDefined();
      expect(sendTxResult).toStrictEqual(testTxHash);
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });

    it('throws when provided an invalid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      engine.push(createWalletMiddleware({ getAccounts, processTransaction }));
      const txParams = {
        from: '0x3d',
      };

      const payload = { method: 'eth_sendTransaction', params: [txParams] };
      await expect(pify(engine.handle).call(engine, payload)).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('throws unauthorized for unknown addresses', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      engine.push(createWalletMiddleware({ getAccounts, processTransaction }));
      const txParams = {
        from: testUnkownAddress,
      };

      const payload = { method: 'eth_sendTransaction', params: [txParams] };
      const promise = pify(engine.handle).call(engine, payload);
      await expect(promise).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });

    it('should not override other request params', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };
      engine.push(createWalletMiddleware({ getAccounts, processTransaction }));
      const txParams = {
        from: testAddresses[0],
        to: testAddresses[1],
      };

      const payload = { method: 'eth_sendTransaction', params: [txParams] };
      await pify(engine.handle).call(engine, payload);
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });
  });

  describe('signTransaction', () => {
    it('should process sign transaction when provided a valid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processSignTransaction }),
      );
      const txParams = {
        from: testAddresses[0],
      };

      const payload = { method: 'eth_signTransaction', params: [txParams] };
      const sendTxResponse = await pify(engine.handle).call(engine, payload);
      const sendTxResult = sendTxResponse.result;
      expect(sendTxResult).toBeDefined();
      expect(sendTxResult).toStrictEqual(testTxHash);
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });

    it('should not override other request params', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processSignTransaction }),
      );
      const txParams = {
        from: testAddresses[0],
        to: testAddresses[1],
      };

      const payload = { method: 'eth_signTransaction', params: [txParams] };
      await pify(engine.handle).call(engine, payload);
      expect(witnessedTxParams).toHaveLength(1);
      expect(witnessedTxParams[0]).toStrictEqual(txParams);
    });

    it('should throw when provided invalid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processSignTransaction }),
      );
      const txParams = {
        from: '0x3',
      };

      const payload = { method: 'eth_signTransaction', params: [txParams] };
      await expect(pify(engine.handle).call(engine, payload)).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('should throw when provided unknown address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      const witnessedTxParams: TransactionParams[] = [];
      const processSignTransaction = async (_txParams: TransactionParams) => {
        witnessedTxParams.push(_txParams);
        return testTxHash;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processSignTransaction }),
      );
      const txParams = {
        from: testUnkownAddress,
      };

      const payload = { method: 'eth_signTransaction', params: [txParams] };
      const promise = pify(engine.handle).call(engine, payload);
      await expect(promise).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });
  });

  describe('signTypedData', () => {
    it('should sign with a valid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageV1Params[] = [];
      const processTypedMessage = async (msgParams: TypedMessageV1Params) => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };

      engine.push(createWalletMiddleware({ getAccounts, processTypedMessage }));
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
      const signMsgResponse = await pify(engine.handle).call(engine, payload);
      const signMsgResult = signMsgResponse.result;

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
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageV1Params[] = [];
      const processTypedMessage = async (msgParams: TypedMessageV1Params) => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };

      engine.push(createWalletMiddleware({ getAccounts, processTypedMessage }));
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
      await expect(pify(engine.handle).call(engine, payload)).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('should throw with unknown address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageV1Params[] = [];
      const processTypedMessage = async (msgParams: TypedMessageV1Params) => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };

      engine.push(createWalletMiddleware({ getAccounts, processTypedMessage }));
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
      const promise = pify(engine.handle).call(engine, payload);
      await expect(promise).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });
  });

  describe('signTypedDataV3', () => {
    it('should sign data and normalizes verifyingContract', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV3 = async (msgParams: TypedMessageParams) => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
      );

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

      const signTypedDataV3Response = await pify(engine.handle).call(
        engine,
        payload,
      );
      const signTypedDataV3Result = signTypedDataV3Response.result;

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
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV3 = async (msgParams: TypedMessageParams) => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
      );

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

      const promise = pify(engine.handle).call(engine, payload);
      await expect(promise).rejects.toThrow('Invalid input.');
    });

    it('should not throw if verifyingContract is undefined', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV3 = async (msgParams: TypedMessageParams) => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processTypedMessageV3 }),
      );

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

      const promise = pify(engine.handle).call(engine, payload);
      const result = await promise;
      expect(result).toStrictEqual({
        id: undefined,
        jsonrpc: undefined,
        result:
          '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      });
    });
  });

  describe('signTypedDataV4', () => {
    const getMsgParams = (verifyingContract?: string) => ({
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
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (msgParams: TypedMessageParams) => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
      );

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [testAddresses[0], JSON.stringify(getMsgParams())],
      };

      const promise = pify(engine.handle).call(engine, payload);
      const result = await promise;
      expect(result).toStrictEqual({
        id: undefined,
        jsonrpc: undefined,
        result:
          '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      });
    });

    it('should throw if request is permit with invalid hex value for verifyingContract address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (msgParams: TypedMessageParams) => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
      );

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [
          testAddresses[0],
          JSON.stringify(
            getMsgParams('917551056842671309452305380979543736893630245704'),
          ),
        ],
      };

      const promise = pify(engine.handle).call(engine, payload);
      await expect(promise).rejects.toThrow('Invalid input.');
    });

    it('should not throw if request is permit with undefined value for verifyingContract address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: TypedMessageParams[] = [];
      const processTypedMessageV4 = async (msgParams: TypedMessageParams) => {
        witnessedMsgParams.push(msgParams);
        // Assume testMsgSig is the expected signature result
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processTypedMessageV4 }),
      );

      const payload = {
        method: 'eth_signTypedData_v4',
        params: [testAddresses[0], JSON.stringify(getMsgParams())],
      };

      const promise = pify(engine.handle).call(engine, payload);
      const result = await promise;
      expect(result).toStrictEqual({
        id: undefined,
        jsonrpc: undefined,
        result:
          '0x68dc980608bceb5f99f691e62c32caccaee05317309015e9454eba1a14c3cd4505d1dd098b8339801239c9bcaac3c4df95569dcf307108b92f68711379be14d81c',
      });
    });
  });

  describe('sign', () => {
    it('should sign with a valid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processPersonalMessage = async (msgParams: MessageParams) => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processPersonalMessage }),
      );

      const message = 'haay wuurl';
      const payload = {
        method: 'personal_sign',
        params: [message, testAddresses[0]],
      };
      const signMsgResponse = await pify(engine.handle).call(engine, payload);
      const signMsgResult = signMsgResponse.result;

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
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processPersonalMessage = async (msgParams: MessageParams) => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processPersonalMessage }),
      );

      const message = 'haay wuurl';
      const payload = {
        method: 'personal_sign',
        params: [message, '0x3d'],
      };

      await expect(pify(engine.handle).call(engine, payload)).rejects.toThrow(
        new Error('Invalid parameters: must provide an Ethereum address.'),
      );
    });

    it('should error when provided unknown address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processPersonalMessage = async (msgParams: MessageParams) => {
        witnessedMsgParams.push(msgParams);
        return testMsgSig;
      };

      engine.push(
        createWalletMiddleware({ getAccounts, processPersonalMessage }),
      );

      const message = 'haay wuurl';
      const payload = {
        method: 'personal_sign',
        params: [message, testUnkownAddress],
      };

      const promise = pify(engine.handle).call(engine, payload);
      await expect(promise).rejects.toThrow(
        'The requested account and/or method has not been authorized by the user.',
      );
    });
  });

  describe('personalRecover', () => {
    it('should recover with "geth kumavis manual recover"', async () => {
      const getAccounts = async () => testAddresses.slice();
      const signParams = {
        testLabel: 'geth kumavis manual I recover',
        // "hello world"
        message: '0x68656c6c6f20776f726c64',
        signature:
          '0xce909e8ea6851bc36c007a0072d0524b07a3ff8d4e623aca4c71ca8e57250c4d0a3fc38fa8fbaaa81ead4b9f6bd03356b6f8bf18bccad167d78891636e1d69561b',
        addressHex: '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
      };

      const { engine } = createTestSetup();
      engine.push(createWalletMiddleware({ getAccounts }));

      const payload = {
        method: 'personal_ecRecover',
        params: [signParams.message, signParams.signature],
      };
      const ecrecoverResponse = await pify(engine.handle).call(engine, payload);
      const ecrecoverResult = ecrecoverResponse.result;
      expect(ecrecoverResult).toBeDefined();
      expect(ecrecoverResult).toStrictEqual(signParams.addressHex);
    });

    it('should recover with "geth kumavis manual recover II"', async () => {
      const getAccounts = async () => testAddresses.slice();
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

      const { engine } = createTestSetup();
      engine.push(createWalletMiddleware({ getAccounts }));

      const payload = {
        method: 'personal_ecRecover',
        params: [signParams.message, signParams.signature],
      };
      const ecrecoverResponse = await pify(engine.handle).call(engine, payload);
      const ecrecoverResult = ecrecoverResponse.result;
      expect(ecrecoverResult).toBeDefined();
      expect(ecrecoverResult).toStrictEqual(signParams.addressHex);
    });
  });
});
