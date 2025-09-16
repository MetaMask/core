import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

export type CoverageResult = {
  coverageId: string;
  status: CoverageStatus;
};

export const coverageStatuses = ['covered', 'malicious', 'unknown'] as const;
export type CoverageStatus = (typeof coverageStatuses)[number];

export type ShieldBackend = {
  checkCoverage: (txMeta: TransactionMeta) => Promise<CoverageResult>;
  checkSignatureCoverage: (
    signatureRequest: SignatureRequest,
  ) => Promise<CoverageResult>;
};
