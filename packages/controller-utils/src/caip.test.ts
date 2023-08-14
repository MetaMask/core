import {
  isEthCaipChainId,
  toEthCaipChainId,
  toEthChainId,
  toEthChainIdHex,
  toEthChainIdInt,
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

  describe('toEthCaipChainId', () => {
    describe('valid ETH CAIP chain id', () => {
      it('returns the passed ETH CAIP chain ID string', () => {
        expect(toEthCaipChainId('eip155:1')).toBe('eip155:1');
        expect(toEthCaipChainId('eip155:1337')).toBe('eip155:1337');
      });
    });

    describe('valid non-ETH CAIP chain id', () => {
      it('throws an error', () => {
        expect(() => toEthCaipChainId('bip122:1')).toThrow(
          'Invalid chain ID "bip122:1"',
        );
      });
    });

    describe('valid hex chain id', () => {
      it('returns a CAIP chain ID string for eip155', () => {
        expect(toEthCaipChainId('0x1')).toBe('eip155:1');
        expect(toEthCaipChainId('0x539')).toBe('eip155:1337');
      });
    });

    describe('invalid hex chain id', () => {
      it('throws an error', () => {
        expect(() => toEthCaipChainId('0xZZZ')).toThrow(
          'Invalid chain ID "0xZZZ"',
        );
      });
    });

    describe('decimal chain id', () => {
      it('returns a CAIP chain ID string for eip155', () => {
        expect(toEthCaipChainId('1')).toBe('eip155:1');
        expect(toEthCaipChainId('1337')).toBe('eip155:1337');
      });
    });

    describe('invalid decimal chain id', () => {
      it('throws an error', () => {
        expect(() => toEthCaipChainId('ZZZ')).toThrow(
          'Invalid chain ID "ZZZ"',
        );
      });
    });
  });

  describe('toEthChainId', () => {
    it('returns the reference as is', () => {
      expect(toEthChainId('eip155:1')).toBe('1');
      expect(toEthChainId('eip155:1337')).toBe('1337');
      expect(toEthChainId('eip155:abc')).toBe('abc');
    });
  });

  describe('toEthChainIdHex', () => {
    describe('valid CAIP chain ID', () => {
      it('returns the reference parsed into hex string', () => {
        expect(toEthChainIdHex('eip155:1')).toBe('0x1');
        expect(toEthChainIdHex('eip155:1337')).toBe('0x539');
      });
    });

    describe('invalid CAIP chain ID', () => {
      it('throws an error', () => {
        expect(() => toEthChainIdHex(':123')).toThrow(
          'Invalid CAIP chain ID.',
        );
        expect(() => toEthChainIdHex('eip155:ABC')).toThrow(
          'Invalid character',
        ); // this comes from toHex(). What should we throw instead?
      });
    });
  });

  describe('toEthChainIdInt', () => {
    describe('valid CAIP chain ID', () => {
      it('returns the reference parsed into a number', () => {
        expect(toEthChainIdInt('eip155:1')).toBe(1);
        expect(toEthChainIdInt('eip155:1337')).toBe(1337);
      });
    });

    describe('invalid CAIP chain ID', () => {
      it('returns NaN', () => {
        const invalidChainId = toEthChainIdInt(':123');
        expect(Number.isNaN(invalidChainId)).toBe(true);
        const invalidChainIdReference = toEthChainIdInt('eip155:ABC');
        expect(Number.isNaN(invalidChainIdReference)).toBe(true);
      });
    });
  });
});
