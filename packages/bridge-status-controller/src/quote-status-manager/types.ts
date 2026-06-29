import { BridgeClientId } from '@metamask/bridge-controller';
import { Infer } from '@metamask/superstruct';

import { BridgeStatusControllerMessenger } from '../types';
import {
  QuoteStatusState,
  QuoteStatusUpdateBackendErrorType,
} from './constants';
import { QuoteStatusGetError, QuoteStatusUpdateError } from './errors';
import { QuoteStatusStateFsm } from './quote-status-state-fsm';
import {
  QuoteStatusGetResponseSchema,
  QuoteStatusUpdateResponseSchema,
} from './validators';

/**
 * Persisted queue entry describing a single quote status update attempt.
 */
export type QuoteStatusPersistEntry = {
  /**
   * Unique quote identifier.
   */
  quoteId: string;

  /**
   * Source transaction hash used to correlate updates.
   */
  srcTxHash: string;

  /**
   * Current persisted status lifecycle value.
   */
  status: QuoteStatusState;

  /**
   * Timestamp in milliseconds when the entry was first created.
   */
  createdAt: number;

  /**
   * Timestamp in milliseconds for the most recent attempt.
   */
  lastAttemptAt: number;

  /**
   * Optional transaction metadata identifier assigned after submission.
   */
  txMetaId?: string;

  /**
   * The lifecycle status most recently accepted (2xx) by the backend, if any.
   *
   * Used to avoid redundantly re-sending a status the backend has already
   * acknowledged. In particular, a `Submitted` entry stays tracked while it
   * awaits finalization, and this flag stops the retry loop from re-sending the
   * already-accepted `SUBMITTED` update (which the backend would reject as an
   * invalid/duplicate transition). It is implicitly superseded once the status
   * advances past it (e.g. via {@link QuoteStatusUpdateManager.reportFinalised}).
   */
  acknowledgedState?: QuoteStatusState;
};

/**
 * In-memory queue entry with an FSM instance for status transitions.
 */
export type QuoteStatusRuntimeEntry = Omit<
  QuoteStatusPersistEntry,
  'status'
> & {
  /**
   * Runtime status FSM used to validate and apply transitions.
   */
  status: QuoteStatusStateFsm;
};

/**
 * Validated non-`2xx` response payload from the quote update status API.
 */
export type QuoteStatusUpdateResponse = Infer<
  typeof QuoteStatusUpdateResponseSchema
>;

/**
 * Validated non-`2xx` response payload from the quote get status API.
 */
export type QuoteStatusGetResponse = Infer<typeof QuoteStatusGetResponseSchema>;

/**
 * Options required to create quote status API service instances.
 */
export type QuoteStatusApiServiceOptions = {
  /**
   * Messenger used to retrieve the authentication token.
   */
  messenger: BridgeStatusControllerMessenger;

  /**
   * Bridge client identifier used for request headers.
   */
  clientId: BridgeClientId;

  /**
   * Product name sent as the `x-metamask-clientproduct` header.
   */
  clientProduct: string;

  /**
   * Optional client version sent as the `x-metamask-clientversion` header.
   */
  clientVersion?: string;

  /**
   * Base URL for the quote status API.
   */
  apiBaseUrl: string;

  /**
   * Optional callback invoked when an unexpected error response shape is returned.
   */
  onError?: (error: QuoteStatusUpdateError | QuoteStatusGetError) => void;
};

/**
 * Context information attached to a {@link QuoteStatusUpdateError}.
 */
export type QuoteStatusUpdateErrorDetails = {
  /**
   * Unique quote identifier associated with the error.
   */
  quoteId: string;

  /**
   * Optional error type used to categorize known quote update failures.
   */
  errorType?: QuoteStatusUpdateBackendErrorType;
};

/**
 * Context information attached to a {@link QuoteStatusGetError}.
 */
export type QuoteStatusGetErrorDetails = {
  /**
   * Unique quote identifier associated with the error.
   */
  quoteId: string;

  validationFailures?: string[];
};

/**
 * Construction options for quote status entry store instances.
 */
export type QuoteStatusEntryStoreOptions = {
  /**
   * Callback used to persist the current in-memory queue snapshot.
   */
  onPersistUpdates: (updates: Record<string, QuoteStatusPersistEntry>) => void;
  /**
   * Entry time-to-live in milliseconds before automatic eviction.
   */
  entryTtlMs: number;

  /**
   * Optional initial persisted entries used to seed the store.
   */
  initial?: Record<string, QuoteStatusPersistEntry>;
};

/**
 * Event payload emitted whenever the FSM state changes.
 */
export type QuoteStatusStateUpdateEvent = {
  previousState: QuoteStatusState;
  nextState: QuoteStatusState;
};

/**
 * Listener signature for quote-status state changes.
 */
export type QuoteStatusStateUpdateListener = (
  event: QuoteStatusStateUpdateEvent,
) => void;
