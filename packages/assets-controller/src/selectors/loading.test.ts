import type { AssetsControllerState } from '../AssetsController.js';
import type { AccountId } from '../types.js';
import {
  getAccountLoadingStatus,
  getAccountsLoadingStatus,
  isAccountLoading,
  isAnyAccountLoading,
} from './loading.js';

const ACCOUNT_ID_A: AccountId = 'mock-account-id-1';
const ACCOUNT_ID_B: AccountId = 'mock-account-id-2';
const ACCOUNT_ID_C: AccountId = 'mock-account-id-3';

const createState = (
  assetsLoadingStatus: AssetsControllerState['assetsLoadingStatus'],
): Pick<AssetsControllerState, 'assetsLoadingStatus'> => ({
  assetsLoadingStatus,
});

describe('loading selectors', () => {
  describe('getAccountLoadingStatus', () => {
    it('returns the trigger for an account with an in-flight fetch', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'accountSwitch',
        [ACCOUNT_ID_B]: 'unlock',
      });

      expect(getAccountLoadingStatus(state, ACCOUNT_ID_A)).toBe(
        'accountSwitch',
      );
      expect(getAccountLoadingStatus(state, ACCOUNT_ID_B)).toBe('unlock');
    });

    it('returns undefined when the account is not loading', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'accountSwitch' });

      expect(getAccountLoadingStatus(state, ACCOUNT_ID_B)).toBeUndefined();
    });

    it('returns undefined when no account is loading', () => {
      const state = createState({});

      expect(getAccountLoadingStatus(state, ACCOUNT_ID_A)).toBeUndefined();
    });
  });

  describe('isAccountLoading', () => {
    it('returns true while the account has an in-flight fetch', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'accountSwitch',
        [ACCOUNT_ID_B]: 'unlock',
      });

      expect(isAccountLoading(state, ACCOUNT_ID_A)).toBe(true);
      expect(isAccountLoading(state, ACCOUNT_ID_B)).toBe(true);
    });

    it('returns false when the account is not loading', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'accountSwitch' });

      expect(isAccountLoading(state, ACCOUNT_ID_B)).toBe(false);
    });

    it('returns false when no account is loading', () => {
      const state = createState({});

      expect(isAccountLoading(state, ACCOUNT_ID_A)).toBe(false);
    });
  });

  describe('getAccountsLoadingStatus', () => {
    it('returns loading entries only for the requested account ids', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'accountSwitch',
        [ACCOUNT_ID_B]: 'unlock',
      });

      expect(
        getAccountsLoadingStatus(state, [ACCOUNT_ID_A, ACCOUNT_ID_C]),
      ).toStrictEqual({ [ACCOUNT_ID_A]: 'accountSwitch' });
    });

    it('returns an empty record when none of the requested accounts are loading', () => {
      const state = createState({ [ACCOUNT_ID_B]: 'unlock' });

      expect(
        getAccountsLoadingStatus(state, [ACCOUNT_ID_A, ACCOUNT_ID_C]),
      ).toStrictEqual({});
    });

    it('returns an empty record for an empty account list', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'accountSwitch' });

      expect(getAccountsLoadingStatus(state, [])).toStrictEqual({});
    });
  });

  describe('isAnyAccountLoading', () => {
    it('returns true when any requested account is loading', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'accountSwitch',
        [ACCOUNT_ID_B]: 'unlock',
      });

      expect(isAnyAccountLoading(state, [ACCOUNT_ID_B, ACCOUNT_ID_C])).toBe(
        true,
      );
    });

    it('returns false when none of the requested accounts are loading', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'accountSwitch' });

      expect(isAnyAccountLoading(state, [ACCOUNT_ID_B, ACCOUNT_ID_C])).toBe(
        false,
      );
    });

    it('defaults to all accounts when no account ids are given', () => {
      expect(isAnyAccountLoading(createState({}))).toBe(false);
      expect(
        isAnyAccountLoading(createState({ [ACCOUNT_ID_C]: 'accountSwitch' })),
      ).toBe(true);
    });
  });
});
