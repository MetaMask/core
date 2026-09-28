import { chainHasDeleGatorContracts } from './delegation-contracts.js';

jest.mock('@metamask/delegation-deployments', () => ({
  DELEGATOR_CONTRACTS: {},
}));

describe('chainHasDeleGatorContracts without deployments', () => {
  it('returns false when no versions are published', () => {
    expect(chainHasDeleGatorContracts(1)).toBe(false);
  });
});
