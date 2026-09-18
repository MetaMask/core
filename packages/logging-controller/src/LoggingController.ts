import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { Duration, inMilliseconds } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import type { LoggingControllerMethodActions } from './LoggingController-method-action-types.js';
import type { Log } from './logTypes/index.js';

/**
 * LogEntry is the entry that will be added to the logging controller state.
 * It consists of a entry key that must be on of the Log union types, and an
 * additional id and timestamp.
 */
export type LogEntry = {
  id: string;
  timestamp: number;
  log: Log;
};

/**
 * Logging controller state
 *
 * @property logs - An object of logs indexed by their ids
 */
export type LoggingControllerState = {
  logs: {
    [id: string]: LogEntry;
  };
};

const name = 'LoggingController';

const MESSENGER_EXPOSED_METHODS = ['add', 'clear'] as const;

export type LoggingControllerGetStateAction = ControllerGetStateAction<
  typeof name,
  LoggingControllerState
>;

export type LoggingControllerActions =
  | LoggingControllerGetStateAction
  | LoggingControllerMethodActions;

export type LoggingControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof name,
  LoggingControllerState
>;

export type LoggingControllerEvents = LoggingControllerStateChangeEvent;

export type LoggingControllerMessenger = Messenger<
  typeof name,
  LoggingControllerActions,
  LoggingControllerEvents
>;

const metadata: StateMetadata<LoggingControllerState> = {
  logs: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

const defaultState = {
  logs: {},
};

/**
 * Controller that manages a list of logs for signature requests.
 */
export class LoggingController extends BaseController<
  typeof name,
  LoggingControllerState,
  LoggingControllerMessenger
> {
  readonly #expiryTime: number;

  /**
   * Creates a LoggingController instance.
   *
   * @param options - Constructor options
   * @param options.messenger - An instance of the Messenger
   * @param options.state - Initial state to set on this controller.
   * @param options.expiryTime - The number of milliseconds before we consider a log entry expired.
   */
  constructor({
    messenger,
    state,
    expiryTime = inMilliseconds(7, Duration.Day),
  }: {
    messenger: LoggingControllerMessenger;
    state?: Partial<LoggingControllerState>;
    expiryTime?: number;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.#expiryTime = expiryTime;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Add log to the state.
   *
   * @param log - Log to add to the controller
   */
  add(log: Log) {
    const newLog: LogEntry = {
      id: uuid(),
      timestamp: Date.now(),
      log,
    };

    const expiry = Date.now() - this.#expiryTime;

    this.update((state) => {
      for (const [id, entry] of Object.entries(state.logs)) {
        if (entry.timestamp < expiry) {
          delete state.logs[id];
        }
      }
      state.logs[newLog.id] = newLog;
    });
  }

  /**
   * Removes all log entries.
   */
  clear() {
    this.update((state) => {
      state.logs = {};
    });
  }
}
