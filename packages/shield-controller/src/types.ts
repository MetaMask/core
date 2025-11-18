import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

export type CoverageResult = {
  coverageId: string;
  message?: string;
  reasonCode?: string;
  status: CoverageStatus;
  metrics: {
    latency?: number;
  };
};

export const coverageStatuses = ['covered', 'malicious', 'unknown'] as const;
export type CoverageStatus = (typeof coverageStatuses)[number];

export type LogSignatureRequest = {
  signatureRequest: SignatureRequest;
  signature: string;
  status: string;
};

export type LogTransactionRequest = {
  txMeta: TransactionMeta;
  transactionHash: string;
  rawTransactionHex: string;
  status: string;
};

export type CheckCoverageRequest = {
  coverageId?: string;
  txMeta: TransactionMeta;
};

export type CheckSignatureCoverageRequest = {
  coverageId?: string;
  signatureRequest: SignatureRequest;
};

export type ShieldBackend = {
  logSignature: (req: LogSignatureRequest) => Promise<void>;
  logTransaction: (req: LogTransactionRequest) => Promise<void>;
  checkCoverage: (req: CheckCoverageRequest) => Promise<CoverageResult>;
  checkSignatureCoverage: (
    req: CheckSignatureCoverageRequest,
  ) => Promise<CoverageResult>;
};

export type NormalizeSignatureRequestFn = (
  signatureRequest: SignatureRequest,
) => SignatureRequest;
