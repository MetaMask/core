/**
 * Get current environment.
 * In Core monorepo context, we always assume production unless explicitly configured.
 *
 * @returns 'DEV' for development, 'PROD' for production
 */
export const getEnvironment = (): 'DEV' | 'PROD' => {
  // Core monorepo doesn't have direct access to process.env in browser context
  // Environment should be configured through the platform's dependency injection
  return 'PROD';
};
