import {
  createInitialState,
  transition,
} from './wallet-registration-machine.js';
import type {
  WalletRegistrationEvent,
  WalletRegistrationState,
} from './wallet-registration-machine.js';

const run = (
  events: WalletRegistrationEvent[],
  initial: WalletRegistrationState = createInitialState(),
): WalletRegistrationState =>
  events.reduce((state, event) => transition(state, event), initial);

describe('wallet registration machine: prerequisites and lookup', () => {
  it('starts idle', () => {
    expect(createInitialState().status).toBe('idle');
  });

  it('start moves idle to preparing', () => {
    expect(run([{ type: 'START' }]).status).toBe('preparing');
  });

  it('an active existing registration skips signing and completes', () => {
    const state = run([{ type: 'START' }, { type: 'LOOKUP_ACTIVE' }]);
    expect(state.status).toBe('alreadyRegistered');
  });

  it('a disabled existing registration enters registeredDisabled', () => {
    const state = run([{ type: 'START' }, { type: 'LOOKUP_DISABLED' }]);
    expect(state.status).toBe('registeredDisabled');
  });

  it('an absent registration proceeds to signing', () => {
    const state = run([{ type: 'START' }, { type: 'LOOKUP_ABSENT' }]);
    expect(state.status).toBe('signing');
  });

  it('a failed lookup enters lookupUnavailable and never assumes absent', () => {
    const state = run([{ type: 'START' }, { type: 'LOOKUP_FAILED' }]);
    expect(state.status).toBe('lookupUnavailable');
  });

  it('missing customer, money account, upgrade, and unsupported account block', () => {
    expect(
      run([{ type: 'START' }, { type: 'PREREQ_MISSING_CUSTOMER' }]).status,
    ).toBe('missingCustomer');
    expect(
      run([{ type: 'START' }, { type: 'PREREQ_MISSING_MONEY_ACCOUNT' }]).status,
    ).toBe('missingMoneyAccount');
    expect(
      run([{ type: 'START' }, { type: 'PREREQ_UPGRADE_INCOMPLETE' }]).status,
    ).toBe('upgradeIncomplete');
    expect(
      run([{ type: 'START' }, { type: 'PREREQ_UNSUPPORTED_ACCOUNT' }]).status,
    ).toBe('unsupportedAccount');
  });

  it('a blocked blockchain enters blockchainBlocked', () => {
    const state = run([{ type: 'START' }, { type: 'BLOCKCHAIN_BLOCKED' }]);
    expect(state.status).toBe('blockchainBlocked');
  });
});

describe('wallet registration machine: signing', () => {
  const atSigning = (): WalletRegistrationState =>
    run([{ type: 'START' }, { type: 'LOOKUP_ABSENT' }]);

  it('a locked keyring during signing waits then resumes the same attempt', () => {
    const locked = transition(atSigning(), { type: 'WALLET_LOCKED' });
    expect(locked.status).toBe('awaitingUnlock');

    const resumed = transition(locked, { type: 'WALLET_UNLOCKED' });
    expect(resumed.status).toBe('signing');
  });

  it('successful signing moves to submitting', () => {
    expect(transition(atSigning(), { type: 'SIGN_OK' }).status).toBe(
      'submitting',
    );
  });

  it('explicit user rejection reaches cancelled', () => {
    expect(transition(atSigning(), { type: 'SIGN_REJECTED' }).status).toBe(
      'cancelled',
    );
  });

  it('classifies signing failures as retryable or terminal', () => {
    expect(
      transition(atSigning(), { type: 'SIGN_FAILED', retryable: true }).status,
    ).toBe('failedRetryable');
    expect(
      transition(atSigning(), { type: 'SIGN_FAILED', retryable: false }).status,
    ).toBe('failedTerminal');
  });

  it('cancellation during signing aborts without failing', () => {
    expect(transition(atSigning(), { type: 'CANCEL' }).status).toBe(
      'cancelled',
    );
  });
});

describe('wallet registration machine: submitting outcomes', () => {
  const atSubmitting = (): WalletRegistrationState =>
    run([{ type: 'START' }, { type: 'LOOKUP_ABSENT' }, { type: 'SIGN_OK' }]);

  it('200 reaches registered', () => {
    expect(transition(atSubmitting(), { type: 'SUBMIT_OK' }).status).toBe(
      'registered',
    );
  });

  it('any 409 enters disambiguate409', () => {
    expect(
      transition(atSubmitting(), {
        type: 'SUBMIT_CONFLICT',
        conflictType: 'address-exists',
      }).status,
    ).toBe('disambiguate409');
  });

  it('timeout / 5xx enters checkThenRetry', () => {
    expect(
      transition(atSubmitting(), { type: 'SUBMIT_TRANSIENT' }).status,
    ).toBe('checkThenRetry');
  });

  it('a UTC-rollover 400 rebuilds and re-signs once', () => {
    expect(
      transition(atSubmitting(), {
        type: 'SUBMIT_VALIDATION',
        utcRollover: true,
      }).status,
    ).toBe('signing');
  });

  it('a non-rollover 400 is terminal', () => {
    expect(
      transition(atSubmitting(), {
        type: 'SUBMIT_VALIDATION',
        utcRollover: false,
      }).status,
    ).toBe('failedTerminal');
  });

  it('401 / 403 / 404 are terminal', () => {
    expect(transition(atSubmitting(), { type: 'SUBMIT_TERMINAL' }).status).toBe(
      'failedTerminal',
    );
  });

  it('429 becomes retryable', () => {
    expect(
      transition(atSubmitting(), { type: 'SUBMIT_RATE_LIMITED' }).status,
    ).toBe('failedRetryable');
  });

  it('cancellation during submitting aborts without failing', () => {
    expect(transition(atSubmitting(), { type: 'CANCEL' }).status).toBe(
      'cancelled',
    );
  });
});

describe('wallet registration machine: 409 disambiguation', () => {
  const atDisambiguate = (
    conflictType: 'address-exists' | 'idempotency',
  ): WalletRegistrationState =>
    run([
      { type: 'START' },
      { type: 'LOOKUP_ABSENT' },
      { type: 'SIGN_OK' },
      { type: 'SUBMIT_CONFLICT', conflictType },
    ]);

  it('an active list match after 409 completes as alreadyRegistered', () => {
    expect(
      transition(atDisambiguate('address-exists'), { type: 'LOOKUP_ACTIVE' })
        .status,
    ).toBe('alreadyRegistered');
  });

  it('a disabled list match after 409 enters registeredDisabled', () => {
    expect(
      transition(atDisambiguate('address-exists'), { type: 'LOOKUP_DISABLED' })
        .status,
    ).toBe('registeredDisabled');
  });

  it('address-exists 409 plus GET miss is terminal foreignAddressConflict', () => {
    expect(
      transition(atDisambiguate('address-exists'), { type: 'LOOKUP_ABSENT' })
        .status,
    ).toBe('foreignAddressConflict');
  });

  it('idempotency 409 plus GET miss is retryable with a new key', () => {
    expect(
      transition(atDisambiguate('idempotency'), { type: 'LOOKUP_ABSENT' })
        .status,
    ).toBe('failedRetryable');
  });

  it('a failed GET during disambiguation is lookupUnavailable', () => {
    expect(
      transition(atDisambiguate('address-exists'), { type: 'LOOKUP_FAILED' })
        .status,
    ).toBe('lookupUnavailable');
  });

  it('cancellation during disambiguation does not become a failure', () => {
    expect(
      transition(atDisambiguate('address-exists'), { type: 'CANCEL' }).status,
    ).toBe('cancelled');
  });
});

describe('wallet registration machine: checkThenRetry after 5xx/timeout', () => {
  const atCheck = (
    initial?: WalletRegistrationState,
  ): WalletRegistrationState =>
    run(
      [
        { type: 'START' },
        { type: 'LOOKUP_ABSENT' },
        { type: 'SIGN_OK' },
        { type: 'SUBMIT_TRANSIENT' },
      ],
      initial,
    );

  it('a GET showing the resource completes without another POST', () => {
    expect(transition(atCheck(), { type: 'LOOKUP_ACTIVE' }).status).toBe(
      'alreadyRegistered',
    );
  });

  it('a disabled GET result enters registeredDisabled', () => {
    expect(transition(atCheck(), { type: 'LOOKUP_DISABLED' }).status).toBe(
      'registeredDisabled',
    );
  });

  it('an absent GET result retries signing within the attempt ceiling', () => {
    expect(transition(atCheck(), { type: 'LOOKUP_ABSENT' }).status).toBe(
      'signing',
    );
  });

  it('a failed GET during reconciliation is lookupUnavailable', () => {
    expect(transition(atCheck(), { type: 'LOOKUP_FAILED' }).status).toBe(
      'lookupUnavailable',
    );
  });

  it('stops retrying once the attempt ceiling is reached', () => {
    let state = createInitialState();
    state = run([{ type: 'START' }, { type: 'LOOKUP_ABSENT' }], state);
    // Loop sign -> transient -> absent until the ceiling flips to retryable.
    for (let i = 0; i < 5; i++) {
      if (state.status === 'signing') {
        state = transition(state, { type: 'SIGN_OK' });
        state = transition(state, { type: 'SUBMIT_TRANSIENT' });
        state = transition(state, { type: 'LOOKUP_ABSENT' });
      }
    }
    expect(state.status).toBe('failedRetryable');
  });

  it('cancellation during checkThenRetry does not become a failure', () => {
    expect(transition(atCheck(), { type: 'CANCEL' }).status).toBe('cancelled');
  });
});

describe('wallet registration machine: retry, resume, and concurrency', () => {
  it('retry from failedRetryable re-checks server state via preparing', () => {
    const state = run([
      { type: 'START' },
      { type: 'LOOKUP_ABSENT' },
      { type: 'SIGN_OK' },
      { type: 'SUBMIT_RATE_LIMITED' },
      { type: 'RETRY' },
    ]);
    expect(state.status).toBe('preparing');
  });

  it('retry from lookupUnavailable re-checks server state via preparing', () => {
    const state = run([
      { type: 'START' },
      { type: 'LOOKUP_FAILED' },
      { type: 'RETRY' },
    ]);
    expect(state.status).toBe('preparing');
  });

  it('retry from cancelled restarts via preparing', () => {
    const state = run([
      { type: 'START' },
      { type: 'LOOKUP_ABSENT' },
      { type: 'CANCEL' },
      { type: 'RETRY' },
    ]);
    expect(state.status).toBe('preparing');
  });

  it('retry from a blocked prerequisite re-checks via preparing', () => {
    const state = run([
      { type: 'START' },
      { type: 'PREREQ_MISSING_MONEY_ACCOUNT' },
      { type: 'RETRY' },
    ]);
    expect(state.status).toBe('preparing');
  });

  it('a second START while in-flight is ignored (one operation)', () => {
    const inFlight = run([{ type: 'START' }, { type: 'LOOKUP_ABSENT' }]);
    expect(inFlight.status).toBe('signing');
    expect(transition(inFlight, { type: 'START' }).status).toBe('signing');
  });

  it('ignores events that do not apply to the current state', () => {
    const preparing = run([{ type: 'START' }]);
    expect(transition(preparing, { type: 'SUBMIT_OK' }).status).toBe(
      'preparing',
    );
  });

  it('terminal success states ignore further events', () => {
    const registered = run([
      { type: 'START' },
      { type: 'LOOKUP_ABSENT' },
      { type: 'SIGN_OK' },
      { type: 'SUBMIT_OK' },
    ]);
    expect(transition(registered, { type: 'RETRY' }).status).toBe('registered');
  });

  it('unsupportedAccount is terminal and does not retry', () => {
    const state = run([
      { type: 'START' },
      { type: 'PREREQ_UNSUPPORTED_ACCOUNT' },
      { type: 'RETRY' },
    ]);
    expect(state.status).toBe('unsupportedAccount');
  });
});
