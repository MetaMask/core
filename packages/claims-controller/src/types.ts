import type { Hex } from '@metamask/utils';

import type { ClaimStatusEnum } from './constants';

export type Attachment = {
  publicUrl: string;
  contentType: string;
  originalname: string;
};

export type ClaimsConfigurations = {
  /**
   * The number of days the claim is valid for submission.
   */
  validSubmissionWindowDays: number;

  /**
   * List of supported chain IDs in hexadecimal format.
   */
  supportedNetworks: `0x${string}`[];
};

export type ClaimsConfigurationsResponse = Omit<
  ClaimsConfigurations,
  'supportedNetworks'
> & {
  /**
   * List of supported chain IDs.
   * Claims API response for `supportedNetworks` field (in decimal format).
   */
  networks: number[];
};

export type Claim = {
  id: string;
  shortId: string;
  chainId: string;
  email: string;
  impactedWalletAddress: Hex;
  impactedTxHash: Hex;
  reimbursementWalletAddress: Hex;
  description: string;
  signature: Hex;
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
  /**
   * List of claims.
   */
  claims: Claim[];

  /**
   * The claims configurations.
   * This is used to store the claims configurations fetched from the backend.
   */
  claimsConfigurations: ClaimsConfigurations;
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
