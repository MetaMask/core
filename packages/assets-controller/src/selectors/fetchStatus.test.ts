import { describe, expect, it } from 'vitest';

import type { AssetsControllerState } from '../AssetsController.js';
import type {
  AccountId,
  AssetsFetchPhaseStatus,
  AssetsFetchStatus,
} from '../types.js';
import { getAccountFetchErrors, isAccountFetching } from './fetchStatus.js';

const ACCOUNT_ID = 'mock-account-id' as AccountId;

const phase = (
  overrides: Partial<AssetsFetchPhaseStatus> = {},
): AssetsFetchPhaseStatus => ({
  fetchStatus: 'idle',
  errors: {},
  updatedAt: null,
  ...overrides,
});

const createState = (
  status: AssetsFetchStatus,
): Pick<AssetsControllerState, 'assetsFetchStatus'> => ({
  assetsFetchStatus: { [ACCOUNT_ID]: status },
});

describe('fetchStatus selectors', () => {
  describe('isAccountFetching', () => {
    it('is false for unknown accounts', () => {
      expect(isAccountFetching({ assetsFetchStatus: {} }, ACCOUNT_ID)).toBe(
        false,
      );
      expect(isAccountFetching({}, ACCOUNT_ID)).toBe(false);
    });

    it('is true while either phase fetches', () => {
      expect(
        isAccountFetching(
          createState({
            fast: phase({ fetchStatus: 'fetching' }),
            background: phase(),
          }),
          ACCOUNT_ID,
        ),
      ).toBe(true);
      expect(
        isAccountFetching(
          createState({
            fast: phase(),
            background: phase({ fetchStatus: 'fetching' }),
          }),
          ACCOUNT_ID,
        ),
      ).toBe(true);
      expect(
        isAccountFetching(
          createState({ fast: phase(), background: phase() }),
          ACCOUNT_ID,
        ),
      ).toBe(false);
    });
  });

  describe('getAccountFetchErrors', () => {
    it('returns both phases separately and empty objects for unknown accounts', () => {
      expect(getAccountFetchErrors({}, ACCOUNT_ID)).toStrictEqual({
        fast: {},
        background: {},
      });

      expect(
        getAccountFetchErrors(
          createState({
            fast: phase({ errors: { 'eip155:1': 'fast failed' } }),
            background: phase({ errors: { 'eip155:137': 'bg failed' } }),
          }),
          ACCOUNT_ID,
        ),
      ).toStrictEqual({
        fast: { 'eip155:1': 'fast failed' },
        background: { 'eip155:137': 'bg failed' },
      });
    });
  });
});
