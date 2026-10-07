import type { Hex } from '@metamask/utils';

import { getServerDepositData, hasServerDepositStep } from './deposit-step.js';
import type { ServerQuote, ServerTransactionStep } from './types.js';

const DEPOSIT_DATA_MOCK = '0xa9059cbb' as Hex;
const TO_MOCK = '0x1234567890123456789012345678901234567890' as Hex;

function buildTransactionStep(id?: string): ServerTransactionStep {
  return {
    chainId: 1,
    data: DEPOSIT_DATA_MOCK,
    id,
    to: TO_MOCK,
    type: 'transaction',
    value: '0',
  };
}

function buildQuote(steps: ServerQuote['steps']): ServerQuote {
  return { steps } as ServerQuote;
}

describe('Server deposit step', () => {
  describe('hasServerDepositStep', () => {
    it('returns true when a step is the deposit step', () => {
      expect(hasServerDepositStep([buildTransactionStep('deposit')])).toBe(
        true,
      );
    });

    it('returns false for swap-only routes', () => {
      expect(hasServerDepositStep([buildTransactionStep('swap')])).toBe(false);
    });

    it('returns false when steps carry no id', () => {
      expect(hasServerDepositStep([buildTransactionStep()])).toBe(false);
    });
  });

  describe('getServerDepositData', () => {
    it('returns the deposit transaction calldata', () => {
      expect(
        getServerDepositData(
          buildQuote([
            { ...buildTransactionStep('swap'), data: '0xdead' },
            buildTransactionStep('deposit'),
          ]),
        ),
      ).toBe(DEPOSIT_DATA_MOCK);
    });

    it('returns undefined when there is no deposit step', () => {
      expect(
        getServerDepositData(buildQuote([buildTransactionStep('swap')])),
      ).toBeUndefined();
    });
  });
});
