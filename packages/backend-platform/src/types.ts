/**
 * Common types for backend platform utilities.
 */

/**
 * Base configuration interface for backend services.
 */
export interface BackendConfig {
  /**
   * The environment the backend is running in.
   */
  environment: 'development' | 'staging' | 'production';

  /**
   * Optional debug mode flag.
   */
  debug?: boolean;
}

/**
 * Standard response format for backend operations.
 */
export interface BackendResponse<T = unknown> {
  /**
   * Whether the operation was successful.
   */
  success: boolean;

  /**
   * The response data, if successful.
   */
  data?: T;

  /**
   * Error message, if unsuccessful.
   */
  error?: string;

  /**
   * Timestamp of the response.
   */
  timestamp: number;
} 