import { getDefaultKycControllerState } from './KycController';
import {
  selectIsKycRequiredForProduct,
  selectKycPhase,
  selectKycSumSub,
} from './selectors';

describe('selectors', () => {
  it('selectKycPhase returns the current phase', () => {
    const state = { ...getDefaultKycControllerState(), phase: 'form' as const };
    expect(selectKycPhase(state)).toBe('form');
  });

  it('selectKycSumSub returns the sub-flow state', () => {
    const state = getDefaultKycControllerState();
    expect(selectKycSumSub(state)).toStrictEqual(state.sumsub);
  });

  describe('selectIsKycRequiredForProduct', () => {
    it('returns the cached requirement for a product', () => {
      const state = {
        ...getDefaultKycControllerState(),
        kycRequiredByProduct: { ramps: true },
      };
      expect(selectIsKycRequiredForProduct('ramps')(state)).toBe(true);
    });

    it('returns undefined when the product has not been checked', () => {
      const state = getDefaultKycControllerState();
      expect(selectIsKycRequiredForProduct('card')(state)).toBeUndefined();
    });
  });
});
