import type { TransactionMeta } from '@metamask/transaction-controller';

export type CoverageResult = {
  status: CoverageStatus;
};

export const coverageStatuses = ['covered', 'malicious', 'unknown'] as const;
export type CoverageStatus = (typeof coverageStatuses)[number];

export type ShieldBackend = {
  checkCoverage: (txMeta: TransactionMeta) => Promise<CoverageResult>;
};
