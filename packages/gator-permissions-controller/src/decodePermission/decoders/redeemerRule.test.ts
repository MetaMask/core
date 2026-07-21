import { createRedeemerTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { ChecksumCaveat } from '../types';
import { getChecksumEnforcersByChainId } from '../utils';
import { redeemerRule } from './redeemerRule';

describe('redeemerRule', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const contractAddresses = getChecksumEnforcersByChainId(contracts);
  const { redeemerEnforcer, nonceEnforcer } = contractAddresses;
  const requiredEnforcers = new Map<Hex, number>([[nonceEnforcer, 1]]);

  const ADDRESS_A: Hex = '0x1111111111111111111111111111111111111111';
  const ADDRESS_B: Hex = '0x2222222222222222222222222222222222222222';
  const CHECKSUM_REDEEMER_INPUT: Hex =
    '0x52908400098527886e0f7030069857d2e4169ee7';

  it('returns null when no RedeemerEnforcer caveat is present', () => {
    const caveats: ChecksumCaveat[] = [
      { enforcer: nonceEnforcer, terms: '0x' as Hex, args: '0x' as Hex },
    ];

    expect(
      redeemerRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toBeNull();
  });

  it('returns a redeemer rule with a single decoded address', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: redeemerEnforcer,
        terms: createRedeemerTerms({ redeemers: [ADDRESS_A] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      redeemerRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'redeemer',
      data: { addresses: [ADDRESS_A] },
    });
  });

  it('returns a redeemer rule with multiple decoded addresses', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: redeemerEnforcer,
        terms: createRedeemerTerms({ redeemers: [ADDRESS_A, ADDRESS_B] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      redeemerRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'redeemer',
      data: { addresses: [ADDRESS_A, ADDRESS_B] },
    });
  });

  it('returns checksummed redeemer addresses', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: redeemerEnforcer,
        terms: createRedeemerTerms({ redeemers: [CHECKSUM_REDEEMER_INPUT] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      redeemerRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'redeemer',
      data: { addresses: [getChecksumAddress(CHECKSUM_REDEEMER_INPUT)] },
    });
  });

  it('ignores caveats from unrelated enforcers', () => {
    const caveats: ChecksumCaveat[] = [
      { enforcer: nonceEnforcer, terms: '0x' as Hex, args: '0x' as Hex },
      {
        enforcer: redeemerEnforcer,
        terms: createRedeemerTerms({ redeemers: [ADDRESS_A] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      redeemerRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'redeemer',
      data: { addresses: [getChecksumAddress(ADDRESS_A)] },
    });
  });
});
