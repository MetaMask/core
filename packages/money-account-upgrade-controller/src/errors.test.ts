import {
  MoneyAccountUpgradeStepError,
  isMoneyAccountUpgradeStepError,
} from './errors.js';

describe('MoneyAccountUpgradeStepError', () => {
  it('records the step name and preserves an Error cause', () => {
    const cause = new Error('boom');

    const error = new MoneyAccountUpgradeStepError('build-delegation', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MoneyAccountUpgradeStepError');
    expect(error.step).toBe('build-delegation');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'Money Account upgrade failed at step "build-delegation": boom',
    );
  });

  it('stringifies a non-Error cause in the message', () => {
    const error = new MoneyAccountUpgradeStepError('register-intents', 42);

    expect(error.cause).toBe(42);
    expect(error.message).toBe(
      'Money Account upgrade failed at step "register-intents": 42',
    );
  });
});

describe('isMoneyAccountUpgradeStepError', () => {
  it('returns true for a MoneyAccountUpgradeStepError', () => {
    expect(
      isMoneyAccountUpgradeStepError(
        new MoneyAccountUpgradeStepError('associate-address', new Error('x')),
      ),
    ).toBe(true);
  });

  it('returns true for a structurally-equivalent error from another realm', () => {
    const lookalike = new Error('whatever');
    lookalike.name = 'MoneyAccountUpgradeStepError';
    (lookalike as unknown as { step: string }).step = 'associate-address';

    expect(isMoneyAccountUpgradeStepError(lookalike)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isMoneyAccountUpgradeStepError(new Error('nope'))).toBe(false);
  });

  it('returns false for an error with the right name but no step', () => {
    const error = new Error('nope');
    error.name = 'MoneyAccountUpgradeStepError';

    expect(isMoneyAccountUpgradeStepError(error)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isMoneyAccountUpgradeStepError(undefined)).toBe(false);
    expect(isMoneyAccountUpgradeStepError(null)).toBe(false);
    expect(isMoneyAccountUpgradeStepError('error')).toBe(false);
    expect(isMoneyAccountUpgradeStepError({ step: 'x' })).toBe(false);
  });
});
