import {
  Env,
  MoneyAccountFeature,
  getProductEntitlementsClaimKey,
} from './types.js';

describe('money-account-subscription types', () => {
  it('builds the product entitlements claim key from the subscription API URL', () => {
    expect(getProductEntitlementsClaimKey(Env.DEV)).toBe(
      'https://subscription.dev-api.cx.metamask.io/productEntitlements',
    );
    expect(getProductEntitlementsClaimKey(Env.UAT)).toBe(
      'https://subscription.uat-api.cx.metamask.io/productEntitlements',
    );
    expect(getProductEntitlementsClaimKey(Env.PRD)).toBe(
      'https://subscription.api.cx.metamask.io/productEntitlements',
    );
  });

  it('exposes the supported Money Account Plus entitlement flags', () => {
    expect(MoneyAccountFeature).toStrictEqual({
      SwapFeeWaiver: 'swapFeeWaiver',
      PerpsFeeWaiver: 'perpsFeeWaiver',
      PredictFreeTx: 'predictFreeTx',
      PremiumApy: 'premiumApy',
    });
  });

  it('throws for an unsupported environment', () => {
    expect(() =>
      getProductEntitlementsClaimKey('invalid' as Env),
    ).toThrow('invalid environment configuration');
  });
});
