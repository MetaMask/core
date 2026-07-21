import {
  MoneyAccountUpgradeStepError,
  TerminalUpgradeError,
  isMoneyAccountUpgradeStepError,
  isTerminalMoneyAccountUpgradeError,
} from './errors';

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

  it('is non-terminal when the cause is a plain Error', () => {
    const error = new MoneyAccountUpgradeStepError(
      'associate-address',
      new Error('network down'),
    );

    expect(error.terminal).toBe(false);
  });

  it('is terminal when the cause is a TerminalUpgradeError', () => {
    const error = new MoneyAccountUpgradeStepError(
      'eip-7702-authorization',
      new TerminalUpgradeError('delegated elsewhere'),
    );

    expect(error.terminal).toBe(true);
  });

  it('is terminal when the cause is a structurally-terminal error from another realm', () => {
    const cause = new Error('delegated elsewhere');
    (cause as unknown as { terminal: boolean }).terminal = true;

    const error = new MoneyAccountUpgradeStepError(
      'eip-7702-authorization',
      cause,
    );

    expect(error.terminal).toBe(true);
  });

  it('is non-terminal when the cause is a non-Error carrying a terminal property', () => {
    const error = new MoneyAccountUpgradeStepError('associate-address', {
      terminal: true,
    });

    expect(error.terminal).toBe(false);
  });
});

describe('TerminalUpgradeError', () => {
  it('is an Error marked as terminal', () => {
    const error = new TerminalUpgradeError('cannot recover');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TerminalUpgradeError');
    expect(error.message).toBe('cannot recover');
    expect(error.terminal).toBe(true);
  });
});

describe('isTerminalMoneyAccountUpgradeError', () => {
  it('returns true for a step error with a terminal cause', () => {
    expect(
      isTerminalMoneyAccountUpgradeError(
        new MoneyAccountUpgradeStepError(
          'eip-7702-authorization',
          new TerminalUpgradeError('delegated elsewhere'),
        ),
      ),
    ).toBe(true);
  });

  it('returns false for a step error with a non-terminal cause', () => {
    expect(
      isTerminalMoneyAccountUpgradeError(
        new MoneyAccountUpgradeStepError('associate-address', new Error('x')),
      ),
    ).toBe(false);
  });

  it('returns false for an unwrapped TerminalUpgradeError', () => {
    expect(
      isTerminalMoneyAccountUpgradeError(new TerminalUpgradeError('x')),
    ).toBe(false);
  });

  it('returns false for non-step-error values', () => {
    expect(isTerminalMoneyAccountUpgradeError(undefined)).toBe(false);
    expect(isTerminalMoneyAccountUpgradeError(new Error('x'))).toBe(false);
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
