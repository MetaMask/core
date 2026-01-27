export const DIGEST_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type DigestStatus = (typeof DIGEST_STATUS)[keyof typeof DIGEST_STATUS];

export type DigestData = {
  [key: string]: string | number | boolean | null;
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
