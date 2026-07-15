import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { ChainId, DataRequest } from '../types';
import { computeSubscriptionScopeKey } from './subscriptionScope';

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;

function createAccount(overrides?: Partial<InternalAccount>): InternalAccount {
  return {
    id: 'account-1',
    address: '0xAbC0000000000000000000000000000000000001',
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Account 1',
      keyring: { type: 'HD Key Tree' },
      importTime: 0,
      lastSelected: 0,
    },
    ...overrides,
  } as InternalAccount;
}

function createRequest(overrides?: Partial<DataRequest>): DataRequest {
  return {
    accountsWithSupportedChains: [
      { account: createAccount(), supportedChains: [CHAIN_MAINNET] },
    ],
    chainIds: [CHAIN_MAINNET],
    dataTypes: ['balance'],
    ...overrides,
  };
}

describe('computeSubscriptionScopeKey', () => {
  it('produces identical keys for equivalent scopes regardless of ordering', () => {
    const requestA = createRequest({
      accountsWithSupportedChains: [
        {
          account: createAccount({ id: 'a' }),
          supportedChains: [CHAIN_MAINNET, CHAIN_POLYGON],
        },
        { account: createAccount({ id: 'b' }), supportedChains: [CHAIN_MAINNET] },
      ],
      chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
    });
    const requestB = createRequest({
      accountsWithSupportedChains: [
        { account: createAccount({ id: 'b' }), supportedChains: [CHAIN_MAINNET] },
        {
          account: createAccount({ id: 'a' }),
          supportedChains: [CHAIN_POLYGON, CHAIN_MAINNET],
        },
      ],
      chainIds: [CHAIN_POLYGON, CHAIN_MAINNET],
    });

    expect(
      computeSubscriptionScopeKey(requestA, [CHAIN_MAINNET, CHAIN_POLYGON], 30000),
    ).toBe(
      computeSubscriptionScopeKey(requestB, [CHAIN_POLYGON, CHAIN_MAINNET], 30000),
    );
  });

  it('is case-insensitive for account addresses', () => {
    const lower = createRequest({
      accountsWithSupportedChains: [
        {
          account: createAccount({
            address: '0xabc0000000000000000000000000000000000001',
          }),
          supportedChains: [CHAIN_MAINNET],
        },
      ],
    });
    const upper = createRequest({
      accountsWithSupportedChains: [
        {
          account: createAccount({
            address: '0xABC0000000000000000000000000000000000001',
          }),
          supportedChains: [CHAIN_MAINNET],
        },
      ],
    });

    expect(computeSubscriptionScopeKey(lower, [CHAIN_MAINNET], 30000)).toBe(
      computeSubscriptionScopeKey(upper, [CHAIN_MAINNET], 30000),
    );
  });

  it('differs when the chains differ', () => {
    const request = createRequest();
    expect(computeSubscriptionScopeKey(request, [CHAIN_MAINNET], 30000)).not.toBe(
      computeSubscriptionScopeKey(request, [CHAIN_POLYGON], 30000),
    );
  });

  it('differs when the poll interval differs', () => {
    const request = createRequest();
    expect(computeSubscriptionScopeKey(request, [CHAIN_MAINNET], 30000)).not.toBe(
      computeSubscriptionScopeKey(request, [CHAIN_MAINNET], 60000),
    );
  });

  it('differs when customAssetsOnly differs', () => {
    const regular = createRequest();
    const customOnly = createRequest({ customAssetsOnly: true });
    expect(
      computeSubscriptionScopeKey(regular, [CHAIN_MAINNET], 30000),
    ).not.toBe(computeSubscriptionScopeKey(customOnly, [CHAIN_MAINNET], 30000));
  });

  it('ignores forceUpdate so a forced refresh is not treated as a new scope', () => {
    const regular = createRequest();
    const forced = createRequest({ forceUpdate: true });
    expect(computeSubscriptionScopeKey(regular, [CHAIN_MAINNET], 30000)).toBe(
      computeSubscriptionScopeKey(forced, [CHAIN_MAINNET], 30000),
    );
  });
});
