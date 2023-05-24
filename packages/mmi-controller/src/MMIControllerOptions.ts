import { TransactionUpdateController } from '@metamask-institutional/transaction-update';

export type MMIControllerOptions = {
  keyringController: any;
  txController: any;
  securityProviderRequest: any;
  appStateController: any;
  addKeyringIfNotExists: any;
  getState: any;
  getPendingNonce: any;
  accountTracker: any;
  metaMetricsController: any;
  transactionUpdateController: TransactionUpdateController;
  networkController: any;
  platform: any;
  extension: any;
  captureException?: (error: Error) => void;
  request?: (request: { method: string, params?: Array<any> }) => Promise<any>
}
