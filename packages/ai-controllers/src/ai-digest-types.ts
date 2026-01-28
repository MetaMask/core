export const DIGEST_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type DigestStatus = (typeof DIGEST_STATUS)[keyof typeof DIGEST_STATUS];

/**
 * Response from the digest API.
 */
export type DigestData = {
  id: string;
  assetId: string;
  assetSymbol?: string;
  digest: string;
  generatedAt: string;
  processingTime: number;
  success: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type DigestEntry = {
  asset: string;
  status: DigestStatus;
  fetchedAt?: number;
  data?: DigestData;
  error?: string;
};

export type AiDigestControllerState = {
  digests: Record<string, DigestEntry>;
};

export type DigestService = {
  fetchDigest(assetId: string): Promise<DigestData>;
};
