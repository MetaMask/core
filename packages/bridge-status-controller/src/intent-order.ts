import { IntentOrderStatus } from './intent-order-status';

export interface IntentOrder {
  id: string;
  status: IntentOrderStatus;
  txHash?: string;
  metadata: {
    txHashes?: string[] | string;
  };
}
