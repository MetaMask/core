import { convertHexToDecimal, toHex } from '@metamask/controller-utils';

import * as util from './utils';

describe('utils', () => {
  it('normalizeMessageData', () => {
    const firstNormalized = util.normalizeMessageData(
      '879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
    );
    const secondNormalized = util.normalizeMessageData('somedata');
    expect(firstNormalized).toBe(
      '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
    );
    expect(secondNormalized).toBe('0x736f6d6564617461');
  });

  describe('validateSignMessageData', () => {
    it('should throw if no from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: undefined must be a valid string.`);
    });

    it('should throw if invalid from address', () => {
      const from = '01';
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if invalid type from address', () => {
      const from = 123;
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: undefined must be a valid string.`);
    });

    it('should throw if invalid tyoe data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: 123,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow('Invalid message "data": 123 must be a valid string.');
    });
  });

  describe('validateTypedMessageDataV1', () => {
    it('should throw if no from address legacy', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: undefined must be a valid string.`);
    });

    it('should throw if invalid from address', () => {
      const from = '3244e191f1b4903970224322180f1';
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if invalid type from address', () => {
      const from = 123;
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if incorrect data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: '0x879a05',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: '0x879a05',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if invalid type data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow('Expected EIP712 typed data.');
    });
  });

  describe('validateTypedSignMessageDataV3V4', () => {
    const dataTyped =
      '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":1,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';
    const mockedCurrentChainId = toHex(1);
    it('should throw if no from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: '0x879a05',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow(`Invalid "from" address: undefined must be a valid string.`);
    });

    it('should throw if invalid from address', () => {
      const from = '3244e191f1b4903970224322180f1fb';
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: '0x879a05',
            from,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if invalid type from address', () => {
      const from = 123;
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: '0x879a05',
            from: 123,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if array data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: [],
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no array data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no json valid data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: 'uh oh',
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow('Data must be passed as a valid JSON string.');
    });

    it('should throw if current chain id is not present', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: dataTyped,
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          undefined,
        ),
      ).toThrow('Current chainId cannot be null or undefined.');
    });

    it('should throw if current chain id is not convertable to integer', () => {
      const unexpectedChainId = 'unexpected chain id';
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: dataTyped.replace(`"chainId":1`, `"chainId":"0x1"`),
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          // @ts-expect-error Intentionally invalid
          unexpectedChainId,
        ),
      ).toThrow(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot sign messages for chainId "${convertHexToDecimal(
          mockedCurrentChainId,
        )}", because MetaMask is switching networks.`,
      );
    });

    it('should throw if current chain id is not matched with provided in message data', () => {
      const chainId = toHex(2);
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: dataTyped,
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          chainId,
        ),
      ).toThrow(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Provided chainId "${convertHexToDecimal(
          mockedCurrentChainId,
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        )}" must match the active chainId "${convertHexToDecimal(chainId)}"`,
      );
    });

    it('should throw if data not in typed message schema', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: '{"greetings":"I am Alice"}',
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).toThrow('Data must conform to EIP-712 schema.');
    });

    it('should not throw if data is correct', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: dataTyped.replace(`"chainId":1`, `"chainId":"1"`),
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).not.toThrow();
    });

    it('should not throw if data is correct (object format)', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3V4(
          {
            data: JSON.parse(dataTyped),
            from: '0x3244e191f1b4903970224322180f1fbbc415696b',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          mockedCurrentChainId,
        ),
      ).not.toThrow();
    });
  });

  describe('validateEncryptionPublicKeyMessageData', () => {
    it('should throw if no from address', () => {
      expect(() =>
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        util.validateEncryptionPublicKeyMessageData({} as any),
      ).toThrow(`Invalid "from" address: undefined must be a valid string.`);
    });

    it('should throw if invalid from address', () => {
      const from = '01';
      expect(() =>
        util.validateEncryptionPublicKeyMessageData({
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if invalid type from address', () => {
      const from = 123;
      expect(() =>
        util.validateEncryptionPublicKeyMessageData({
          from: 123,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should not throw if from address is correct', () => {
      expect(() =>
        util.validateEncryptionPublicKeyMessageData({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).not.toThrow();
    });
  });

  describe('validateDecryptedMessageData', () => {
    it('should throw if no from address', () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => util.validateDecryptedMessageData({} as any)).toThrow(
        'Invalid "from" address: undefined must be a valid string.',
      );
    });

    it('should throw if invalid from address', () => {
      const from = '01';
      expect(() =>
        util.validateDecryptedMessageData({
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should throw if invalid type from address', () => {
      const from = 123;
      expect(() =>
        util.validateDecryptedMessageData({
          from,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow(`Invalid "from" address: ${from} must be a valid string.`);
    });

    it('should not throw if from address is correct', () => {
      expect(() =>
        util.validateDecryptedMessageData({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).not.toThrow();
    });
  });
});
