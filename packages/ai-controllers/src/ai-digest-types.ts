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

/**
 * A cached digest entry. Only successful fetches are stored.
 */
export type DigestEntry = {
  asset: string;
  fetchedAt: number;
  data: DigestData;
};

export type AiDigestControllerState = {
  digests: Record<string, DigestEntry>;
};

export type DigestService = {
  fetchDigest(assetId: string): Promise<DigestData>;
};
