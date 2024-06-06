import { convertHexToDecimal, toHex } from '@metamask/controller-utils';

import type { SignTypedDataMessageV3V4 } from './TypedMessageManager';
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
        `Provided chainId "${convertHexToDecimal(
          mockedCurrentChainId,
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

  describe('normalizeEIP712TypedMessageData', () => {
    const messageData = {
      types: {
        Permit: [
          {
            name: 'owner',
            type: 'address',
          },
          {
            name: 'spender',
            type: 'address',
          },
          {
            name: 'value',
            type: 'uint256',
          },
          {
            name: 'nonce',
            type: 'uint256',
          },
          {
            name: 'deadline',
            type: 'uint256',
          },
        ],
        EIP712Domain: [
          {
            name: 'name',
            type: 'string',
          },
          {
            name: 'version',
            type: 'string',
          },
          {
            name: 'chainId',
            type: 'uint256',
          },
          {
            name: 'verifyingContract',
            type: 'address',
          },
        ],
      },
      domain: {
        name: 'Liquid staked Ether 2.0',
        version: '2',
        chainId: '0x1',
        verifyingContract: '996101235222674412020337938588541139382869425796',
      },
      primaryType: 'Permit',
      message: {
        owner: '0x6d404afe1a6a07aa3cbcbf9fd027671df628ebfc',
        spender: '0x63605E53D422C4F1ac0e01390AC59aAf84C44A51',
        value:
          '115792089237316195423570985008687907853269984665640564039457584007913129639935',
        nonce: '0',
        deadline: '4482689033',
      },
    };

    it('should normalize verifyingContract address in domain', () => {
      const normalizedData = util.normalizeEIP712TypedMessageData(
        messageData,
      ) as SignTypedDataMessageV3V4;
      expect(normalizedData.domain.verifyingContract).toBe(
        '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
      );
      expect(normalizedData).toStrictEqual(messageData);
    });

    it('should handle non-hexadecimal verifyingContract address by normalizing it', () => {
      const messageDataWithNonHexAddress = {
        ...messageData,
        domain: {
          ...messageData.domain,
          verifyingContract: '123',
        },
      };

      const normalizedData = util.normalizeEIP712TypedMessageData(
        messageDataWithNonHexAddress,
      ) as SignTypedDataMessageV3V4;

      expect(normalizedData.domain.verifyingContract).toBe('0x7b');
    });

    it('should handle octal verifyingContract address by normalizing it', () => {
      const expectedNormalizedOctalAddress = '0x53';
      const messageDataWithOctalAddress = {
        ...messageData,
        domain: {
          ...messageData.domain,
          verifyingContract: '0o123',
        },
      };

      const normalizedData = util.normalizeEIP712TypedMessageData(
        messageDataWithOctalAddress,
      ) as SignTypedDataMessageV3V4;

      expect(normalizedData.domain.verifyingContract).toBe(
        expectedNormalizedOctalAddress,
      );
    });

    it('should not modify if verifyingContract is already hexadecimal', () => {
      const expectedVerifyingContract =
        '0x996101235222674412020337938588541139382869425796';
      const messageDataWithHexAddress = {
        ...messageData,
        domain: {
          ...messageData.domain,
          verifyingContract: expectedVerifyingContract,
        },
      };

      const normalizedData = util.normalizeEIP712TypedMessageData(
        messageDataWithHexAddress,
      ) as SignTypedDataMessageV3V4;

      expect(normalizedData.domain.verifyingContract).toBe(
        expectedVerifyingContract,
      );
    });

    it('should not modify other parts of the message data', () => {
      const normalizedData = util.normalizeEIP712TypedMessageData(
        messageData,
      ) as SignTypedDataMessageV3V4;
      expect(normalizedData.message).toStrictEqual(messageData.message);
      expect(normalizedData.types).toStrictEqual(messageData.types);
      expect(normalizedData.primaryType).toStrictEqual(messageData.primaryType);
    });

    it('should throw if data is not parsable or an array', () => {
      expect(() => util.normalizeEIP712TypedMessageData('uh oh')).toThrow(
        'Invalid message "data" for normalization. data: uh oh',
      );

      expect(() => util.normalizeEIP712TypedMessageData([])).toThrow(
        'Provided message "data" is an array.',
      );

      expect(() => util.normalizeEIP712TypedMessageData('[]')).toThrow(
        'Provided message "data" is an array.',
      );
    });
  });
});
