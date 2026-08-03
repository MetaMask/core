/**
 * CI guard for the advanced order-type contract (TAT-3511).
 *
 * Runs the exact same case matrix as `e2e/advanced-orders.e2e.ts` against the
 * simulated exchange, so the contract proven on testnet cannot silently
 * regress: every case must place, be visible in open-orders state with the
 * correct trigger data, and disappear after cancel.
 *
 * If this test and the e2e script ever disagree, they are wrong together —
 * both import the matrix from `e2e/lib/advancedOrders.ts`.
 */
import {
  buildCases,
  caseContext,
  buildPremiseCases,
  createSimulatedRunner,
  runCase,
  runPremiseCase,
  runTypedErrorCase,
} from '../../helpers/advancedOrders.js';
import type { CaseEvidence } from '../../helpers/advancedOrders.js';

// The simulated exchange has no market of its own, so the context describes the
// double: a reference price and precision the matrix derives everything from.
// A testnet run passes the venue's live values into the same shape.
const CTX = caseContext({
  symbol: 'BTC',
  mid: 50_000,
  szDecimals: 3,
  assetId: 0,
});

describe('advanced order types contract (e2e matrix)', () => {
  const cases = buildCases(CTX);
  const evidence = new Map<string, CaseEvidence>();

  beforeAll(async () => {
    for (const testCase of cases) {
      // Each case gets a fresh exchange so leftover orders cannot mask a
      // missing cancel.
      const runner = createSimulatedRunner();
      evidence.set(
        testCase.name,
        await runCase({ testCase, runner, mode: 'simulated', ctx: CTX }),
      );
    }
  });

  it('covers every advanced order type in scope', () => {
    expect(cases.map((testCase) => testCase.name)).toStrictEqual([
      'stop_market',
      'stop_limit',
      'take_profit_market',
      'take_profit_limit',
      'reduce_only',
      'partial_take_profit',
    ]);
  });

  describe.each([
    'stop_market',
    'stop_limit',
    'take_profit_market',
    'take_profit_limit',
    'reduce_only',
    'partial_take_profit',
  ])('%s', (caseName) => {
    it('passes every round-trip check', () => {
      const result = evidence.get(caseName);

      const failures = (result?.checks ?? [])
        .filter((check) => !check.pass)
        .map(
          (check) =>
            `${check.name}: expected ${JSON.stringify(
              check.expected,
            )}, got ${JSON.stringify(check.actual)}`,
        );

      expect(failures).toStrictEqual([]);
      expect(result?.pass).toBe(true);
    });

    it('is gone from open orders after cancel', () => {
      const result = evidence.get(caseName);

      expect(result?.cancelled).toBe(true);
      expect(result?.openOrdersAfterCancel).toStrictEqual([]);
    });
  });

  it('fails a trigger placement without a trigger price with a typed error', () => {
    const result = runTypedErrorCase(CTX);

    expect(result.actualError).toBe(result.expectedError);
    expect(result.pass).toBe(true);
  });

  describe('venue premises', () => {
    it('names the guard each premise justifies', () => {
      // A premise with no named guard is a claim nobody depends on, and would
      // quietly become dead weight in the matrix.
      for (const premiseCase of buildPremiseCases(CTX)) {
        expect(premiseCase.premise.length).toBeGreaterThan(0);
        expect(premiseCase.justifies).toMatch(/[A-Z_]{6,}|refuses|derives/u);
      }
    });

    it('records premises as skipped rather than passing them on the simulated exchange', async () => {
      // The double renders our own payload back and never rejects, so it cannot
      // establish what the venue does. Reporting these as passes would be the
      // worst outcome: a green run that proves nothing.
      for (const premiseCase of buildPremiseCases(CTX)) {
        const result = await runPremiseCase({
          premiseCase,
          runner: createSimulatedRunner(),
          mode: 'simulated',
          symbol: CTX.symbol,
        });

        expect(result.outcome).toBe('skipped');
        expect(result.pass).toBe(false);
        expect(result.note).toContain('simulated');
      }
    });
  });
});
