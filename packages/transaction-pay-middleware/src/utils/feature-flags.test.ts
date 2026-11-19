/* eslint-disable @typescript-eslint/naming-convention */
import type { Json } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { isPayFlowEnabled, isWalletPayTypeAllowed } from './feature-flags.js';

const PERPS_TERMINAL = 'https://perps-terminal.metamask.com';
const BOTH_TYPES = ['perpsDeposit', 'perpsWithdraw'];

/**
 * Builds remote feature flags with a `confirmations_pay_rpc` value.
 *
 * @param flag - The flag value.
 * @returns The remote feature flags.
 */
function buildFlags(flag: Json): Record<string, Json> {
  return { confirmations_pay_rpc: flag };
}

/**
 * Builds a `confirmations_pay_rpc` value.
 *
 * @param dapps - Per-dapp configs.
 * @param allowedTypes - Top-level allowed types.
 * @returns The flag value.
 */
function buildFlag(
  dapps: Record<string, { allowedTypes: Json }>,
  allowedTypes: Json = BOTH_TYPES,
): Json {
  return { allowedTypes, dapps };
}

describe('isWalletPayTypeAllowed', () => {
  describe('allowlist', () => {
    it('allows a listed dapp to request an enabled type', () => {
      const flags = buildFlags(
        buildFlag({ [PERPS_TERMINAL]: { allowedTypes: BOTH_TYPES } }),
      );

      expect(
        isWalletPayTypeAllowed(flags, PERPS_TERMINAL, 'perpsDeposit'),
      ).toBe(true);
    });

    it('rejects a dapp that is not listed', () => {
      const flags = buildFlags(
        buildFlag({ [PERPS_TERMINAL]: { allowedTypes: BOTH_TYPES } }),
      );

      expect(
        isWalletPayTypeAllowed(flags, 'https://other.example', 'perpsDeposit'),
      ).toBe(false);
    });

    it('rejects a type the dapp is not listed for', () => {
      const flags = buildFlags(
        buildFlag({ [PERPS_TERMINAL]: { allowedTypes: ['perpsDeposit'] } }),
      );

      expect(
        isWalletPayTypeAllowed(flags, PERPS_TERMINAL, 'perpsWithdraw'),
      ).toBe(false);
    });

    it('rejects a type missing from the top-level allowedTypes', () => {
      const flags = buildFlags(
        buildFlag({ [PERPS_TERMINAL]: { allowedTypes: BOTH_TYPES } }, [
          'perpsWithdraw',
        ]),
      );

      expect(
        isWalletPayTypeAllowed(flags, PERPS_TERMINAL, 'perpsDeposit'),
      ).toBe(false);
    });
  });

  describe('origin matching', () => {
    const flags = buildFlags(
      buildFlag({
        [PERPS_TERMINAL]: { allowedTypes: BOTH_TYPES },
        'http://localhost': { allowedTypes: BOTH_TYPES },
      }),
    );

    it('does not match a different scheme', () => {
      expect(
        isWalletPayTypeAllowed(
          flags,
          'http://perps-terminal.metamask.com',
          'perpsDeposit',
        ),
      ).toBe(false);
    });

    it('does not match a different port on a non-localhost origin', () => {
      expect(
        isWalletPayTypeAllowed(
          flags,
          'https://perps-terminal.metamask.com:8443',
          'perpsDeposit',
        ),
      ).toBe(false);
    });

    it('ignores a path on the request origin', () => {
      expect(
        isWalletPayTypeAllowed(
          flags,
          `${PERPS_TERMINAL}/trade`,
          'perpsDeposit',
        ),
      ).toBe(true);
    });

    it.each(['http://localhost', 'http://localhost:3000'])(
      'matches %s against the http://localhost entry',
      (origin) => {
        expect(isWalletPayTypeAllowed(flags, origin, 'perpsDeposit')).toBe(
          true,
        );
      },
    );

    it('does not match https://localhost against the http://localhost entry', () => {
      expect(
        isWalletPayTypeAllowed(flags, 'https://localhost:3000', 'perpsDeposit'),
      ).toBe(false);
    });

    it('rejects an origin that is not a valid URL', () => {
      expect(isWalletPayTypeAllowed(flags, 'not a url', 'perpsDeposit')).toBe(
        false,
      );
    });
  });

  describe('malformed flag', () => {
    it.each([
      ['missing', {}],
      ['null', buildFlags(null)],
      ['an array', buildFlags([])],
      ['a string', buildFlags('enabled')],
      [
        'given a non-array allowedTypes',
        buildFlags(
          buildFlag(
            { [PERPS_TERMINAL]: { allowedTypes: 'perpsDeposit' } },
            'perpsDeposit',
          ),
        ),
      ],
      [
        'given dapps that are not an object',
        buildFlags({ allowedTypes: BOTH_TYPES, dapps: [PERPS_TERMINAL] }),
      ],
      [
        'given a dapp config that is not an object',
        buildFlags({
          allowedTypes: BOTH_TYPES,
          dapps: { [PERPS_TERMINAL]: 'perpsDeposit' },
        }),
      ],
    ])('allows nothing when the flag is %s', (_label, flags) => {
      expect(
        isWalletPayTypeAllowed(flags, PERPS_TERMINAL, 'perpsDeposit'),
      ).toBe(false);
    });
  });
});

describe('isPayFlowEnabled', () => {
  it.each([
    [
      'default, ignoring a non-object type config',
      { default: { enabled: true }, perpsWithdraw: true },
    ],
    ['default', { default: { enabled: true } }],
    ['overrides', { overrides: { perpsWithdraw: { enabled: true } } }],
    ['a direct key', { perpsWithdraw: { enabled: true } }],
  ])('is enabled via %s', (_label, flag) => {
    expect(
      isPayFlowEnabled({ confirmations_pay_post_quote: flag }, 'perpsWithdraw'),
    ).toBe(true);
  });

  it.each([
    ['missing', {}],
    ['not an object', { confirmations_pay_post_quote: 'enabled' }],
    [
      'disabled by default',
      { confirmations_pay_post_quote: { default: { enabled: false } } },
    ],
    [
      'disabled for the type',
      {
        confirmations_pay_post_quote: {
          default: { enabled: true },
          overrides: { perpsWithdraw: { enabled: false } },
        },
      },
    ],
    [
      'given a non-object type config and no default',
      { confirmations_pay_post_quote: { perpsWithdraw: true } },
    ],
    [
      'given a malformed default',
      { confirmations_pay_post_quote: { default: true } },
    ],
  ])('is disabled when %s', (_label, flags) => {
    expect(
      isPayFlowEnabled(flags as Record<string, Json>, 'perpsWithdraw'),
    ).toBe(false);
  });
});
