import type { Hex, Json } from '@metamask/utils';

import {
  CRYPTO_AUTH_METHODS,
  isVaultShareToken,
  MoneyAccountFeature,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  ShieldFeature,
  VAULT_NAMES,
} from './types.js';
import type {
  MoneyAccountEntitlements,
  PricingResponse,
  ShieldEntitlements,
  StartCryptoSubscriptionRequest,
  TokenPaymentInfo,
  UpdatePaymentMethodCryptoRequest,
  VaultTokenPaymentInfo,
} from './types.js';

const SHARED_CRYPTO_REQUEST = {
  products: [PRODUCT_TYPES.SHIELD],
  isTrialRequested: false,
  recurringInterval: RECURRING_INTERVALS.month,
  billingCycles: 3,
  chainId: '0x1' as Hex,
  payerAddress: '0x0000000000000000000000000000000000000001' as Hex,
  tokenSymbol: 'USDC',
};

function assertStartCryptoSubscriptionRequest(
  request: StartCryptoSubscriptionRequest,
): StartCryptoSubscriptionRequest {
  return request;
}

function assertUpdatePaymentMethodCryptoRequest(
  request: UpdatePaymentMethodCryptoRequest,
): UpdatePaymentMethodCryptoRequest {
  return request;
}

function assertVaultTokenPaymentInfo(
  token: VaultTokenPaymentInfo,
): VaultTokenPaymentInfo {
  return token;
}

function assertHex(value: Hex): Hex {
  return value;
}

function assertJson<Type extends Json>(value: Type): Type {
  return value;
}

function assertMoneyAccountEntitlements(
  entitlements: MoneyAccountEntitlements,
): MoneyAccountEntitlements {
  return entitlements;
}

function assertShieldEntitlements(
  entitlements: ShieldEntitlements,
): ShieldEntitlements {
  return entitlements;
}

describe('product entitlement types', () => {
  it('requires every API-defined product feature', () => {
    expect(
      assertMoneyAccountEntitlements({
        [MoneyAccountFeature.SwapFeeWaiver]: true,
        [MoneyAccountFeature.PerpsFeeWaiver]: false,
        [MoneyAccountFeature.PredictFreeTx]: true,
        [MoneyAccountFeature.PremiumApy]: true,
      }),
    ).toBeDefined();
    expect(
      assertShieldEntitlements({
        [ShieldFeature.ShieldClaim]: true,
        [ShieldFeature.PrioritySupport]: false,
      }),
    ).toBeDefined();

    // @ts-expect-error Missing required Money Account features.
    assertMoneyAccountEntitlements({
      [MoneyAccountFeature.PremiumApy]: true,
    });
    // @ts-expect-error Missing required Shield priority support.
    assertShieldEntitlements({
      [ShieldFeature.ShieldClaim]: true,
    });
  });
});

describe('StartCryptoSubscriptionRequest', () => {
  it('accepts an ERC-20 approval request without cryptoAuthMethod', () => {
    const request = assertStartCryptoSubscriptionRequest({
      ...SHARED_CRYPTO_REQUEST,
      rawTransaction: '0xdeadbeef',
    });

    expect(request.rawTransaction).toBe('0xdeadbeef');
  });

  it('accepts an ERC-20 approval request with explicit cryptoAuthMethod', () => {
    const request = assertStartCryptoSubscriptionRequest({
      ...SHARED_CRYPTO_REQUEST,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.ERC20_APPROVAL,
      rawTransaction: '0xdeadbeef',
    });

    expect(request.cryptoAuthMethod).toBe(CRYPTO_AUTH_METHODS.ERC20_APPROVAL);
  });

  it('accepts a delegation request', () => {
    const request = assertStartCryptoSubscriptionRequest({
      ...SHARED_CRYPTO_REQUEST,
      products: [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS],
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
      delegationHash: '0xabc',
    });

    expect(request.delegationHash).toBe('0xabc');
  });

  it('rejects invalid auth field combinations at compile time', () => {
    const bothFields = {
      ...SHARED_CRYPTO_REQUEST,
      rawTransaction: '0xdeadbeef' as Hex,
      delegationHash: '0xabc' as Hex,
    };
    // @ts-expect-error ERC-20 and delegation fields together
    assertStartCryptoSubscriptionRequest(bothFields);

    // @ts-expect-error neither auth field
    assertStartCryptoSubscriptionRequest({
      ...SHARED_CRYPTO_REQUEST,
    });

    // @ts-expect-error delegation without delegationHash
    assertStartCryptoSubscriptionRequest({
      ...SHARED_CRYPTO_REQUEST,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
    });

    // @ts-expect-error ERC-20 method without rawTransaction
    assertStartCryptoSubscriptionRequest({
      ...SHARED_CRYPTO_REQUEST,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.ERC20_APPROVAL,
    });

    const delegationWithRawTransaction = {
      ...SHARED_CRYPTO_REQUEST,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
      rawTransaction: '0xdeadbeef' as Hex,
      delegationHash: '0xabc' as Hex,
    };
    // @ts-expect-error delegation with rawTransaction
    assertStartCryptoSubscriptionRequest(delegationWithRawTransaction);

    const erc20WithDelegationHash = {
      ...SHARED_CRYPTO_REQUEST,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.ERC20_APPROVAL,
      delegationHash: '0xabc' as Hex,
    };
    // @ts-expect-error ERC-20 method with only delegationHash
    assertStartCryptoSubscriptionRequest(erc20WithDelegationHash);

    expect(true).toBe(true);
  });
});

describe('UpdatePaymentMethodCryptoRequest', () => {
  const sharedRequest = {
    subscriptionId: 'sub_123',
    chainId: '0x1' as Hex,
    payerAddress: '0x0000000000000000000000000000000000000001' as Hex,
    tokenSymbol: 'pvmUSD',
    recurringInterval: RECURRING_INTERVALS.month,
    billingCycles: 12,
  };

  it('accepts the existing ERC-20 approval request', () => {
    const request = assertUpdatePaymentMethodCryptoRequest({
      ...sharedRequest,
      rawTransaction: '0xdeadbeef',
    });

    expect(request.rawTransaction).toBe('0xdeadbeef');
  });

  it('accepts a delegation rotation request', () => {
    const request = assertUpdatePaymentMethodCryptoRequest({
      ...sharedRequest,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
      delegationHash: '0xabcdef1234567890',
    });

    expect(request.cryptoAuthMethod).toBe(CRYPTO_AUTH_METHODS.DELEGATION);
    expect(request.delegationHash).toBe('0xabcdef1234567890');
  });

  it('rejects mutually exclusive or incomplete crypto update fields', () => {
    // @ts-expect-error Delegation updates cannot include an ERC-20 transaction.
    assertUpdatePaymentMethodCryptoRequest({
      ...sharedRequest,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
      delegationHash: '0xabcdef1234567890' as Hex,
      rawTransaction: '0xdeadbeef' as Hex,
    });

    // @ts-expect-error Delegation updates require a delegation hash.
    assertUpdatePaymentMethodCryptoRequest({
      ...sharedRequest,
      cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
    });

    expect(true).toBe(true);
  });
});

describe('isVaultShareToken', () => {
  const sharedToken = {
    symbol: 'pvmUSD',
    address: '0x1C8a336051D2024E318A229d01F9F6CF96efD316' as Hex,
    decimals: 6,
  };

  it('identifies a vault share by its accountant address', () => {
    const token: TokenPaymentInfo = {
      ...sharedToken,
      accountantAddress: '0x98A45D90E81849a5743241d3ff765F9Fd788206a' as Hex,
      vault: VAULT_NAMES.premium,
    };

    expect(isVaultShareToken(token)).toBe(true);

    if (isVaultShareToken(token)) {
      // Narrowing makes `accountantAddress` non-optional.
      assertHex(token.accountantAddress);
    }
  });

  it('treats a token without an accountant address as spot', () => {
    const token: TokenPaymentInfo = {
      ...sharedToken,
      conversionRate: { usd: '1.0' },
    };

    expect(isVaultShareToken(token)).toBe(false);
  });

  it('accepts a vault name the client does not know about', () => {
    const token: TokenPaymentInfo = {
      ...sharedToken,
      accountantAddress: '0x98A45D90E81849a5743241d3ff765F9Fd788206a' as Hex,
      vault: 'some-vault-shipped-after-this-release',
    };

    expect(isVaultShareToken(token)).toBe(true);
  });

  it('rejects a vault share that omits its accountant address', () => {
    // @ts-expect-error A vault share requires an accountant address.
    assertVaultTokenPaymentInfo({
      ...sharedToken,
      vault: VAULT_NAMES.base,
    });

    expect(true).toBe(true);
  });
});

describe('pricing state serializability', () => {
  it('keeps the persisted pricing response JSON-serializable', () => {
    // `SubscriptionController` persists pricing, so its state must satisfy
    // `Json`. Optional properties typed `never` silently break that.
    const pricing: PricingResponse = {
      products: [],
      paymentMethods: [
        {
          type: PAYMENT_TYPES.byCrypto,
          chains: [
            {
              chainId: '0x1',
              paymentAddress: '0x0000000000000000000000000000000000000001',
              tokens: [
                {
                  symbol: 'USDC',
                  address: '0x1C8a336051D2024E318A229d01F9F6CF96efD316',
                  decimals: 6,
                },
              ],
            },
          ],
        },
      ],
    };

    expect(assertJson(pricing)).toBe(pricing);
  });
});
