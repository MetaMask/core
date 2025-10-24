import type { SignatureRequest } from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

export type CoverageResult = {
  coverageId: string;
  message?: string;
  reasonCode?: string;
  status: CoverageStatus;
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

export type DecodedTransactionDataResponse = {
  data: DecodedTransactionDataMethod[];
};

export type DecodedTransactionDataMethod = {
  name: string;
  description?: string;
  params: DecodedTransactionDataParam[];
};

export type DecodedTransactionDataParam = {
  name?: string;
  description?: string;
  type: string;

  // TODO: Fix in https://github.com/MetaMask/metamask-extension/issues/31973
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  children?: DecodedTransactionDataParam[];
};

export type DecodeTransactionDataRequest = {
  transactionData: Hex;
  contractAddress: Hex;
  chainId: Hex;
};

export type DecodeTransactionDataHandler = (
  req: DecodeTransactionDataRequest,
) => Promise<DecodedTransactionDataResponse | undefined>;
