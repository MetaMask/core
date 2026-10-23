import type { AccountTreeControllerState } from '@metamask/account-tree-controller';

import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId } from '../types.js';
import {
  getAccountGroupLoadingStatus,
  getAccountLoadingStatus,
  getIsAssetsLoadingForSelectedAccountGroup,
  isAccountGroupLoading,
  isAccountLoading,
} from './loading.js';

const ACCOUNT_ID_A = 'mock-account-id-a' as AccountId;
const ACCOUNT_ID_B = 'mock-account-id-b' as AccountId;
const ACCOUNT_ID_C = 'mock-account-id-c' as AccountId;
const GROUP_ID_1 = 'mock-group-id-1';
const GROUP_ID_2 = 'mock-group-id-2';

const createState = (
  assetsLoadingStatus: Record<AccountId, 'loading' | 'loaded'>,
): Pick<AssetsControllerState, 'assetsLoadingStatus'> => ({
  assetsLoadingStatus,
});

const createAccountTreeState = (
  selectedAccountGroup: string,
): AccountTreeControllerState =>
  ({
    accountTree: {
      wallets: {
        'mock-wallet-id': {
          groups: {
            [GROUP_ID_1]: { accounts: [ACCOUNT_ID_A, ACCOUNT_ID_B] },
            [GROUP_ID_2]: { accounts: [ACCOUNT_ID_C] },
          },
        },
      },
    },
    selectedAccountGroup,
  }) as unknown as AccountTreeControllerState;

describe('getAccountLoadingStatus', () => {
  it('returns the loading status for an account', () => {
    const state = createState({
      [ACCOUNT_ID_A]: 'loading',
      [ACCOUNT_ID_B]: 'loaded',
    });
    expect(getAccountLoadingStatus(state, ACCOUNT_ID_A)).toBe('loading');
    expect(getAccountLoadingStatus(state, ACCOUNT_ID_B)).toBe('loaded');
  });

  it('returns undefined for an account with no loading status', () => {
    expect(
      getAccountLoadingStatus(createState({}), ACCOUNT_ID_C),
    ).toBeUndefined();
  });
});

describe('isAccountLoading', () => {
  it('returns true while an account is loading', () => {
    expect(
      isAccountLoading(
        createState({ [ACCOUNT_ID_A]: 'loading' }),
        ACCOUNT_ID_A,
      ),
    ).toBe(true);
  });

  it('returns false once the account is loaded or has no status', () => {
    expect(
      isAccountLoading(createState({ [ACCOUNT_ID_A]: 'loaded' }), ACCOUNT_ID_A),
    ).toBe(false);
    expect(isAccountLoading(createState({}), ACCOUNT_ID_A)).toBe(false);
  });
});

describe('getAccountGroupLoadingStatus', () => {
  it('returns statuses for the accounts in the group', () => {
    const state = createState({
      [ACCOUNT_ID_A]: 'loading',
      [ACCOUNT_ID_B]: 'loaded',
    });
    expect(
      getAccountGroupLoadingStatus(
        state,
        createAccountTreeState(GROUP_ID_1),
        GROUP_ID_1,
      ),
    ).toStrictEqual({
      [ACCOUNT_ID_A]: 'loading',
      [ACCOUNT_ID_B]: 'loaded',
    });
  });

  it('omits accounts in the group that have no loading status', () => {
    const state = createState({ [ACCOUNT_ID_A]: 'loading' });
    expect(
      getAccountGroupLoadingStatus(
        state,
        createAccountTreeState(GROUP_ID_1),
        GROUP_ID_1,
      ),
    ).toStrictEqual({ [ACCOUNT_ID_A]: 'loading' });
  });

  it('returns an empty object for an unknown group', () => {
    const state = createState({ [ACCOUNT_ID_A]: 'loading' });
    expect(
      getAccountGroupLoadingStatus(state, createAccountTreeState(''), 'nope'),
    ).toStrictEqual({});
  });
});

describe('isAccountGroupLoading', () => {
  it('returns true while any account in the group is loading', () => {
    const state = createState({
      [ACCOUNT_ID_A]: 'loaded',
      [ACCOUNT_ID_B]: 'loading',
    });
    expect(
      isAccountGroupLoading(
        state,
        createAccountTreeState(GROUP_ID_1),
        GROUP_ID_1,
      ),
    ).toBe(true);
  });

  it('returns false when no account in the group is loading', () => {
    const state = createState({
      [ACCOUNT_ID_A]: 'loaded',
      [ACCOUNT_ID_B]: 'loaded',
      [ACCOUNT_ID_C]: 'loading',
    });
    expect(
      isAccountGroupLoading(
        state,
        createAccountTreeState(GROUP_ID_1),
        GROUP_ID_1,
      ),
    ).toBe(false);
  });
});

describe('getIsAssetsLoadingForSelectedAccountGroup', () => {
  it('returns true while any account in the selected group is loading', () => {
    const state = createState({ [ACCOUNT_ID_C]: 'loading' });
    expect(
      getIsAssetsLoadingForSelectedAccountGroup(
        state,
        createAccountTreeState(GROUP_ID_2),
      ),
    ).toBe(true);
  });

  it('returns false when the selected group is not loading', () => {
    const state = createState({
      [ACCOUNT_ID_A]: 'loaded',
      [ACCOUNT_ID_B]: 'loading',
    });
    expect(
      getIsAssetsLoadingForSelectedAccountGroup(
        state,
        createAccountTreeState(GROUP_ID_2),
      ),
    ).toBe(false);
  });

  it('returns false when no group is selected', () => {
    const state = createState({ [ACCOUNT_ID_A]: 'loading' });
    expect(
      getIsAssetsLoadingForSelectedAccountGroup(
        state,
        createAccountTreeState(''),
      ),
    ).toBe(false);
  });
});
