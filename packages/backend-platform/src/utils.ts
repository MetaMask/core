import type { BackendResponse } from './types';

/**
 * Creates a standardized success response.
 *
 * @param data - The response data.
 * @returns A BackendResponse indicating success.
 */
export function createSuccessResponse<T>(data: T): BackendResponse<T> {
  return {
    success: true,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Creates a standardized error response.
 *
 * @param error - The error message.
 * @returns A BackendResponse indicating failure.
 */
export function createErrorResponse(error: string): BackendResponse {
  return {
    success: false,
    error,
    timestamp: Date.now(),
  };
}

/**
 * Validates if a string is a valid environment value.
 *
 * @param env - The environment string to validate.
 * @returns True if the environment is valid.
 */
export function isValidEnvironment(
  env: string,
): env is 'development' | 'staging' | 'production' {
  return ['development', 'staging', 'production'].includes(env);
} 