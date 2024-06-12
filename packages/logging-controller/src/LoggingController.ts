import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { v1 as random } from 'uuid';

import type { Log } from './logTypes';

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

/**
 * An action to add log messages to the controller state.
 */
export type AddLog = {
  type: `${typeof name}:add`;
  handler: LoggingController['add'];
};

/**
 * Currently only an alias, but the idea here is if future actions are needed
 * this can transition easily into a union type.
 */
export type LoggingControllerActions = AddLog;

export type LoggingControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  LoggingControllerActions,
  never,
  never,
  never
>;

const metadata = {
  logs: { persist: true, anonymous: false },
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
  /**
   * Creates a LoggingController instance.
   *
   * @param options - Constructor options
   * @param options.messenger - An instance of the ControllerMessenger
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: LoggingControllerMessenger;
    state?: Partial<LoggingControllerState>;
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

    this.messagingSystem.registerActionHandler(
      `${name}:add` as const,
      (log: Log) => this.add(log),
    );
  }

  /**
   * Method to generate a randomId and ensures no collision with existing ids.
   *
   * We may want to end up using a hashing mechanism to make ids deterministic
   * by the *data* passed in, and then make each key an array of logs that
   * match that id.
   *
   * @returns unique id
   */
  #generateId(): string {
    let id = random();
    let i = 0;
    while (id in this.state.logs) {
      if (i > 1000) {
        throw new Error('Endless loop');
      }
      id = random();
      i += 1;
    }
    return id;
  }

  /**
   * Add log to the state.
   *
   * @param log - Log to add to the controller
   */
  add(log: Log) {
    const newLog: LogEntry = {
      id: this.#generateId(),
      timestamp: Date.now(),
      log,
    };

    this.update((state) => {
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
