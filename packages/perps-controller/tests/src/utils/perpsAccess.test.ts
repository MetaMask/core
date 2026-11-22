import { describe, expect, it } from 'vitest';

import type {
  PerpsAccess,
  PerpsProgram,
  PerpsVenueAccess,
} from '../../../src/types/index.js';
import {
  findVenueAccess,
  getFallbackVenues,
  getListedMarketSources,
  getVenueKey,
  isProviderFullyOpen,
  isSamePerpsAccess,
  normalizeMarketSource,
  resolvePerpsAccess,
} from '../../../src/utils/perpsAccess.js';

const ADDRESS = '0x00000000000000000000000000000000000000aa' as const;

const venue = (
  marketSource: string | null,
  overrides: Partial<PerpsVenueAccess> = {},
): PerpsVenueAccess => ({
  providerId: 'hyperliquid',
  marketSource,
  listed: true,
  access: 'trade',
  ...overrides,
});

const usProgram: PerpsProgram = {
  id: 'us',
  enrollable: true,
  venues: [venue('ignp')],
};

const allowedVenues = [venue(null), venue('xyz')];

describe('perpsAccess utils', () => {
  describe('normalizeMarketSource', () => {
    it.each([null, undefined, '', 'main', ' MAIN '])(
      'treats %j as the main venue',
      (value) => {
        expect(normalizeMarketSource(value)).toBe('main');
      },
    );

    it('lowercases a DEX id', () => {
      expect(normalizeMarketSource('XYZ')).toBe('xyz');
    });
  });

  describe('findVenueAccess', () => {
    it('matches the main venue whether written as null or main', () => {
      expect(findVenueAccess(allowedVenues, 'hyperliquid', 'main')).toBe(
        allowedVenues[0],
      );
      expect(findVenueAccess(allowedVenues, 'HyperLiquid', undefined)).toBe(
        allowedVenues[0],
      );
    });

    it('returns undefined for an absent venue', () => {
      expect(findVenueAccess(allowedVenues, 'lighter', null)).toBeUndefined();
    });
  });

  describe('isProviderFullyOpen', () => {
    it('requires venues that are all listed and tradable', () => {
      const access: PerpsAccess = {
        address: ADDRESS,
        venues: [
          venue(null),
          venue(null, { providerId: 'lighter', access: 'view' }),
        ],
      };
      expect(isProviderFullyOpen(access, 'hyperliquid')).toBe(true);
      expect(isProviderFullyOpen(access, 'lighter')).toBe(false);
      expect(
        isProviderFullyOpen({ address: ADDRESS, venues: [] }, 'lighter'),
      ).toBe(false);
    });
  });

  describe('getListedMarketSources', () => {
    it('returns normalized listed sources of one provider', () => {
      const access: PerpsAccess = {
        address: ADDRESS,
        venues: [
          venue(null),
          venue('xyz', { listed: false }),
          venue(null, { providerId: 'lighter' }),
        ],
      };
      expect(getListedMarketSources(access, 'hyperliquid')).toStrictEqual([
        'main',
      ]);
    });
  });

  describe('getFallbackVenues', () => {
    it('keeps today venues tradable in an allowed region', () => {
      expect(
        getFallbackVenues({
          isRegionAllowed: true,
          hyperLiquidDexes: ['main', 'xyz'],
          isLighterEnabled: true,
        }),
      ).toStrictEqual([
        venue(null),
        venue('xyz'),
        venue(null, { providerId: 'lighter' }),
      ]);
    });

    it('makes every venue an unlisted view otherwise', () => {
      expect(
        getFallbackVenues({
          isRegionAllowed: false,
          hyperLiquidDexes: [],
          isLighterEnabled: false,
        }),
      ).toStrictEqual([venue(null, { listed: false, access: 'view' })]);
    });
  });

  describe('resolvePerpsAccess', () => {
    const resolve = (
      overrides: Partial<Parameters<typeof resolvePerpsAccess>[0]> = {},
    ): PerpsAccess =>
      resolvePerpsAccess({
        address: ADDRESS,
        venues: allowedVenues,
        programs: [usProgram],
        enrollments: {},
        positionVenueKeys: new Set(),
        ...overrides,
      });

    it('gives an approved wallet its program venues', () => {
      expect(resolve({ enrollments: { us: 'approved' } })).toStrictEqual({
        address: ADDRESS,
        venues: [venue('ignp')],
      });
    });

    it('makes a reduce-only wallet program venues view-only', () => {
      expect(
        resolve({ enrollments: { us: 'reduceOnly' } }).venues,
      ).toStrictEqual([venue('ignp', { access: 'view' })]);
    });

    it('gives any other wallet the region venues', () => {
      expect(resolve({ enrollments: { us: 'none' } }).venues).toStrictEqual(
        allowedVenues,
      );
    });

    it('makes program venues with positions view-only and unlisted outside the region', () => {
      expect(
        resolve({
          positionVenueKeys: new Set([getVenueKey('hyperliquid', 'ignp')]),
        }).venues,
      ).toStrictEqual([
        ...allowedVenues,
        venue('ignp', { listed: false, access: 'view' }),
      ]);
    });

    it('keeps the region listing for a frozen program venue the region lists', () => {
      expect(
        resolve({
          venues: [venue('ignp')],
          positionVenueKeys: new Set([getVenueKey('hyperliquid', 'ignp')]),
        }).venues,
      ).toStrictEqual([venue('ignp', { access: 'view' })]);
    });
  });

  describe('isSamePerpsAccess', () => {
    const access: PerpsAccess = { address: ADDRESS, venues: [venue(null)] };

    it('compares null values', () => {
      expect(isSamePerpsAccess(null, null)).toBe(true);
      expect(isSamePerpsAccess(access, null)).toBe(false);
    });

    it('compares address case-insensitively and venues by value', () => {
      expect(
        isSamePerpsAccess(access, {
          address: '0x00000000000000000000000000000000000000AA',
          venues: [venue('main')],
        }),
      ).toBe(true);
      expect(
        isSamePerpsAccess(access, {
          address: ADDRESS,
          venues: [venue(null, { access: 'view' })],
        }),
      ).toBe(false);
      expect(isSamePerpsAccess(access, { address: ADDRESS, venues: [] })).toBe(
        false,
      );
    });
  });
});
