import { IntentOrderStatus } from './intent-order-status';

export type IntentOrder = {
  id: string;
  status: IntentOrderStatus;
  txHash?: string;
  metadata: {
    txHashes?: string[] | string;
  };
};
