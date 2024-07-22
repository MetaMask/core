import type { EthSignLog } from './EthSignLog';
import type { GenericLog } from './GenericLog';
/**
 * Union of all possible log data structures.
 */
export type Log = EthSignLog | GenericLog;
/**
 * Export all other types from these files for usage by clients
 */
export * from './EthSignLog';
export * from './GenericLog';
export * from './LogType';
//# sourceMappingURL=index.d.ts.map