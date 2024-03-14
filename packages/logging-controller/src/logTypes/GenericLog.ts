import type { LogType } from './LogType';

/*
 * The logging controller can handle any kind of log statement that may benefit
 * users and MetaMask support agents helping those users. These logs are typed
 * as generic.
 */
export type GenericLog = {
  type: LogType.GenericLog;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};
