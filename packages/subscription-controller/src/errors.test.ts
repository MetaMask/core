import {
  createSentryError,
  getErrorFromResponse,
  SubscriptionServiceError,
} from './errors';

type MockResponseOptions = {
  status?: number;
  contentType?: string | null;
  jsonData?: unknown;
  textData?: string;
  jsonThrows?: boolean;
  data?: string;
};

function createMockResponse({
  status = 500,
  contentType = 'application/json',
  jsonData = {},
  textData = 'plain error',
  jsonThrows = false,
  data,
}: MockResponseOptions): Response {
  return {
    status,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'content-type' ? contentType : null,
    },
    json: jsonThrows
      ? jest.fn().mockRejectedValue(new Error('bad json'))
      : jest.fn().mockResolvedValue(jsonData),
    text: jest.fn().mockResolvedValue(textData),
    data,
  } as unknown as Response;
}

describe('errors', () => {
  describe('SubscriptionServiceError', () => {
    it('sets name and cause', () => {
      const cause = new Error('root cause');
      const error = new SubscriptionServiceError('message', { cause });

      expect(error.name).toBe('SubscriptionServiceError');
      expect(error.message).toBe('message');
      expect(error.cause).toBe(cause);
    });
  });

  describe('createSentryError', () => {
    it('wraps the cause on the error', () => {
      const cause = new Error('inner');
      const error = createSentryError('outer', cause);

      expect(error.message).toBe('outer');
      expect((error as Error & { cause: Error }).cause).toBe(cause);
    });
  });

  describe('getErrorFromResponse', () => {
    it('uses JSON error message when content-type is json', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 400,
        jsonData: { error: 'Bad request' },
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toContain('error: Bad request');
      expect(error.message).toContain('statusCode: 400');
    });

    it('uses JSON message when error field is missing', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 422,
        jsonData: { message: 'Unprocessable' },
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toContain('error: Unprocessable');
      expect(error.message).toContain('statusCode: 422');
    });

    it('uses Unknown error when JSON has no message', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 418,
        jsonData: { detail: 'teapot' },
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toContain('error: Unknown error');
      expect(error.message).toContain('statusCode: 418');
    });

    it('uses text body when content-type is text/plain', async () => {
      const response = createMockResponse({
        contentType: 'text/plain',
        status: 503,
        textData: 'Service unavailable',
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toContain('error: Service unavailable');
      expect(error.message).toContain('statusCode: 503');
    });

    it('uses response data when content-type is missing', async () => {
      const response = createMockResponse({
        contentType: null,
        status: 500,
        data: 'fallback data',
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toContain('error: fallback data');
      expect(error.message).toContain('statusCode: 500');
    });

    it('uses Unknown error when response data is not a string', async () => {
      const response = createMockResponse({
        contentType: null,
        status: 500,
        data: { code: 'UNKNOWN' } as unknown as string,
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toContain('error: Unknown error');
      expect(error.message).toContain('statusCode: 500');
    });

    it('returns generic HTTP error when parsing fails', async () => {
      const response = createMockResponse({
        contentType: 'application/json',
        status: 502,
        jsonThrows: true,
      });

      const error = await getErrorFromResponse(response);

      expect(error.message).toBe('HTTP 502 error');
    });
  });
});
