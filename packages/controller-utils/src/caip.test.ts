import {
  isEthCaipChainId,
  getCaipChainIdFromEthChainId,
  getEthChainIdDecFromCaipChainId,
  getEthChainIdHexFromCaipChainId,
  getEthChainIdIntFromCaipChainId,
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

  describe('getCaipChainIdFromEthChainId', () => {
    describe('valid hex chain id', () => {
      it('returns a caip chain id string for eip155', () => {
        expect(getCaipChainIdFromEthChainId('0x1')).toBe('eip155:1');
        expect(getCaipChainIdFromEthChainId('0x539')).toBe('eip155:1337');
      });
    });

    describe('invalid hex chain id', () => {
      it('returns an empty string', () => {
        expect(() => getCaipChainIdFromEthChainId('0xZZZ')).toThrow(
          'Invalid chain ID "0xZZZ"',
        );
      });
    });

    describe('decimal chain id', () => {
      it('returns a caip chain id string for eip155', () => {
        expect(getCaipChainIdFromEthChainId('1')).toBe('eip155:1');
        expect(getCaipChainIdFromEthChainId('1337')).toBe('eip155:1337');
      });
    });

    describe('invalid decimal chain id', () => {
      it('returns an empty string', () => {
        expect(() => getCaipChainIdFromEthChainId('ZZZ')).toThrow(
          'Invalid chain ID "ZZZ"',
        );
      });
    });
  });

  it('getEthChainIdDecFromCaipChainId', () => {
    expect(getEthChainIdDecFromCaipChainId('eip155:1')).toBe('1');
    expect(getEthChainIdDecFromCaipChainId('eip155:1337')).toBe('1337');
  });

  it('getEthChainIdHexFromCaipChainId', () => {
    expect(getEthChainIdHexFromCaipChainId('eip155:1')).toBe('0x1');
    expect(getEthChainIdHexFromCaipChainId('eip155:1337')).toBe('0x539');
  });

  it('getEthChainIdIntFromCaipChainId', () => {
    expect(getEthChainIdIntFromCaipChainId('eip155:1')).toBe(1);
    expect(getEthChainIdIntFromCaipChainId('eip155:1337')).toBe(1337);
  });
});
