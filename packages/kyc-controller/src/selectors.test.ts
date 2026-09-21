import { getDefaultKycControllerState } from './KycController.js';
import { selectKycSessionStatus, selectKycVendor } from './selectors.js';

describe('selectors', () => {
  it('selectKycVendor returns the current vendor', () => {
    const state = {
      ...getDefaultKycControllerState(),
      vendor: 'iron' as const,
    };
    expect(selectKycVendor(state)).toBe('iron');
  });

  it('selectKycSessionStatus returns the session status', () => {
    const state = getDefaultKycControllerState();
    expect(selectKycSessionStatus(state)).toBeNull();
  });
});
