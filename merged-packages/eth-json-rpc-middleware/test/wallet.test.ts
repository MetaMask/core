import { JsonRpcEngine } from 'json-rpc-engine';
import pify from 'pify';

import {
  providerFromEngine,
  createWalletMiddleware,
  TransactionParams,
  MessageParams,
} from '../src';

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
      expect(coinbaseResult.result).toEqual(null);
    });

    it('should return the correct value from getAccounts', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      engine.push(createWalletMiddleware({ getAccounts }));
      const coinbaseResult = await pify(engine.handle).call(engine, {
        method: 'eth_coinbase',
      });
      expect(coinbaseResult.result).toEqual(testAddresses[0]);
    });

    it('should return the correct value from getAccounts with multiple accounts', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice(0, 2);
      engine.push(createWalletMiddleware({ getAccounts }));
      const coinbaseResult = await pify(engine.handle).call(engine, {
        method: 'eth_coinbase',
      });
      expect(coinbaseResult.result).toEqual(testAddresses[0]);
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
      expect(sendTxResult).toEqual(testTxHash);
      expect(witnessedTxParams.length).toEqual(1);
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
        from: testUnkownAddress,
      };

      const payload = { method: 'eth_sendTransaction', params: [txParams] };
      try {
        await pify(engine.handle).call(engine, payload);
      } catch (e: any) {
        expect(e.message).toEqual(
          'Invalid parameters: must provide an Ethereum address.',
        );
      }
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
      expect(sendTxResult).toEqual(testTxHash);
      expect(witnessedTxParams.length).toEqual(1);
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
        from: testAddresses[0],
      };

      const payload = { method: 'eth_signTransaction', params: [txParams] };
      try {
        await pify(engine.handle).call(engine, payload);
      } catch (e: any) {
        expect(e.message).toEqual(
          'Invalid parameters: must provide an Ethereum address.',
        );
      }
    });
  });

  describe('signTypedData', () => {
    it('should sign with a valid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processTypedMessage = async (msgParams: MessageParams) => {
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
      expect(signMsgResult).toEqual(testMsgSig);
      expect(witnessedMsgParams.length).toEqual(1);
      expect(witnessedMsgParams[0]).toStrictEqual({
        from: testAddresses[0],
        data: message,
      });
    });

    it('should throw with invalid address', async () => {
      const { engine } = createTestSetup();
      const getAccounts = async () => testAddresses.slice();
      const witnessedMsgParams: MessageParams[] = [];
      const processTypedMessage = async (msgParams: MessageParams) => {
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
      try {
        await pify(engine.handle).call(engine, payload);
      } catch (e: any) {
        expect(e.message).toEqual(
          'Invalid parameters: must provide an Ethereum address.',
        );
      }
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
      expect(signMsgResult).toEqual(testMsgSig);
      expect(witnessedMsgParams.length).toEqual(1);
      expect(witnessedMsgParams[0]).toStrictEqual({
        data: message,
        from: testAddresses[0],
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
        params: [message, testUnkownAddress],
      };

      try {
        await pify(engine.handle).call(engine, payload);
      } catch (e: any) {
        expect(e.message).toEqual(
          'Invalid parameters: must provide an Ethereum address.',
        );
      }
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
      expect(ecrecoverResult).toEqual(signParams.addressHex);
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
      expect(ecrecoverResult).toEqual(signParams.addressHex);
    });
  });
});
