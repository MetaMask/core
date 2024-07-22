import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
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
declare const name = "LoggingController";
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
export type LoggingControllerMessenger = RestrictedControllerMessenger<typeof name, LoggingControllerActions, never, never, never>;
/**
 * Controller that manages a list of logs for signature requests.
 */
export declare class LoggingController extends BaseController<typeof name, LoggingControllerState, LoggingControllerMessenger> {
    #private;
    /**
     * Creates a LoggingController instance.
     *
     * @param options - Constructor options
     * @param options.messenger - An instance of the ControllerMessenger
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ messenger, state, }: {
        messenger: LoggingControllerMessenger;
        state?: Partial<LoggingControllerState>;
    });
    /**
     * Add log to the state.
     *
     * @param log - Log to add to the controller
     */
    add(log: Log): void;
    /**
     * Removes all log entries.
     */
    clear(): void;
}
export {};
//# sourceMappingURL=LoggingController.d.ts.map