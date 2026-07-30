import { decimalToChainId } from './caip.js';

describe('decimalToChainId', () => {
  it('converts a decimal number to an eip155 CAIP chain ID', () => {
    expect(decimalToChainId(1)).toBe('eip155:1');
    expect(decimalToChainId(137)).toBe('eip155:137');
  });

  it('converts a decimal string to an eip155 CAIP chain ID', () => {
    expect(decimalToChainId('1')).toBe('eip155:1');
    expect(decimalToChainId('42161')).toBe('eip155:42161');
  });

  it('passes through already-formatted CAIP chain IDs', () => {
    expect(decimalToChainId('eip155:1')).toBe('eip155:1');
    expect(decimalToChainId('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    );
    expect(decimalToChainId('stellar:pubnet')).toBe('stellar:pubnet');
  });
});
