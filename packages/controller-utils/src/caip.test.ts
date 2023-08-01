import {
  isEthCaipChainId,
  buildEthCaipChainId,
  parseEthCaipChainId,
  parseEthCaipChainIdHex,
  parseEthCaipChainIdInt,
} from './caip';

describe('caip', () => {
  it('isEthCaipChainId', () => {
    expect(isEthCaipChainId('eip155:1')).toBe(true);
    expect(isEthCaipChainId('eip155:5')).toBe(true);
    expect(isEthCaipChainId('eip155:1337')).toBe(true);
    expect(isEthCaipChainId('bip122:1')).toBe(false);
    expect(isEthCaipChainId('eip1555:1')).toBe(false);
    expect(isEthCaipChainId('eip:1')).toBe(false);
    expect(isEthCaipChainId('eip:')).toBe(false);
    expect(isEthCaipChainId('eip155')).toBe(false);
  });

  describe('buildEthCaipChainId', () => {
    describe('valid hex chain id', () => {
      it('returns a caip chain id string for eip155', () => {
        expect(buildEthCaipChainId('0x1')).toBe('eip155:1');
        expect(buildEthCaipChainId('0x539')).toBe('eip155:1337');
      });
    });

    describe('invalid hex chain id', () => {
      it('throws an error', () => {
        expect(() => buildEthCaipChainId('0xZZZ')).toThrow(
          'Invalid chain ID "0xZZZ"',
        );
      });
    });

    describe('decimal chain id', () => {
      it('returns a caip chain id string for eip155', () => {
        expect(buildEthCaipChainId('1')).toBe('eip155:1');
        expect(buildEthCaipChainId('1337')).toBe('eip155:1337');
      });
    });

    describe('invalid decimal chain id', () => {
      it('throws an error', () => {
        expect(() => buildEthCaipChainId('ZZZ')).toThrow(
          'Invalid chain ID "ZZZ"',
        );
      });
    });
  });

  describe('parseEthCaipChainId', () => {
    it('returns the reference as is', () => {
      expect(parseEthCaipChainId('eip155:1')).toBe('1');
      expect(parseEthCaipChainId('eip155:1337')).toBe('1337');
      expect(parseEthCaipChainId('eip155:abc')).toBe('abc');
    });
  });

  describe('parseEthCaipChainIdHex', () => {
    describe('valid caip chain id', () => {
      it('returns the reference parsed into hex string', () => {
        expect(parseEthCaipChainIdHex('eip155:1')).toBe('0x1');
        expect(parseEthCaipChainIdHex('eip155:1337')).toBe('0x539');
      });
    });

    describe('invalid caip chain id', () => {
      it('throws an error', () => {
        expect(() => parseEthCaipChainIdHex(':123')).toThrow(
          'Invalid CAIP chain ID.',
        );
        expect(() => parseEthCaipChainIdHex('eip155:ABC')).toThrow(
          'Invalid character',
        ); // this comes from toHex(). What should we throw instead?
      });
    });
  });

  describe('parseEthCaipChainIdInt', () => {
    describe('valid caip chain id', () => {
      it('returns the reference parsed into a number', () => {
        expect(parseEthCaipChainIdInt('eip155:1')).toBe(1);
        expect(parseEthCaipChainIdInt('eip155:1337')).toBe(1337);
      });
    });

    describe('invalid caip chain id', () => {
      it('returns NaN', () => {
        const invalidChainId = parseEthCaipChainIdInt(':123');
        expect(Number.isNaN(invalidChainId)).toBe(true);
        const invalidChainIdReference = parseEthCaipChainIdInt('eip155:ABC');
        expect(Number.isNaN(invalidChainIdReference)).toBe(true);
      });
    });
  });
});
