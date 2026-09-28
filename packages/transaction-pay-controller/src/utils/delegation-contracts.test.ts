import { chainHasDeleGatorContracts } from './delegation-contracts.js';

describe('chainHasDeleGatorContracts', () => {
  it('returns true for a chain in the newest deployment', () => {
    expect(chainHasDeleGatorContracts('0x1')).toBe(true);
    expect(chainHasDeleGatorContracts(1)).toBe(true);
  });

  it('returns false when the chain has no deployment', () => {
    expect(chainHasDeleGatorContracts('0x13b2')).toBe(false);
    expect(chainHasDeleGatorContracts(5042)).toBe(false);
    expect(chainHasDeleGatorContracts('not-a-chain')).toBe(false);
  });
});
