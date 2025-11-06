import type { ClaimStatusEnum } from './constants';

export type Attachment = {
  publicUrl: string;
  contentType: string;
  originalname: string;
};

export type Claim = {
  id?: string;
  shortId?: string;
  chainId: number;
  email: string;
  impactedWalletAddress: `0x${string}`;
  impactedTxHash: `0x${string}`;
  reimbursementWalletAddress: `0x${string}`;
  description: string;
  signature: string;
  attachments?: Attachment[];
  status: ClaimStatusEnum;
  createdAt: string;
  updatedAt: string;
  intercomId?: string;
};

export type CreateClaimRequest = Omit<
  Claim,
  'id' | 'shortId' | 'createdAt' | 'updatedAt' | 'intercomId' | 'status'
>;

export type ClaimsControllerState = {
  claims: Claim[];
};

export type SubmitClaimConfig = {
  /**
   * The sanitized and validated data to be submitted.
   */
  data: CreateClaimRequest;
  /**
   * The headers to be used in the request.
   */
  headers: Record<string, string>;
  /**
   * The HTTP method to submit.
   */
  method: 'POST';
  /**
   * The URL to submit the claim to.
   */
  url: string;
};

export type GenerateSignatureMessageResponse = {
  message: string;
  nonce: string;
};

export type VerifyClaimSignatureResponse = {
  message: string;
  success: boolean;
};
