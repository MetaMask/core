import {
  COW_API_BASE,
  COW_NETWORK_PATHS,
  COWSWAP_PROVIDER_CONFIG,
} from './constants';
import type {
  IntentOrder,
  IntentSubmissionParams,
  IntentOrderStatus,
} from '../../types';
import { IntentOrderStatus as OrderStatus } from '../../types';
import { BaseIntentProvider } from '../base-intent-provider';

/**
 * CowSwap intent provider implementation
 *
 * Handles order submission and status polling for CowSwap intents.
 * Based on the existing CowSwap integration logic from bridge-status-controller.
 */
export class CowSwapProvider extends BaseIntentProvider {
  constructor() {
    super(COWSWAP_PROVIDER_CONFIG);
  }

  getName(): string {
    return 'cowswap';
  }

  getVersion(): string {
    return '1.0.0';
  }

  getSupportedChains(): number[] {
    return Object.keys(COW_NETWORK_PATHS).map(Number);
  }

  async submitOrder(params: IntentSubmissionParams): Promise<IntentOrder> {
    const chainId = params.quote.metadata.chainId as number;
    const networkPath = COW_NETWORK_PATHS[chainId];

    if (!networkPath) {
      throw this.handleError(
        new Error(`Unsupported chain: ${chainId}`),
        'submitOrder',
      );
    }

    try {
      const orderBody = {
        ...(params.quote.metadata?.order || {}),
        feeAmount: '0',
        from: params.userAddress,
        signature: params.signature,
        signingScheme: 'eip712',
      };

      const url = `${COW_API_BASE}/${networkPath}/api/v1/orders`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to submit order: ${response.statusText}`);
      }

      const orderUid = await response.text();
      // remove " in the orderUid
      const escapeOrderUid = orderUid.replace(/"/gu, '');
      const order: IntentOrder = {
        id: escapeOrderUid,
        status: OrderStatus.SUBMITTED,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          chainId,
          networkPath,
          orderBody,
        },
      };

      await this.onOrderSubmitted?.(order);
      return order;
    } catch (error) {
      throw this.handleError(error as Error, 'submitOrder');
    }
  }

  async getOrderStatus(orderId: string, chainId: number): Promise<IntentOrder> {
    const networkPath = COW_NETWORK_PATHS[chainId];
    if (!networkPath) {
      throw this.handleError(
        new Error(`Unsupported chain: ${chainId}`),
        'getOrderStatus',
      );
    }

    try {
      // orderId need to url path friendly
      const urlPathFriendlyOrderId = orderId
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '') // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/gu, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/gu, '') // Remove leading/trailing hyphens
        .replace(/-+/gu, '-'); // Replace multiple hyphens with single
      const url = `${COW_API_BASE}/${networkPath}/api/v1/orders/${urlPathFriendlyOrderId}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to get order status: ${response.statusText}`);
      }

      const data = await response.json();
      const status = this.mapCowSwapStatus(data.status);

      // Try to get transaction hashes from trades endpoint for completed orders
      let txHash: string | undefined;
      let allHashes: string[] = [];

      if (status === OrderStatus.COMPLETED) {
        try {
          const tradesUrl = `${COW_API_BASE}/${networkPath}/api/v1/trades?orderUid=${urlPathFriendlyOrderId}`;
          const tradesResponse = await fetch(tradesUrl);

          if (tradesResponse.ok) {
            const trades = await tradesResponse.json();
            allHashes = Array.isArray(trades)
              ? trades
                  .map(
                    (t: { txHash?: string; transactionHash?: string }) =>
                      t?.txHash || t?.transactionHash,
                  )
                  .filter(
                    (h: unknown): h is string =>
                      typeof h === 'string' && h.length > 0,
                  )
              : [];
            txHash = allHashes[allHashes.length - 1];
          }
        } catch (error) {
          console.warn('Failed to fetch trade hashes:', error);
        }
      }

      const order: IntentOrder = {
        id: orderId,
        status,
        txHash,
        createdAt: new Date(data.creationDate).getTime(),
        updatedAt: Date.now(),
        metadata: {
          ...data,
          allHashes,
          chainId,
          networkPath,
        },
      };

      return order;
    } catch (error) {
      throw this.handleError(error as Error, 'getOrderStatus');
    }
  }

  async cancelOrder(orderId: string, _chainId: number): Promise<boolean> {
    // CowSwap doesn't support order cancellation via API
    // Orders expire naturally based on their validTo timestamp
    console.warn(
      `CowSwap orders cannot be cancelled via API. Order ${orderId} will expire naturally.`,
    );
    return false;
  }

  private mapCowSwapStatus(cowStatus: string): IntentOrderStatus {
    switch (cowStatus) {
      case 'presignaturePending':
      case 'open':
        return OrderStatus.PENDING;
      case 'fulfilled':
        return OrderStatus.COMPLETED;
      case 'cancelled':
        return OrderStatus.CANCELLED;
      case 'expired':
        return OrderStatus.EXPIRED;
      default:
        return OrderStatus.FAILED;
    }
  }
}
