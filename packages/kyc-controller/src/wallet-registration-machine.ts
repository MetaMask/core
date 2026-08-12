/**
 * Pure, hand-rolled finite state machine for the MoonPay Iron self-hosted
 * wallet registration signing step. It follows the FSM convention used
 * elsewhere in `core` (no XState dependency): a single pure `transition`
 * reducer plus a data-driven transition table.
 *
 * Side effects (server lookups, signing, POSTing) live in the interpreter that
 * drives this machine; every effect result is fed back in as an event, so the
 * machine itself stays deterministic and trivially testable.
 */

/** Reason an ambiguous `409` was returned, captured for later reconciliation. */
export type ConflictType = 'address-exists' | 'idempotency';

/** Every state in the signing step. */
export type WalletRegistrationStatus =
  | 'idle'
  | 'preparing'
  | 'awaitingUnlock'
  | 'signing'
  | 'submitting'
  | 'disambiguate409'
  | 'checkThenRetry'
  | 'lookupUnavailable'
  | 'registered'
  | 'alreadyRegistered'
  | 'registeredDisabled'
  | 'foreignAddressConflict'
  | 'failedRetryable'
  | 'failedTerminal'
  | 'cancelled'
  | 'blockchainBlocked'
  | 'missingCustomer'
  | 'missingMoneyAccount'
  | 'upgradeIncomplete'
  | 'unsupportedAccount';

/** Machine context carried across transitions. */
export type WalletRegistrationContext = {
  /** Number of sign attempts made so far (used for the retry ceiling). */
  attempts: number;
  /** Maximum number of sign attempts before a retryable failure is surfaced. */
  maxAttempts: number;
  /** Conflict classification captured on a `409`, read during disambiguation. */
  conflictType?: ConflictType;
};

export type WalletRegistrationState = {
  status: WalletRegistrationStatus;
  context: WalletRegistrationContext;
};

/** Events the interpreter dispatches into the machine. */
export type WalletRegistrationEvent =
  | { type: 'START' }
  | { type: 'PREREQ_MISSING_CUSTOMER' }
  | { type: 'PREREQ_MISSING_MONEY_ACCOUNT' }
  | { type: 'PREREQ_UPGRADE_INCOMPLETE' }
  | { type: 'PREREQ_UNSUPPORTED_ACCOUNT' }
  | { type: 'BLOCKCHAIN_BLOCKED' }
  | { type: 'WALLET_LOCKED' }
  | { type: 'WALLET_UNLOCKED' }
  | { type: 'LOOKUP_ACTIVE' }
  | { type: 'LOOKUP_DISABLED' }
  | { type: 'LOOKUP_ABSENT' }
  | { type: 'LOOKUP_FAILED' }
  | { type: 'SIGN_OK' }
  | { type: 'SIGN_REJECTED' }
  | { type: 'SIGN_FAILED'; retryable: boolean }
  | { type: 'SUBMIT_OK' }
  | { type: 'SUBMIT_CONFLICT'; conflictType: ConflictType }
  | { type: 'SUBMIT_TRANSIENT' }
  | { type: 'SUBMIT_VALIDATION'; utcRollover: boolean }
  | { type: 'SUBMIT_TERMINAL' }
  | { type: 'SUBMIT_RATE_LIMITED' }
  | { type: 'RETRY' }
  | { type: 'CANCEL' };

type EventType = WalletRegistrationEvent['type'];

type Handler = (
  state: WalletRegistrationState,
  event: WalletRegistrationEvent,
) => WalletRegistrationState;

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Creates the initial idle state.
 *
 * @param maxAttempts - Optional retry ceiling for sign attempts.
 * @returns A fresh idle machine state.
 */
export function createInitialState(
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): WalletRegistrationState {
  return { status: 'idle', context: { attempts: 0, maxAttempts } };
}

/**
 * Builds a handler that moves to a status while preserving context.
 *
 * @param status - Target status.
 * @returns A handler transitioning to `status`.
 */
function keep(status: WalletRegistrationStatus): Handler {
  return (state) => ({ status, context: state.context });
}

/**
 * Builds a handler that moves to a status and resets the retry context. Used
 * when the user (or app resume) starts a fresh attempt from scratch.
 *
 * @param status - Target status.
 * @returns A handler transitioning to `status` with reset context.
 */
function reset(status: WalletRegistrationStatus): Handler {
  return (state) => ({
    status,
    context: { ...state.context, attempts: 0, conflictType: undefined },
  });
}

/**
 * Moves to `signing` and counts this as a new sign attempt.
 *
 * @param state - Current state.
 * @returns The `signing` state with an incremented attempt count.
 */
const toSigning: Handler = (state) => ({
  status: 'signing',
  context: { ...state.context, attempts: state.context.attempts + 1 },
});

const toPreparing = reset('preparing');
const toAlreadyRegistered = keep('alreadyRegistered');
const toRegisteredDisabled = keep('registeredDisabled');
const toLookupUnavailable = keep('lookupUnavailable');
const toCancelled = keep('cancelled');

const signFailed: Handler = (state, event) => {
  const { retryable } = event as Extract<
    WalletRegistrationEvent,
    { type: 'SIGN_FAILED' }
  >;
  return retryable
    ? keep('failedRetryable')(state, event)
    : keep('failedTerminal')(state, event);
};

const submitConflict: Handler = (state, event) => {
  const { conflictType } = event as Extract<
    WalletRegistrationEvent,
    { type: 'SUBMIT_CONFLICT' }
  >;
  return {
    status: 'disambiguate409',
    context: { ...state.context, conflictType },
  };
};

const submitValidation: Handler = (state, event) => {
  const { utcRollover } = event as Extract<
    WalletRegistrationEvent,
    { type: 'SUBMIT_VALIDATION' }
  >;
  return utcRollover && state.context.attempts < state.context.maxAttempts
    ? toSigning(state, event)
    : keep('failedTerminal')(state, event);
};

const disambiguateAbsent: Handler = (state, event) =>
  state.context.conflictType === 'address-exists'
    ? keep('foreignAddressConflict')(state, event)
    : keep('failedRetryable')(state, event);

const checkThenRetryAbsent: Handler = (state, event) =>
  state.context.attempts < state.context.maxAttempts
    ? toSigning(state, event)
    : keep('failedRetryable')(state, event);

const TABLE: Partial<Record<WalletRegistrationStatus, Partial<Record<EventType, Handler>>>> =
  {
    idle: {
      START: toPreparing,
    },
    preparing: {
      PREREQ_MISSING_CUSTOMER: keep('missingCustomer'),
      PREREQ_MISSING_MONEY_ACCOUNT: keep('missingMoneyAccount'),
      PREREQ_UPGRADE_INCOMPLETE: keep('upgradeIncomplete'),
      PREREQ_UNSUPPORTED_ACCOUNT: keep('unsupportedAccount'),
      BLOCKCHAIN_BLOCKED: keep('blockchainBlocked'),
      WALLET_LOCKED: keep('awaitingUnlock'),
      LOOKUP_ACTIVE: toAlreadyRegistered,
      LOOKUP_DISABLED: toRegisteredDisabled,
      LOOKUP_ABSENT: toSigning,
      LOOKUP_FAILED: toLookupUnavailable,
    },
    awaitingUnlock: {
      WALLET_UNLOCKED: keep('signing'),
    },
    signing: {
      SIGN_OK: keep('submitting'),
      SIGN_REJECTED: toCancelled,
      SIGN_FAILED: signFailed,
      WALLET_LOCKED: keep('awaitingUnlock'),
      CANCEL: toCancelled,
    },
    submitting: {
      SUBMIT_OK: keep('registered'),
      SUBMIT_CONFLICT: submitConflict,
      SUBMIT_TRANSIENT: keep('checkThenRetry'),
      SUBMIT_VALIDATION: submitValidation,
      SUBMIT_TERMINAL: keep('failedTerminal'),
      SUBMIT_RATE_LIMITED: keep('failedRetryable'),
      CANCEL: toCancelled,
    },
    disambiguate409: {
      LOOKUP_ACTIVE: toAlreadyRegistered,
      LOOKUP_DISABLED: toRegisteredDisabled,
      LOOKUP_ABSENT: disambiguateAbsent,
      LOOKUP_FAILED: toLookupUnavailable,
      CANCEL: toCancelled,
    },
    checkThenRetry: {
      LOOKUP_ACTIVE: toAlreadyRegistered,
      LOOKUP_DISABLED: toRegisteredDisabled,
      LOOKUP_ABSENT: checkThenRetryAbsent,
      LOOKUP_FAILED: toLookupUnavailable,
      CANCEL: toCancelled,
    },
    failedRetryable: {
      RETRY: toPreparing,
    },
    lookupUnavailable: {
      RETRY: toPreparing,
    },
    cancelled: {
      RETRY: toPreparing,
    },
    missingCustomer: {
      RETRY: toPreparing,
    },
    missingMoneyAccount: {
      RETRY: toPreparing,
    },
    upgradeIncomplete: {
      RETRY: toPreparing,
    },
  };

/**
 * Pure transition reducer. Unhandled (state, event) pairs are no-ops, which is
 * how the machine enforces "one in-flight operation" (a second `START` while
 * busy is ignored) and how terminal states stay put.
 *
 * @param state - Current machine state.
 * @param event - Event to apply.
 * @returns The next state (or the same state for unhandled events).
 */
export function transition(
  state: WalletRegistrationState,
  event: WalletRegistrationEvent,
): WalletRegistrationState {
  const handler = TABLE[state.status]?.[event.type];
  return handler ? handler(state, event) : state;
}
