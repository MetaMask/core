export type Claim = {
  chainId: number;
  email: string;
  impactedWalletAddress: `0x${string}`;
  impactedTxHash: `0x${string}`;
  reimbursementWalletAddress: `0x${string}`;
  description: string;
  signature: string;
};

export type ClaimWithoutSignature = Omit<Claim, 'signature'>;

export type ClaimsControllerState = {
  claims: Claim[];
};

export type SubmitClaimConfig = {
  /**
   * The sanitized and validated data to be submitted.
   */
  data: Claim;
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
