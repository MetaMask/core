import type { TransactionParams } from '@metamask/transaction-controller';

export type CoverageResult = {
  txId: string;
  status: CoverageStatus;
};

export type CoverageStatus = 'success' | 'error';

export type ShieldBackend = {
  checkCoverage: (txParams: TransactionParams) => Promise<CoverageResult>;
};
