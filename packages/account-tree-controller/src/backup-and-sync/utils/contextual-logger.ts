const LOG_PREFIX = '[AccountTreeController - Backup and sync] ';

/**
 * Simple console wrapper with a prefix for easier filtering in browser console
 */
export const contextualLogger = {
  log: (...args: Parameters<typeof console.log>) =>
    console.log(LOG_PREFIX, ...args),
  warn: (...args: Parameters<typeof console.warn>) =>
    console.warn(LOG_PREFIX, ...args),
  info: (...args: Parameters<typeof console.info>) =>
    console.info(LOG_PREFIX, ...args),
  error: (...args: Parameters<typeof console.error>) =>
    console.error(LOG_PREFIX, ...args),
  debug: (...args: Parameters<typeof console.debug>) =>
    console.debug(LOG_PREFIX, ...args),
};
