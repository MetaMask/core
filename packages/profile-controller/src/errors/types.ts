/** A field-level detail from a Profile API error response. */
export type ProfileServiceErrorDetail = {
  field?: string;
  code: string;
  message: string;
  meta?: Record<string, unknown>;
};

/** Classification metadata for a Profile API error code. */
export type ProfileServiceErrorCodeInfo = {
  id: string;
  http_status: number;
  category: string;
  retryable: boolean;
};

/** The Profile API error envelope returned on a non-2xx response. */
export type ProfileServiceApiError = {
  statusCode?: number;
  error?: string;
  code?: string;
  code_info?: ProfileServiceErrorCodeInfo;
  message?: string | unknown[];
  requestId?: string;
  traceId?: string;
  retryable?: boolean;
  details?: ProfileServiceErrorDetail[];
};
