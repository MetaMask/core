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
    it('returns the loading status for a loading account', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'loading',
        [ACCOUNT_ID_B]: 'loaded',
      });

      expect(getAccountLoadingStatus(state, ACCOUNT_ID_A)).toBe('loading');
      expect(getAccountLoadingStatus(state, ACCOUNT_ID_B)).toBe('loaded');
    });

    it('returns undefined when the account has no loading status', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'loading' });

      expect(getAccountLoadingStatus(state, ACCOUNT_ID_B)).toBeUndefined();
    });

    it('returns undefined when no account has a loading status', () => {
      const state = createState({});

      expect(getAccountLoadingStatus(state, ACCOUNT_ID_A)).toBeUndefined();
    });
  });

  describe('isAccountLoading', () => {
    it('returns true only while the account is loading', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'loading',
        [ACCOUNT_ID_B]: 'loaded',
      });

      expect(isAccountLoading(state, ACCOUNT_ID_A)).toBe(true);
      expect(isAccountLoading(state, ACCOUNT_ID_B)).toBe(false);
    });

    it('returns false when the account has no loading status', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'loading' });

      expect(isAccountLoading(state, ACCOUNT_ID_B)).toBe(false);
    });

    it('returns false when no account has a loading status', () => {
      const state = createState({});

      expect(isAccountLoading(state, ACCOUNT_ID_A)).toBe(false);
    });
  });

  describe('getAccountsLoadingStatus', () => {
    it('returns statuses only for the requested account ids', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'loading',
        [ACCOUNT_ID_B]: 'loaded',
      });

      expect(
        getAccountsLoadingStatus(state, [ACCOUNT_ID_A, ACCOUNT_ID_C]),
      ).toStrictEqual({ [ACCOUNT_ID_A]: 'loading' });
    });

    it('returns an empty record when none of the requested accounts have a status', () => {
      const state = createState({ [ACCOUNT_ID_B]: 'loaded' });

      expect(
        getAccountsLoadingStatus(state, [ACCOUNT_ID_A, ACCOUNT_ID_C]),
      ).toStrictEqual({});
    });

    it('returns an empty record for an empty account list', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'loading' });

      expect(getAccountsLoadingStatus(state, [])).toStrictEqual({});
    });
  });

  describe('isAnyAccountLoading', () => {
    it('returns true when any requested account is loading', () => {
      const state = createState({
        [ACCOUNT_ID_A]: 'loading',
        [ACCOUNT_ID_B]: 'loaded',
      });

      expect(isAnyAccountLoading(state, [ACCOUNT_ID_A, ACCOUNT_ID_C])).toBe(
        true,
      );
    });

    it('returns false when none of the requested accounts are loading', () => {
      const state = createState({ [ACCOUNT_ID_A]: 'loaded' });

      expect(isAnyAccountLoading(state, [ACCOUNT_ID_B, ACCOUNT_ID_C])).toBe(
        false,
      );
    });

    it('defaults to all accounts when no account ids are given', () => {
      expect(isAnyAccountLoading(createState({}))).toBe(false);
      expect(
        isAnyAccountLoading(createState({ [ACCOUNT_ID_C]: 'loaded' })),
      ).toBe(false);
      expect(
        isAnyAccountLoading(createState({ [ACCOUNT_ID_C]: 'loading' })),
      ).toBe(true);
    });
  });
});
