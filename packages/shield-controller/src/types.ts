import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

export type CoverageResult = {
  coverageId: string;
  status: CoverageStatus;
};

export const coverageStatuses = ['covered', 'malicious', 'unknown'] as const;
export type CoverageStatus = (typeof coverageStatuses)[number];

export type LogSignatureRequest = {
  coverageId?: string;
  signatureRequest?: SignatureRequest;
  signature: string;
  status: string;
};

export type LogTransactionRequest = {
  coverageId?: string;
  txMeta?: TransactionMeta;
  transactionHash: string;
  status: string;
};

export type ShieldBackend = {
  logSignature: (req: LogSignatureRequest) => Promise<void>;
  logTransaction: (req: LogTransactionRequest) => Promise<void>;
  checkCoverage: (txMeta: TransactionMeta) => Promise<CoverageResult>;
  checkSignatureCoverage: (
    signatureRequest: SignatureRequest,
  ) => Promise<CoverageResult>;
};
