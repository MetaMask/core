import type { Hex } from '@metamask/utils';

import { getServerDepositData, hasServerDepositStep } from './deposit-step.js';
import type { ServerQuote, ServerTransactionStep } from './types.js';

const RECIPIENT_WORD_MOCK = '1'.padStart(64, '0');
const AMOUNT_WORD_MOCK = '2'.padStart(64, '0');
const TRANSFER_DATA_MOCK =
  `0xa9059cbb${RECIPIENT_WORD_MOCK}${AMOUNT_WORD_MOCK}` as Hex;
const TO_MOCK = '0x1234567890123456789012345678901234567890' as Hex;

function buildTransactionStep(
  overrides: Partial<ServerTransactionStep> = {},
): ServerTransactionStep {
  return {
    chainId: 1,
    data: TRANSFER_DATA_MOCK,
    to: TO_MOCK,
    type: 'transaction',
    value: '0',
    ...overrides,
  };
}

function buildQuote(steps: ServerQuote['steps']): ServerQuote {
  return { steps } as ServerQuote;
}

describe('Server deposit step', () => {
  describe('hasServerDepositStep', () => {
    it('returns true for a plain token transfer', () => {
      expect(hasServerDepositStep([buildTransactionStep()])).toBe(true);
    });

    it('returns true for an upper-case selector and hex value of zero', () => {
      expect(
        hasServerDepositStep([
          buildTransactionStep({
            data: `0xA9059CBB${RECIPIENT_WORD_MOCK}${AMOUNT_WORD_MOCK}` as Hex,
            value: '0x0',
          }),
        ]),
      ).toBe(true);
    });

    it('returns true when value is empty', () => {
      expect(hasServerDepositStep([buildTransactionStep({ value: '' })])).toBe(
        true,
      );
    });

    it('returns false for a transfer with extra calldata', () => {
      expect(
        hasServerDepositStep([
          buildTransactionStep({ data: `${TRANSFER_DATA_MOCK}abcd` as Hex }),
        ]),
      ).toBe(false);
    });

    it('returns false for truncated transfer calldata', () => {
      expect(
        hasServerDepositStep([buildTransactionStep({ data: '0xa9059cbb' })]),
      ).toBe(false);
    });

    it('returns false for other calls of the same length', () => {
      expect(
        hasServerDepositStep([
          buildTransactionStep({
            data: `0x095ea7b3${RECIPIENT_WORD_MOCK}${AMOUNT_WORD_MOCK}` as Hex,
          }),
        ]),
      ).toBe(false);
    });

    it('returns false when the step sends native value', () => {
      expect(hasServerDepositStep([buildTransactionStep({ value: '1' })])).toBe(
        false,
      );
    });

    it('returns false for signature steps', () => {
      expect(
        hasServerDepositStep([
          { type: 'signature' } as ServerQuote['steps'][number],
        ]),
      ).toBe(false);
    });
  });

  describe('getServerDepositData', () => {
    it('returns the plain token transfer calldata', () => {
      expect(
        getServerDepositData(
          buildQuote([
            buildTransactionStep({ data: '0xdead' }),
            buildTransactionStep(),
          ]),
        ),
      ).toBe(TRANSFER_DATA_MOCK);
    });

    it('returns undefined when there is no plain token transfer', () => {
      expect(
        getServerDepositData(
          buildQuote([buildTransactionStep({ data: '0xdead' })]),
        ),
      ).toBeUndefined();
    });
  });
});
