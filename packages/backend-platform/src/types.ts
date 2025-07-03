/**
 * Common types for backend platform utilities.
 * Includes keyring-api compatible transaction and balance types.
 */

import type { 
  Transaction,
  AccountBalancesUpdatedEvent,
  AccountBalancesUpdatedEventPayload
} from '@metamask/keyring-api';
import { TransactionStatus, KeyringEvent } from '@metamask/keyring-api';

// =============================================================================
// Re-exports from keyring-api
// =============================================================================

/**
 * Re-export the standard types from keyring-api
 * These are the canonical transaction formats defined in:
 * https://github.com/MetaMask/accounts/blob/main/packages/keyring-api/src/api/transaction.ts#L185-L241
 */
export type { 
  Transaction,
  TransactionType,
  TransactionStatus,
  FeeType
} from '@metamask/keyring-api';

/**
 * Re-export the standard balance event types from keyring-api
 * These are defined in:
 * https://github.com/MetaMask/accounts/blob/main/packages/keyring-api/src/events.ts#L150-L178
 */
export type { 
  AccountBalancesUpdatedEvent,
  AccountBalancesUpdatedEventPayload
} from '@metamask/keyring-api';

// =============================================================================
// Backend Platform Base Types
// =============================================================================

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

// =============================================================================
// Transaction and Balance Types
// =============================================================================

/**
 * Transaction confirmation message using keyring-api balance structure
 * 
 * This uses the official AccountBalancesUpdatedEventPayload structure
 * for better integration with the MetaMask keyring system.
 */
export type TransactionWithKeyringBalanceUpdate = {
  /**
   * The transaction data using the standard keyring-api Transaction format
   */
  tx: Transaction;
  
  /**
   * The updated balances using the official keyring-api balance structure
   * This follows the AccountBalancesUpdatedEventPayload format from:
   * https://github.com/MetaMask/accounts/blob/main/packages/keyring-api/src/events.ts#L150-L178
   */
  balances: AccountBalancesUpdatedEventPayload;
};

/**
 * WebSocket message type for transaction confirmations with balance updates
 */
export type TransactionConfirmationMessage = {
  type: 'transaction_confirmation';
  payload: TransactionWithKeyringBalanceUpdate;
};

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a transaction has keyring balance updates
 */
export function isTransactionWithKeyringBalanceUpdate(
  data: unknown
): data is TransactionWithKeyringBalanceUpdate {
  return (
    typeof data === 'object' &&
    data !== null &&
    'tx' in data &&
    'balances' in data &&
    typeof (data as any).balances === 'object'
  );
}

// =============================================================================
// Utility Classes
// =============================================================================

/**
 * Utility functions for working with keyring-api transaction and balance data
 */
export class TransactionUtils {
  /**
   * Extract chain ID from chain string (e.g., "eip155:42161" -> "42161")
   */
  static extractChainId(chain: string): string {
    const parts = chain.split(':');
    return parts[parts.length - 1];
  }

  /**
   * Parse asset type to extract contract address (for ERC20 tokens)
   */
  static parseAssetType(assetType: string): {
    standard: string; // "native" or "erc20"
    contractAddress?: string;
    chainId: string;
  } {
    // Format: "eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831"
    // or: "eip155:42161/native:eth"
    const [chainPart, assetPart] = assetType.split('/');
    const chainId = this.extractChainId(chainPart);
    
    if (assetPart.startsWith('native:')) {
      return {
        standard: 'native',
        chainId,
      };
    } else if (assetPart.startsWith('erc20:')) {
      return {
        standard: 'erc20',
        contractAddress: assetPart.split(':')[1],
        chainId,
      };
    }
    
    throw new Error(`Unknown asset type format: ${assetType}`);
  }

  /**
   * Calculate total transaction value in native currency
   */
  static calculateTransactionValue(tx: Transaction): {
    totalSent: Record<string, string>; // unit -> amount
    totalReceived: Record<string, string>; // unit -> amount
    totalFees: Record<string, string>; // unit -> amount
  } {
    const totalSent: Record<string, string> = {};
    const totalReceived: Record<string, string> = {};
    const totalFees: Record<string, string> = {};

    // Sum sent amounts
    tx.from.forEach(participant => {
      if (participant.asset && participant.asset.fungible) {
        const unit = participant.asset.unit;
        totalSent[unit] = (parseFloat(totalSent[unit] || '0') + parseFloat(participant.asset.amount)).toString();
      }
    });

    // Sum received amounts
    tx.to.forEach(participant => {
      if (participant.asset && participant.asset.fungible) {
        const unit = participant.asset.unit;
        totalReceived[unit] = (parseFloat(totalReceived[unit] || '0') + parseFloat(participant.asset.amount)).toString();
      }
    });

    // Sum fee amounts
    tx.fees.forEach(fee => {
      if (fee.asset.fungible) {
        const unit = fee.asset.unit;
        totalFees[unit] = (parseFloat(totalFees[unit] || '0') + parseFloat(fee.asset.amount)).toString();
      }
    });

    return { totalSent, totalReceived, totalFees };
  }

  /**
   * Check if transaction affects a specific address
   */
  static transactionAffectsAddress(tx: Transaction, address: string): boolean {
    const normalizedAddress = address.toLowerCase();
    
    // Check if address is the main account
    if (tx.account.toLowerCase() === normalizedAddress) {
      return true;
    }

    // Check if address is in from participants
    const fromAddresses = tx.from.map(p => p.address.toLowerCase());
    if (fromAddresses.includes(normalizedAddress)) {
      return true;
    }

    // Check if address is in to participants
    const toAddresses = tx.to.map(p => p.address.toLowerCase());
    if (toAddresses.includes(normalizedAddress)) {
      return true;
    }

    return false;
  }

  /**
   * Convert keyring-api transaction to simplified format for compatibility
   */
  static convertToSimplifiedTransaction(tx: Transaction): {
    hash: string;
    from: string;
    to?: string;
    value: string;
    chainId: string;
    status: string;
    timestamp: number;
    confirmations: number;
  } {
    const chainId = this.extractChainId(tx.chain);
    const mainFrom = tx.from[0]?.address || tx.account;
    const mainTo = tx.to[0]?.address;
    const mainValue = tx.from[0]?.asset && tx.from[0]?.asset.fungible ? tx.from[0]?.asset.amount || '0' : '0';

    return {
      hash: tx.id,
      from: mainFrom,
      to: mainTo,
      value: mainValue,
      chainId,
      status: tx.status,
      timestamp: tx.timestamp || Date.now(),
      confirmations: tx.status === TransactionStatus.Confirmed ? 6 : 0,
    };
  }

  /**
   * Validate transaction structure against keyring-api format
   */
  static validateTransaction(tx: unknown): tx is Transaction {
    if (typeof tx !== 'object' || tx === null) {
      return false;
    }

    const transaction = tx as any;
    
    return (
      typeof transaction.id === 'string' &&
      typeof transaction.chain === 'string' &&
      typeof transaction.account === 'string' &&
      typeof transaction.status === 'string' &&
      typeof transaction.type === 'string' &&
      Array.isArray(transaction.from) &&
      Array.isArray(transaction.to) &&
      Array.isArray(transaction.fees) &&
      Array.isArray(transaction.events)
    );
  }

  /**
   * Create a transaction confirmation message using keyring-api balance format
   */
  static createTransactionWithKeyringBalanceUpdate(
    tx: Transaction,
    balances: AccountBalancesUpdatedEventPayload['balances']
  ): TransactionWithKeyringBalanceUpdate {
    return {
      tx,
      balances,
    };
  }

  /**
   * Create a transaction confirmation message
   */
  static createTransactionConfirmationMessage(
    tx: Transaction,
    balances: AccountBalancesUpdatedEventPayload['balances']
  ): TransactionConfirmationMessage {
    return {
      type: 'transaction_confirmation',
      payload: {
        tx,
        balances,
      },
    };
  }

  /**
   * Create an AccountBalancesUpdatedEvent from transaction balance updates
   */
  static createAccountBalancesUpdatedEvent(
    balances: AccountBalancesUpdatedEventPayload['balances']
  ): AccountBalancesUpdatedEvent {
    return {
      method: KeyringEvent.AccountBalancesUpdated,
      params: {
        balances,
      },
    };
  }
} 