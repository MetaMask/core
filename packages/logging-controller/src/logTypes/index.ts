import type { EthSignLog } from './EthSignLog.js';
import type { GenericLog } from './GenericLog.js';

/**
 * Union of all possible log data structures.
 */
export type Log = EthSignLog | GenericLog;

/**
 * Export all other types from these files for usage by clients
 */
export * from './EthSignLog.js';
export type * from './GenericLog.js';
export * from './LogType.js';
