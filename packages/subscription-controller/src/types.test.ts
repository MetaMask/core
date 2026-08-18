import type { Hex } from '@metamask/utils';

import {
  CRYPTO_AUTH_METHODS,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
} from './types.js';
import type { StartCryptoSubscriptionRequest } from './types.js';

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
