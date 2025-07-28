import type { TransactionMeta } from '@metamask/transaction-controller';

export type CoverageResult = {
  txId: string;
  status: CoverageStatus;
};

export type CoverageStatus = 'covered' | 'malicious' | 'unsupported';

export type ShieldBackend = {
  checkCoverage: (txMeta: TransactionMeta) => Promise<CoverageResult>;
};
