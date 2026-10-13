import { getRelayDepositData, hasRelayDepositStep } from './deposit-step.js';
import type { RelayQuote } from './types.js';

const DEPOSIT_DATA_MOCK = '0xa9059cbb';

function buildQuote(steps: unknown[]): RelayQuote {
  return { steps } as RelayQuote;
}

describe('Relay deposit step', () => {
  describe('hasRelayDepositStep', () => {
    it('returns true when a step is the deposit step', () => {
      expect(hasRelayDepositStep(buildQuote([{ id: 'deposit' }]).steps)).toBe(
        true,
      );
    });

    it('returns false for swap-only routes', () => {
      expect(hasRelayDepositStep(buildQuote([{ id: 'swap' }]).steps)).toBe(
        false,
      );
    });
  });

  describe('getRelayDepositData', () => {
    it('returns the deposit transaction calldata', () => {
      expect(
        getRelayDepositData(
          buildQuote([
            {
              id: 'deposit',
              items: [{ data: { data: DEPOSIT_DATA_MOCK } }],
              kind: 'transaction',
            },
          ]),
        ),
      ).toBe(DEPOSIT_DATA_MOCK);
    });

    it('returns undefined when the deposit step is not a transaction', () => {
      expect(
        getRelayDepositData(
          buildQuote([{ id: 'deposit', items: [], kind: 'signature' }]),
        ),
      ).toBeUndefined();
    });

    it('returns undefined when there is no deposit step', () => {
      expect(getRelayDepositData(buildQuote([]))).toBeUndefined();
    });
  });
});
