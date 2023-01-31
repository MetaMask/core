import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { v1 as random } from 'uuid';

export enum LogType {
  eth_sign_proposed = 'eth_sign_proposed',
  eth_sign_signed = 'eth_sign_signed',
  eth_sign_rejected = 'eth_sign_rejected',
  personal_sign_proposed = 'personal_sign_proposed',
  personal_sign_signed = 'personal_sign_signed',
  personal_sign_rejected = 'personal_sign_rejected',
  eth_signTypedData_proposed = 'eth_signTypedData_proposed',
  eth_signTypedData_signed = 'eth_signTypedData_signed',
  eth_signTypedData_rejected = 'eth_signTypedData_rejected',
  eth_signTypedData_v3_proposed = 'eth_signTypedData_v3',
  eth_signTypedData_v3_signed = 'eth_signTypedData_v3',
  eth_signTypedData_v3_rejected = 'eth_signTypedData_v3',
  eth_signTypedData_v4_proposed = 'eth_signTypedData_v4_proposed',
  eth_signTypedData_v4_signed = 'eth_signTypedData_v4_signed',
  eth_signTypedData_v4_rejected = 'eth_signTypedData_v4_rejected',
}

/**
 * @type Log
 *
 * Log representation
 * @property id - Generated UUID associated with this log
 * @property timestamp - Timestamp associated with this log
 * @property type - Type of signature request
 * @property data - Additional data about signature request
 */
export interface Log {
  id: string;
  timestamp: number;
  type: LogType;
  data?: any;
}

/**
 * @type LogsState
 *
 * Logging controller state
 * @property logs - Array of Logs
 */
export interface LogsState extends BaseState {
  logs: Log[];
}

/**
 * Controller that manages a list of logs for signature requests.
 */
export class LoggingController extends BaseController<BaseConfig, LogsState> {
  /**
   * Creates an LoggingController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(config?: Partial<BaseConfig>, state?: Partial<LogsState>) {
    super(config, state);

    this.defaultState = { logs: [] };

    this.initialize();
  }

  /**
   * Add log to the state.
   *
   * @param data - Data from signature reqest that is being added to list.
   * @param type - Type of signature request.
   */
  addLog(data: any, type: LogType) {
    const newLog: Log = {
      data,
      id: random(),
      timestamp: Date.now(),
      type,
    };

    this.state.logs.forEach(async (log) => {
      if (log.id !== newLog.id) {
        this.update({
          logs: [...this.state.logs, newLog],
        });
      }
    });
  }

  /**
   * Removes all log entries.
   */
  clear() {
    this.update({ logs: [] });
  }
}

export default LoggingController;
