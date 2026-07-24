import { createTimestampTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import type { Hex } from '@metamask/utils';

import type { ChecksumCaveat } from '../types.js';
import { getChecksumEnforcersByChainId } from '../utils.js';
import { expiryRule } from './expiryRule.js';

describe('expiryRule', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const contractAddresses = getChecksumEnforcersByChainId(contracts);
  const { timestampEnforcer, nonceEnforcer } = contractAddresses;
  const requiredEnforcers = new Map<Hex, number>([[nonceEnforcer, 1]]);

  it('returns null when no TimestampEnforcer caveat is present', () => {
    const caveats: ChecksumCaveat[] = [
      { enforcer: nonceEnforcer, terms: '0x' as Hex, args: '0x' as Hex },
    ];

    expect(
      expiryRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toBeNull();
  });

  it('returns an expiry rule with the decoded timestamp when TimestampEnforcer is present', () => {
    const beforeThreshold = 1_750_000_000;
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          afterThreshold: 0,
          beforeThreshold,
        }),
        args: '0x' as Hex,
      },
    ];

    expect(
      expiryRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'expiry',
      data: { timestamp: beforeThreshold },
    });
  });

  it('ignores caveats from unrelated enforcers', () => {
    const beforeThreshold = 1_700_000_000;
    const caveats: ChecksumCaveat[] = [
      { enforcer: nonceEnforcer, terms: '0x' as Hex, args: '0x' as Hex },
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          afterThreshold: 0,
          beforeThreshold,
        }),
        args: '0x' as Hex,
      },
    ];

    expect(
      expiryRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'expiry',
      data: { timestamp: beforeThreshold },
    });
  });
});
