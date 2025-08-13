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
