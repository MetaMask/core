import {
  COW_API_BASE,
  COW_NETWORK_PATHS,
  COW_SETTLEMENT_CONTRACT,
  COWSWAP_PROVIDER_CONFIG,
} from './constants';
import type {
  IntentQuote,
  IntentQuoteRequest,
  IntentOrder,
  IntentSubmissionParams,
  IntentOrderStatus,
} from '../../types';
import { IntentOrderStatus as OrderStatus } from '../../types';
import { BaseIntentProvider } from '../base-intent-provider';

/**
 * CowSwap quote response interface
 */
type CowSwapQuoteResponse = {
  id?: string;
  buyAmount?: string;
  estimatedGas?: string;
  priceImpact?: number;
  feeAmount?: string;
  validTo?: number;
  order?: Record<string, unknown>;
  settlementContract?: string;
};

/**
 * CowSwap intent provider implementation
 *
 * Handles quote generation, order submission, and status polling for CowSwap intents.
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

  async generateQuote(request: IntentQuoteRequest): Promise<IntentQuote> {
    const networkPath = COW_NETWORK_PATHS[request.srcChainId];
    if (!networkPath) {
      throw this.handleError(
        new Error(`Unsupported chain: ${request.srcChainId}`),
        'generateQuote',
      );
    }

    try {
      // Implementation for CowSwap quote generation
      // This would call the actual CowSwap API
      const response = await this.fetchQuote(request, networkPath);

      const quote: IntentQuote = {
        id: response.id || `cow-${Date.now()}`,
        provider: this.getName(),
        srcAmount: request.amount,
        destAmount: response.buyAmount || '0',
        estimatedGas: response.estimatedGas || '21000',
        estimatedTime: 300, // 5 minutes typical for CowSwap
        priceImpact: response.priceImpact || 0,
        fees: [
          {
            type: 'protocol',
            amount: response.feeAmount || '0',
            token: request.srcTokenAddress,
          },
        ],
        validUntil: response.validTo || Date.now() + 300000, // 5 minutes from now
        metadata: {
          order: response.order,
          settlementContract:
            response.settlementContract || COW_SETTLEMENT_CONTRACT,
          chainId: request.srcChainId,
          networkPath,
        },
      };

      await this.onQuoteGenerated?.(quote);
      return quote;
    } catch (error) {
      throw this.handleError(error as Error, 'generateQuote');
    }
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

      const order: IntentOrder = {
        id: orderUid,
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
      const url = `${COW_API_BASE}/${networkPath}/api/v1/orders/${orderId}`;
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
          const tradesUrl = `${COW_API_BASE}/${networkPath}/api/v1/trades?orderUid=${orderId}`;
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

  async cancelOrder(orderId: string, chainId: number): Promise<boolean> {
    // CowSwap doesn't support order cancellation via API
    // Orders expire naturally based on their validTo timestamp
    console.warn(
      `CowSwap orders cannot be cancelled via API. Order ${orderId} will expire naturally.`,
    );
    return false;
  }

  async validateQuoteRequest(request: IntentQuoteRequest): Promise<boolean> {
    // Basic validation - check if chain is supported
    if (!this.getSupportedChains().includes(request.srcChainId)) {
      return false;
    }

    // Additional validation could be added here
    // e.g., token address validation, amount validation, etc.
    return true;
  }

  async estimateGas(quote: IntentQuote): Promise<string> {
    // CowSwap uses meta-transactions, so gas estimation is minimal
    // The actual settlement is handled by solvers
    return '21000';
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

  private async fetchQuote(
    request: IntentQuoteRequest,
    networkPath: string,
  ): Promise<CowSwapQuoteResponse> {
    // TODO: Implement actual CowSwap quote API call
    // For now, return a mock response structure
    // This logic currently was handled by the Birdge controller call our bridge API backend
    throw new Error('CowSwap quote fetching not yet implemented');
  }
}
