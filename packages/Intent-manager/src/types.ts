/**
 * Intent status enumeration
 */
export enum IntentStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Import the constant here to avoid circular dependency
