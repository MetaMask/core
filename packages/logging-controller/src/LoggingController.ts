import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { v1 as random } from 'uuid';

/**
 * Defines the types of logs that may be added to this controller's state.
 * Currently only one special case is defined, EthSignLog, for all signing
 * requests. However, future special cases can be added that have stricter
 * data types and may make indexing those types of events easier.
 */
export enum LogType {
  EthSignLog = 'EthSignLog',
  GenericLog = 'GenericLog',
}

/**
 * First special case of logging scenarios involves signing requests. In this
 * case the data provided must include the method for the signature request as
 * well as the signingData. This is intended to be used to troubleshoot and
 * investigate FLI at the user's request.
 */
export type EthSignLog = {
  type: LogType.EthSignLog;
  data: {
    signingMethod:
      | 'eth_sign'
      | 'personal_sign'
      | 'eth_signTypedData'
      | 'eth_signTypedData_v3'
      | 'eth_signTypedData_v4';
    stage: 'proposed' | 'signed' | 'rejected';
    signingData?: any;
  };
};

/**
 * The controller can handle any kind of log statement that may benefit users
 * and MetaMask support agents helping those users. These logs are typed as
 * generic.
 */
export type GenericLog = {
  type: LogType.GenericLog;
  data: any;
};

/**
 * Union of all possible log data structures.
 */
export type Log = EthSignLog | GenericLog;

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

export type AddLog = {
  type: `${typeof name}:add`;
  handler: LoggingController['addLog'];
};

export type LoggingControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  AddLog,
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
export class LoggingController extends BaseControllerV2<
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
      (log: Log) => this.addLog(log),
    );
  }

  /**
   * Recursive method to ensure no collisions of ids.
   *
   * We may want to end up using a hashing mechanism to make ids deterministic
   * by the *data* passed in, and then make each key an array of logs that
   * match that id.
   *
   * @returns unique id
   */
  generateId(): string {
    const id = random();
    if (this.state.logs[id]) {
      return this.generateId();
    }
    return id;
  }

  /**
   * Add log to the state.
   *
   * @param log - Log to add to the controller
   */
  addLog(log: Log) {
    const newLog: LogEntry = {
      id: this.generateId(),
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

export default LoggingController;
