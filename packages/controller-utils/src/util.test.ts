import * as util from './util';

const VALID = '4e1fF7229BDdAf0A73DF183a88d9c3a04cc975e0';

describe('util', () => {
  describe('toChecksumHexAddress', () => {
    const fullAddress = `0x${VALID}`;
    it('should return address for valid address', () => {
      expect(util.toChecksumHexAddress(fullAddress)).toBe(fullAddress);
    });

    it('should return address for non prefix address', () => {
      expect(util.toChecksumHexAddress(VALID)).toBe(fullAddress);
    });
  });

  describe('isValidHexAddress', () => {
    it('should return true for valid address', () => {
      expect(util.isValidHexAddress(VALID)).toBe(true);
    });

    it('should return false for invalid address', () => {
      expect(util.isValidHexAddress('0x00')).toBe(false);
    });

    it('should allow allowNonPrefixed to be false', () => {
      expect(util.isValidHexAddress('0x00', { allowNonPrefixed: false })).toBe(
        false,
      );
    });
  });

  describe('normalizeEnsName', () => {
    it('should normalize with valid 2LD', async () => {
      let valid = util.normalizeEnsName('metamask.eth');
      expect(valid).toStrictEqual('metamask.eth');
      valid = util.normalizeEnsName('foobar1.eth');
      expect(valid).toStrictEqual('foobar1.eth');
      valid = util.normalizeEnsName('foo-bar.eth');
      expect(valid).toStrictEqual('foo-bar.eth');
      valid = util.normalizeEnsName('1-foo-bar.eth');
      expect(valid).toStrictEqual('1-foo-bar.eth');
    });

    it('should normalize with valid 2LD and "test" TLD', async () => {
      const valid = util.normalizeEnsName('metamask.test');
      expect(valid).toStrictEqual('metamask.test');
    });

    it('should normalize with valid 2LD and 3LD', async () => {
      let valid = util.normalizeEnsName('a.metamask.eth');
      expect(valid).toStrictEqual('a.metamask.eth');
      valid = util.normalizeEnsName('aa.metamask.eth');
      expect(valid).toStrictEqual('aa.metamask.eth');
      valid = util.normalizeEnsName('a-a.metamask.eth');
      expect(valid).toStrictEqual('a-a.metamask.eth');
      valid = util.normalizeEnsName('1-a.metamask.eth');
      expect(valid).toStrictEqual('1-a.metamask.eth');
      valid = util.normalizeEnsName('1-2.metamask.eth');
      expect(valid).toStrictEqual('1-2.metamask.eth');
    });

    it('should return null with invalid 2LD', async () => {
      let invalid = util.normalizeEnsName('me.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('metamask-.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('-metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('@metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('foobar.eth');
      expect(invalid).toBeNull();
    });

    it('should return null with valid 2LD and invalid 3LD', async () => {
      let invalid = util.normalizeEnsName('-.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('abc-.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('-abc.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('.metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('f@o.metamask.eth');
      expect(invalid).toBeNull();
    });

    it('should return null with invalid 2LD and valid 3LD', async () => {
      const invalid = util.normalizeEnsName('foo.barbaz.eth');
      expect(invalid).toBeNull();
    });

    it('should return null with invalid TLD', async () => {
      const invalid = util.normalizeEnsName('a.metamask.com');
      expect(invalid).toBeNull();
    });

    it('should return null with repeated periods', async () => {
      let invalid = util.normalizeEnsName('foo..metamask.eth');
      expect(invalid).toBeNull();
      invalid = util.normalizeEnsName('foo.metamask..eth');
      expect(invalid).toBeNull();
    });

    it('should return null with empty string', async () => {
      const invalid = util.normalizeEnsName('');
      expect(invalid).toBeNull();
    });
  });
});
