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
        } as any),
      ).toThrow('Invalid "from" address: undefined must be a valid string.');
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from: '01',
        } as any),
      ).toThrow('Invalid "from" address: 01 must be a valid string.');
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
          from: 123,
        } as any),
      ).toThrow('Invalid "from" address: 123 must be a valid string.');
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: '0x879a05',
        } as any),
      ).toThrow('Invalid "from" address: undefined must be a valid string.');
    });

    it('should throw if invalid tyoe data', () => {
      expect(() =>
        util.validateSignMessageData({
          data: 123,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data": 123 must be a valid string.');
    });
  });

  describe('validateTypedMessageDataV1', () => {
    it('should throw if no from address legacy', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: '3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Expected EIP712 typed data.');
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: 123,
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if incorrect data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: '0x879a05',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: '0x879a05',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if invalid type data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV1({
          data: [],
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Expected EIP712 typed data.');
    });
  });

  describe('validateTypedMessageDataV3', () => {
    const dataTyped =
      '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Person":[{"name":"name","type":"string"},{"name":"wallet","type":"address"}],"Mail":[{"name":"from","type":"Person"},{"name":"to","type":"Person"},{"name":"contents","type":"string"}]},"primaryType":"Mail","domain":{"name":"Ether Mail","version":"1","chainId":1,"verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"},"message":{"from":{"name":"Cow","wallet":"0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"},"to":{"name":"Bob","wallet":"0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"},"contents":"Hello, Bob!"}}';
    it('should throw if no from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '0x879a05',
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if invalid from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '0x879a05',
          from: '3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Data must be passed as a valid JSON string.');
    });

    it('should throw if invalid type from address', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '0x879a05',
          from: 123,
        } as any),
      ).toThrow('Invalid "from" address:');
    });

    it('should throw if array data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: [],
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no array data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Invalid message "data":');
    });

    it('should throw if no json valid data', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: 'uh oh',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Data must be passed as a valid JSON string.');
    });

    it('should throw if data not in typed message schema', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: '{"greetings":"I am Alice"}',
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).toThrow('Data must conform to EIP-712 schema.');
    });

    it('should not throw if data is correct', () => {
      expect(() =>
        util.validateTypedSignMessageDataV3({
          data: dataTyped,
          from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        } as any),
      ).not.toThrow();
    });
  });
});
